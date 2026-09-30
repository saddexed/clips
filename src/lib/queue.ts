import { database } from "./database";
import { toStoredPath } from "./paths";

export type VideoJobData = { videoId: string; filePath: string };
export type QueueStatus = "wait" | "active" | "completed" | "failed";
export type JobPauseMode = "paused" | "run" | null;
export type QueueJob = {
  id: number;
  name: string;
  videoId: string;
  data: VideoJobData;
  progress: number;
  status: QueueStatus;
  paused: boolean;
  pauseMode: JobPauseMode;
  failedReason: string | null;
  timestamp: number;
  attempts: number;
  title: string | null;
  originalSize: number;
  processedSize: number;
};

type QueueJobRow = {
  id: number;
  name: string;
  video_id: string;
  payload: string;
  progress: number;
  status: QueueStatus;
  failed_reason: string | null;
  created_at: string;
  attempts: number;
  title: string | null;
  original_size: number;
  processed_size: number;
};

const PAUSED_KEY = "video-jobs:paused";
const JOB_MODE_PREFIX = "video-jobs:mode:";
const LEASE_MS = 30 * 60 * 1000;

function now() {
  return new Date().toISOString();
}
function parseJobData(payload: string): VideoJobData {
  try {
    const data: unknown = JSON.parse(payload);
    if (
      typeof data !== "object" ||
      data === null ||
      typeof (data as VideoJobData).videoId !== "string" ||
      typeof (data as VideoJobData).filePath !== "string"
    ) {
      throw new Error("Invalid job payload");
    }
    return data as VideoJobData;
  } catch (error) {
    throw new Error("Unable to decode queued job payload", { cause: error });
  }
}

function jobModeKey(id: number) {
  return `${JOB_MODE_PREFIX}${id}`;
}

function getJobPauseMode(id: number): JobPauseMode {
  const value = database.query<{ value: string }, [string]>("SELECT value FROM queue_state WHERE key = ?").get(jobModeKey(id))?.value;
  return value === "paused" || value === "run" ? value : null;
}

export function isJobPaused(id: number): boolean {
  const mode = getJobPauseMode(id);
  return mode === "paused" || (isQueuePaused() && mode !== "run");
}

function mapJob(row: QueueJobRow, globalPaused = isQueuePaused()): QueueJob {
  const pauseMode = getJobPauseMode(row.id);
  return {
    id: row.id,
    name: row.name,
    videoId: row.video_id,
    data: parseJobData(row.payload),
    progress: row.progress,
    status: row.status,
    pauseMode,
    paused: (row.status === "wait" || row.status === "active") &&
      (pauseMode === "paused" || (globalPaused && pauseMode !== "run")),
    failedReason: row.failed_reason,
    timestamp: new Date(row.created_at).getTime(),
    attempts: row.attempts,
    title: row.title,
    originalSize: Number(row.original_size || 0),
    processedSize: Number(row.processed_size || 0),
  };
}

export function enqueueVideoJob(data: VideoJobData): QueueJob {
  const timestamp = now();
  const normalizedData = { ...data, filePath: toStoredPath(data.filePath) };
  const result = database
    .query(
      "INSERT INTO queue_jobs (name, video_id, payload, created_at) VALUES (?, ?, ?, ?)",
    )
    .run("process-video", data.videoId, JSON.stringify(normalizedData), timestamp);
  const id = Number(result.lastInsertRowid);
  return {
    id,
    name: "process-video",
    videoId: data.videoId,
    data: normalizedData,
    progress: 0,
    status: "wait",
    paused: isQueuePaused(),
    pauseMode: null,
    failedReason: null,
    timestamp: new Date(timestamp).getTime(),
    attempts: 0,
    title: null,
    originalSize: 0,
    processedSize: 0,
  };
}

export function isQueuePaused(): boolean {
  return (
    database
      .query<{ value: string }, [string]>(
        "SELECT value FROM queue_state WHERE key = ?",
      )
      .get(PAUSED_KEY)?.value === "1"
  );
}

