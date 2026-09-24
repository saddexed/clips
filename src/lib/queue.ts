import { database } from "./database";
import { toStoredPath } from "./paths";

export type VideoJobData = { videoId: string; filePath: string };
export type QueueStatus = "wait" | "active" | "completed" | "failed";
export type QueueJob = {
  id: number;
  name: string;
  videoId: string;
  data: VideoJobData;
  progress: number;
  status: QueueStatus;
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

function mapJob(row: QueueJobRow): QueueJob {
  return {
    id: row.id,
    name: row.name,
    videoId: row.video_id,
    data: parseJobData(row.payload),
    progress: row.progress,
    status: row.status,
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
  database
    .query(
      "INSERT INTO queue_state (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value",
    )
    .run(PAUSED_KEY, paused ? "1" : "0");
}

export function getQueueStats(options: { page?: number; limit?: number } = {}) {
  const limit = Math.min(50, Math.max(1, Math.floor(options.limit || 50)));
  const page = Math.max(1, Math.floor(options.page || 1));
  const offset = (page - 1) * limit;
  const counts = { wait: 0, active: 0, completed: 0, failed: 0, delayed: 0 };
  for (const row of database
    .query<{ status: QueueStatus; count: number }, []>(
      "SELECT status, COUNT(*) AS count FROM queue_jobs GROUP BY status",
    )
    .all())
    counts[row.status] = Number(row.count);
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
    .map(mapJob);
  return { counts, recentJobs, isPaused: isQueuePaused(), page, limit, total, totalPages: Math.max(1, Math.ceil(Number(total) / limit)) };
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
  const job = getQueueJob(id);
  if (!job || job.status === "completed") return null;
  database.query("DELETE FROM queue_jobs WHERE id = ? AND status <> 'completed'").run(id);
  return job;
}

export function removePendingJobsForVideo(videoId: string): void {
  database.query("DELETE FROM queue_jobs WHERE video_id = ? AND status <> 'completed'").run(videoId);
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
  if (isQueuePaused()) return null;
  recoverExpiredJobs();
  return database.transaction(() => {
    const candidate = database
      .query<QueueJobRow, []>(
        `SELECT q.id, q.name, q.video_id, q.payload, q.progress, q.status, q.failed_reason, q.created_at, q.attempts,
          v.title, COALESCE(json_extract(v.metadata, '$.size'), 0) original_size, 0 processed_size
         FROM queue_jobs q LEFT JOIN videos v ON v.id = q.video_id WHERE q.status = 'wait' ORDER BY q.created_at ASC LIMIT 1`,
      )
      .get();
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
    return mapJob(candidate);
  })();
}

export function updateQueueProgress(id: number, progress: number): void {
  database
    .query(
      "UPDATE queue_jobs SET progress = ? WHERE id = ? AND status = 'active'",
    )
    .run(Math.max(0, Math.min(100, Math.round(progress))), id);
}

export function completeQueueJob(id: number): void {
  database
    .query(
      "UPDATE queue_jobs SET status = 'completed', progress = 100, completed_at = ?, lease_expires_at = NULL WHERE id = ? AND status = 'active'",
    )
    .run(now(), id);
}

export function failQueueJob(id: number, error: unknown): void {
  const reason = error instanceof Error ? error.message : String(error);
  database
    .query(
      "UPDATE queue_jobs SET status = CASE WHEN attempts >= max_attempts THEN 'failed' ELSE 'wait' END, failed_reason = ?, lease_expires_at = NULL WHERE id = ? AND status = 'active'",
    )
    .run(reason, id);
}
