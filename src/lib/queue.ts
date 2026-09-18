import { database } from "./database";

export type VideoJobData = { videoId: string; filePath: string };
export type QueueStatus = "wait" | "active" | "completed" | "failed";
export type QueueJob = {
  id: string;
  name: string;
  data: VideoJobData;
  progress: number;
  status: QueueStatus;
  failedReason: string | null;
  timestamp: number;
  attempts: number;
};

type QueueJobRow = {
  id: string;
  name: string;
  video_id: string;
  payload: string;
  progress: number;
  status: QueueStatus;
  failed_reason: string | null;
  created_at: string;
  attempts: number;
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
    data: parseJobData(row.payload),
    progress: row.progress,
    status: row.status,
    failedReason: row.failed_reason,
    timestamp: new Date(row.created_at).getTime(),
    attempts: row.attempts,
  };
}

export function enqueueVideoJob(data: VideoJobData): QueueJob {
  const id = crypto.randomUUID();
  const timestamp = now();
  database
    .query(
      "INSERT INTO queue_jobs (id, name, video_id, payload, created_at) VALUES (?, ?, ?, ?, ?)",
    )
    .run(id, "process-video", data.videoId, JSON.stringify(data), timestamp);
  return {
    id,
    name: "process-video",
    data,
    progress: 0,
    status: "wait",
    failedReason: null,
    timestamp: new Date(timestamp).getTime(),
    attempts: 0,
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

export function getQueueStats() {
  const counts = { wait: 0, active: 0, completed: 0, failed: 0, delayed: 0 };
  for (const row of database
    .query<{ status: QueueStatus; count: number }, []>(
      "SELECT status, COUNT(*) AS count FROM queue_jobs GROUP BY status",
    )
    .all())
    counts[row.status] = Number(row.count);
  const recentJobs = database
    .query<QueueJobRow, []>(
      "SELECT id, name, video_id, payload, progress, status, failed_reason, created_at, attempts FROM queue_jobs WHERE status IN ('active', 'wait', 'failed') ORDER BY created_at DESC LIMIT 10",
    )
    .all()
    .map(mapJob);
  return { counts, recentJobs, isPaused: isQueuePaused() };
}

export function getQueueJob(id: string): QueueJob | null {
  const row = database
    .query<QueueJobRow, [string]>(
      "SELECT id, name, video_id, payload, progress, status, failed_reason, created_at, attempts FROM queue_jobs WHERE id = ?",
    )
    .get(id);
  return row ? mapJob(row) : null;
}

export function deleteQueueJob(id: string): QueueJob | null {
  const job = getQueueJob(id);
  if (job) database.query("DELETE FROM queue_jobs WHERE id = ?").run(id);
  return job;
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
        "SELECT id, name, video_id, payload, progress, status, failed_reason, created_at, attempts FROM queue_jobs WHERE status = 'wait' ORDER BY created_at ASC LIMIT 1",
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

export function updateQueueProgress(id: string, progress: number): void {
  database
    .query(
      "UPDATE queue_jobs SET progress = ? WHERE id = ? AND status = 'active'",
    )
    .run(Math.max(0, Math.min(100, Math.round(progress))), id);
}

export function completeQueueJob(id: string): void {
  database
    .query(
      "UPDATE queue_jobs SET status = 'completed', progress = 100, completed_at = ?, lease_expires_at = NULL WHERE id = ? AND status = 'active'",
    )
    .run(now(), id);
}

export function failQueueJob(id: string, error: unknown): void {
  const reason = error instanceof Error ? error.message : String(error);
  database
    .query(
      "UPDATE queue_jobs SET status = CASE WHEN attempts >= max_attempts THEN 'failed' ELSE 'wait' END, failed_reason = ?, lease_expires_at = NULL WHERE id = ? AND status = 'active'",
    )
    .run(reason, id);
}