export function setQueuePaused(paused: boolean): void {
  database.transaction(() => {
    database.query(
      "INSERT INTO queue_state (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value",
    ).run(PAUSED_KEY, paused ? "1" : "0");
    // A new global pause stops every job; overrides last only for that pause.
    database.query("DELETE FROM queue_state WHERE key LIKE ? AND value = 'run'").run(`${JOB_MODE_PREFIX}%`);
  })();
}

export function setJobPaused(id: number, paused: boolean): QueueJob | null {
  return database.transaction(() => {
    const job = database.query<{ status: QueueStatus }, [number]>(
      "SELECT status FROM queue_jobs WHERE id = ?",
    ).get(id);
    if (job?.status !== "wait" && job?.status !== "active") return null;
    const mode = paused ? "paused" : isQueuePaused() ? "run" : null;
    if (mode) {
      database.query(
        "INSERT INTO queue_state (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value",
      ).run(jobModeKey(id), mode);
    } else {
      database.query("DELETE FROM queue_state WHERE key = ?").run(jobModeKey(id));
    }
    return getQueueJob(id);
  })();
}

export function getQueueStats(options: { page?: number; limit?: number } = {}) {
  const limit = Math.min(50, Math.max(1, Math.floor(options.limit || 50)));
  const page = Math.max(1, Math.floor(options.page || 1));
  const offset = (page - 1) * limit;
  const counts = { wait: 0, active: 0, completed: 0, failed: 0, delayed: 0, paused: 0 };
  const globalPaused = isQueuePaused();
  for (const row of database
    .query<{ status: QueueStatus; count: number }, []>(
      "SELECT status, COUNT(*) AS count FROM queue_jobs GROUP BY status",
    )
    .all())
    counts[row.status] = Number(row.count);
  counts.paused = Number(database.query<{ count: number }, [string, number]>(
    `SELECT COUNT(*) count FROM queue_jobs q
     LEFT JOIN queue_state s ON s.key = ? || q.id
     WHERE q.status = 'wait' AND (s.value = 'paused' OR (? = 1 AND COALESCE(s.value, '') <> 'run'))`,
  ).get(JOB_MODE_PREFIX, Number(globalPaused))?.count || 0);
  counts.wait -= counts.paused;
  const total = database
    .query<{ count: number }, []>("SELECT COUNT(*) count FROM queue_jobs")
    .get()?.count || 0;
  const recentJobs = database
    .query<QueueJobRow, [number, number]>(
      `SELECT q.id, q.name, q.video_id, q.payload, q.progress, q.status, q.failed_reason, q.created_at, q.attempts,
        v.title, COALESCE(json_extract(v.metadata, '$.size'), 0) original_size,
        CASE WHEN q.status = 'completed' THEN COALESCE(h.processed_size, v.size, 0) ELSE 0 END processed_size
       FROM queue_jobs q LEFT JOIN videos v ON v.id = q.video_id
       LEFT JOIN (SELECT video_id, MAX(started_at) started_at, processed_size FROM job_history WHERE job_type = 'TRANSCODE' GROUP BY video_id) h ON h.video_id = q.video_id
       ORDER BY q.created_at DESC LIMIT ? OFFSET ?`,
    )
    .all(limit, offset)
    .map((row) => mapJob(row, globalPaused));
  return { counts, recentJobs, isPaused: globalPaused, page, limit, total, totalPages: Math.max(1, Math.ceil(Number(total) / limit)) };
}

export function getQueueJob(id: number): QueueJob | null {
  const row = database
    .query<QueueJobRow, [number]>(
      `SELECT q.id, q.name, q.video_id, q.payload, q.progress, q.status, q.failed_reason, q.created_at, q.attempts,
        v.title, COALESCE(json_extract(v.metadata, '$.size'), 0) original_size,
        CASE WHEN q.status = 'completed' THEN COALESCE(h.processed_size, v.size, 0) ELSE 0 END processed_size
       FROM queue_jobs q LEFT JOIN videos v ON v.id = q.video_id
       LEFT JOIN (SELECT video_id, MAX(started_at) started_at, processed_size FROM job_history WHERE job_type = 'TRANSCODE' GROUP BY video_id) h ON h.video_id = q.video_id
       WHERE q.id = ?`,
    )
    .get(id);
  return row ? mapJob(row) : null;
}

export function deleteQueueJob(id: number): QueueJob | null {
  return database.transaction(() => {
    const job = getQueueJob(id);
    if (!job || job.status === "completed") return null;
    database.query("DELETE FROM queue_jobs WHERE id = ? AND status <> 'completed'").run(id);
    database.query("DELETE FROM queue_state WHERE key = ?").run(jobModeKey(id));
    return job;
  })();
}

export function removePendingJobsForVideo(videoId: string): void {
  database.transaction(() => {
    database.query(
      "DELETE FROM queue_state WHERE key IN (SELECT ? || id FROM queue_jobs WHERE video_id = ? AND status <> 'completed')",
    ).run(JOB_MODE_PREFIX, videoId);
    database.query("DELETE FROM queue_jobs WHERE video_id = ? AND status <> 'completed'").run(videoId);
  })();
}

export function recoverExpiredJobs(): number {
  const result = database
    .query(
      "UPDATE queue_jobs SET status = 'wait', lease_expires_at = NULL, started_at = NULL WHERE status = 'active' AND lease_expires_at < ?",
    )
    .run(now());
  return result.changes;
}

export function claimNextJob(): QueueJob | null {
  recoverExpiredJobs();
  return database.transaction(() => {
    const globalPaused = isQueuePaused();
    const candidate = database
      .query<QueueJobRow, [string, number]>(
        `SELECT q.id, q.name, q.video_id, q.payload, q.progress, q.status, q.failed_reason, q.created_at, q.attempts,
           v.title, COALESCE(json_extract(v.metadata, '$.size'), 0) original_size, 0 processed_size
          FROM queue_jobs q LEFT JOIN videos v ON v.id = q.video_id
          LEFT JOIN queue_state s ON s.key = ? || q.id
          WHERE q.status = 'wait' AND COALESCE(s.value, '') <> 'paused'
            AND (? = 0 OR s.value = 'run')
          ORDER BY q.created_at ASC, q.id ASC LIMIT 1`,
      )
      .get(JOB_MODE_PREFIX, Number(globalPaused));
    if (!candidate) return null;
    const leaseExpiresAt = new Date(Date.now() + LEASE_MS).toISOString();
    const result = database
      .query(
        "UPDATE queue_jobs SET status = 'active', attempts = attempts + 1, started_at = ?, lease_expires_at = ? WHERE id = ? AND status = 'wait'",
      )
      .run(now(), leaseExpiresAt, candidate.id);
    if (!result.changes) return null;
    candidate.status = "active";
    candidate.attempts += 1;
    return mapJob(candidate, globalPaused);
  })();
}

export function releasePausedJob(id: number): void {
  database.query(
    `UPDATE queue_jobs SET status = 'wait', progress = 0, started_at = NULL, lease_expires_at = NULL,
      attempts = MAX(0, attempts - 1) WHERE id = ? AND status = 'active'`,
  ).run(id);
}

export function updateQueueProgress(id: number, progress: number): void {
  database
    .query(
      "UPDATE queue_jobs SET progress = ? WHERE id = ? AND status = 'active'",
    )
    .run(Math.max(0, Math.min(100, Math.round(progress))), id);
}

export function completeQueueJob(id: number): void {
  database.transaction(() => {
    const result = database.query(
      "UPDATE queue_jobs SET status = 'completed', progress = 100, completed_at = ?, lease_expires_at = NULL WHERE id = ? AND status = 'active'",
    ).run(now(), id);
    if (result.changes) database.query("DELETE FROM queue_state WHERE key = ?").run(jobModeKey(id));
  })();
}

export function failQueueJob(id: number, error: unknown): void {
  const reason = error instanceof Error ? error.message : String(error);
  database.transaction(() => {
    database.query(
      "UPDATE queue_jobs SET status = CASE WHEN attempts >= max_attempts THEN 'failed' ELSE 'wait' END, failed_reason = ?, lease_expires_at = NULL WHERE id = ? AND status = 'active'",
    ).run(reason, id);
    const status = database.query<{ status: QueueStatus }, [number]>(
      "SELECT status FROM queue_jobs WHERE id = ?",
    ).get(id)?.status;
    if (status === "failed") database.query("DELETE FROM queue_state WHERE key = ?").run(jobModeKey(id));
  })();
}
