import { Database } from "bun:sqlite";
import { mkdirSync } from "node:fs";
import path from "node:path";
import { normalizeStoredPath, toStoredPath } from "./paths";

export type MediaType = "VIDEO" | "IMAGE";
export type VideoStatus =
  | "UPLOADING"
  | "QUEUED"
  | "PROCESSING"
  | "COMPLETED"
  | "FAILED";
export type JobType =
  | "UPLOAD"
  | "TRANSCODE"
  | "METADATA_EXTRACT"
  | "EDIT"
  | "DELETE"
  | "HIDE"
  | "CANCELLED";
export type JobStatus = "PENDING" | "RUNNING" | "COMPLETED" | "FAILED";

export type Tag = { id: string; name: string };
export type Video = {
  id: string;
  filename: string;
  originalPath: string;
  processedPath: string | null;
  activePath: string;
  originalMetadata: Record<string, unknown> | null;
  activeMetadata: Record<string, unknown> | null;
  title: string;
  description: string;
  mediaType: MediaType;
  status: VideoStatus;
  originalSize: number;
  processedSize: number;
  activeSize: number;
  duration: number | null;
  width: number | null;
  height: number | null;
  createdAt: Date;
  uploadedAt: Date;
  date: Date;
  updatedAt: Date;
  deletedAt: Date | null;
  isHidden: boolean;
  tags: Tag[];
};

export type JobHistory = {
  id: string;
  videoId: string | null;
  jobType: JobType;
  status: JobStatus;
  startedAt: Date;
  completedAt: Date | null;
  originalSize: number;
  processedSize: number;
  errorMessage: string | null;
  metadata: Record<string, unknown> | null;
  video: Pick<Video, "id" | "title" | "filename" | "originalMetadata"> | null;
};

type VideoRow = {
  id: string;
  filename: string;
  original_path: string;
  processed_path: string | null;
  active_path: string;
  original_metadata: string | null;
  active_metadata: string | null;
  title: string;
  description: string;
  media_type: MediaType;
  status: VideoStatus;
  original_size: number;
  processed_size: number;
  active_size: number;
  duration: number | null;
  width: number | null;
  height: number | null;
  created_at: string;
  uploaded_at: string;
  date: string;
  updated_at: string;
  deleted_at: string | null;
  is_hidden: number;
};

type HistoryRow = Omit<
  JobHistory,
  | "videoId"
  | "jobType"
  | "startedAt"
  | "completedAt"
  | "originalSize"
  | "processedSize"
  | "errorMessage"
  | "metadata"
  | "video"
> & {
  video_id: string | null;
  job_type: JobType;
  started_at: string;
  completed_at: string | null;
  original_size: number;
  processed_size: number;
  error_message: string | null;
  metadata: string | null;
  video_title: string | null;
  video_filename: string | null;
  video_original_metadata: string | null;
};

function databasePath() {
  const url = process.env.DATABASE_URL || "file:./data/clips.db";
  if (!url.startsWith("file:")) {
    throw new Error(
      "DATABASE_URL must be a SQLite file URL, for example file:./data/clips.db",
    );
  }
  return path.resolve(process.cwd(), url.slice(5));
}

const dbPath = databasePath();
mkdirSync(path.dirname(dbPath), { recursive: true });
export const database = new Database(dbPath, { create: true, strict: true });

const hasLegacyPrismaSchema = database
  .query<{ name: string }, []>("PRAGMA table_info(videos)")
  .all()
  .some((column) => column.name === "originalPath");

if (hasLegacyPrismaSchema) {
  database.exec("PRAGMA foreign_keys = OFF;");
  database.transaction(() => {
    database.exec("DROP TABLE IF EXISTS video_tags;");
    database.exec("ALTER TABLE videos RENAME TO legacy_videos;");
    database.exec("ALTER TABLE tags RENAME TO legacy_tags;");
    database.exec("ALTER TABLE job_history RENAME TO legacy_job_history;");
    const legacyTags = database
      .query<{ name: string }, [string]>(
        "SELECT name FROM sqlite_master WHERE type = 'table' AND name = ?",
      )
      .get("_VideoTags");
    if (legacyTags)
      database.exec('ALTER TABLE "_VideoTags" RENAME TO legacy_video_tags;');
  })();
}

database.exec(
  "PRAGMA foreign_keys = ON; PRAGMA busy_timeout = 5000;",
);

database.exec(`
CREATE TABLE IF NOT EXISTS videos (
  id TEXT PRIMARY KEY,
  filename TEXT NOT NULL,
  original_path TEXT NOT NULL,
  original_sha256 TEXT,
  processed_path TEXT,
  active_path TEXT NOT NULL DEFAULT '',
  original_metadata TEXT,
  active_metadata TEXT,
  title TEXT NOT NULL DEFAULT '',
  description TEXT NOT NULL DEFAULT '',
  media_type TEXT NOT NULL DEFAULT 'VIDEO',
  status TEXT NOT NULL DEFAULT 'UPLOADING',
  original_size INTEGER NOT NULL DEFAULT 0,
  processed_size INTEGER NOT NULL DEFAULT 0,
  active_size INTEGER NOT NULL DEFAULT 0,
  duration REAL,
  width INTEGER,
  height INTEGER,
  created_at TEXT NOT NULL,
  uploaded_at TEXT NOT NULL,
  date TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  deleted_at TEXT,
  is_hidden INTEGER NOT NULL DEFAULT 0
);
CREATE INDEX IF NOT EXISTS videos_status_idx ON videos(status);
CREATE INDEX IF NOT EXISTS videos_date_idx ON videos(date);
CREATE TABLE IF NOT EXISTS tags (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL UNIQUE
);
CREATE TABLE IF NOT EXISTS video_tags (
  video_id TEXT NOT NULL REFERENCES videos(id) ON DELETE CASCADE,
  tag_id TEXT NOT NULL REFERENCES tags(id) ON DELETE CASCADE,
  PRIMARY KEY (video_id, tag_id)
);
CREATE TABLE IF NOT EXISTS job_history (
  id TEXT PRIMARY KEY,
  video_id TEXT REFERENCES videos(id) ON DELETE SET NULL,
  job_type TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'PENDING',
  started_at TEXT NOT NULL,
  completed_at TEXT,
  original_size INTEGER NOT NULL DEFAULT 0,
  processed_size INTEGER NOT NULL DEFAULT 0,
  error_message TEXT,
  metadata TEXT
);
CREATE INDEX IF NOT EXISTS job_history_video_id_idx ON job_history(video_id);
CREATE INDEX IF NOT EXISTS job_history_status_idx ON job_history(status);
CREATE TABLE IF NOT EXISTS app_settings (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS queue_state (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS queue_jobs (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  video_id TEXT NOT NULL REFERENCES videos(id) ON DELETE CASCADE,
  payload TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'wait',
  progress INTEGER NOT NULL DEFAULT 0,
  attempts INTEGER NOT NULL DEFAULT 0,
  max_attempts INTEGER NOT NULL DEFAULT 3,
  failed_reason TEXT,
  created_at TEXT NOT NULL,
  started_at TEXT,
  completed_at TEXT,
  lease_expires_at TEXT
);
CREATE INDEX IF NOT EXISTS queue_jobs_status_created_idx ON queue_jobs(status, created_at);
`);

function hasColumn(table: string, column: string): boolean {
  return database
    .query<{ name: string }, []>(`PRAGMA table_info(${table})`)
    .all()
    .some((item) => item.name === column);
}

if (!hasColumn("videos", "active_path")) {
  database.exec("ALTER TABLE videos ADD COLUMN active_path TEXT NOT NULL DEFAULT '';");
}
if (!hasColumn("videos", "active_metadata")) {
  database.exec("ALTER TABLE videos ADD COLUMN active_metadata TEXT;");
}
if (!hasColumn("videos", "active_size")) {
  database.exec("ALTER TABLE videos ADD COLUMN active_size INTEGER NOT NULL DEFAULT 0;");
}
if (!hasColumn("videos", "original_sha256")) {
  database.exec("ALTER TABLE videos ADD COLUMN original_sha256 TEXT;");
}
database.exec(
  "CREATE UNIQUE INDEX IF NOT EXISTS videos_original_sha256_idx ON videos(original_sha256) WHERE original_sha256 IS NOT NULL;",
);

function normalizeVideoPaths() {
  database.transaction(() => {
    const rows = database
      .query<
        {
          id: string;
          filename: string;
          original_path: string;
          processed_path: string | null;
          active_path: string;
          original_size: number;
          processed_size: number;
          active_size: number;
          original_metadata: string | null;
          active_metadata: string | null;
        },
        []
      >(
        "SELECT id, filename, original_path, processed_path, active_path, original_size, processed_size, active_size, original_metadata, active_metadata FROM videos",
      )
      .all();

    for (const row of rows) {
      const originalPath = toStoredPath(row.original_path);
      const processedPath = normalizeStoredPath(row.processed_path);
      const activePath =
        normalizeStoredPath(row.active_path) || processedPath || originalPath;
      const decodedMetadata = decodeJson(row.original_metadata);
      const originalMetadata =
        decodedMetadata && typeof decodedMetadata === "object"
          ? (decodedMetadata as Record<string, unknown>)
          : null;
      if (originalMetadata && !originalMetadata.originalFilename) {
        originalMetadata.originalFilename = row.filename;
      }
      database
        .query(
          `UPDATE videos
           SET original_path = ?, processed_path = ?, active_path = ?,
               active_size = CASE WHEN active_size > 0 THEN active_size
                 WHEN processed_path IS NOT NULL THEN processed_size ELSE original_size END,
               original_metadata = ?,
               active_metadata = COALESCE(active_metadata, ?)
           WHERE id = ?`,
        )
        .run(
          originalPath,
          processedPath,
          activePath,
          encodeJson(originalMetadata),
          encodeJson(originalMetadata),
          row.id,
      );
    }

    const queuedJobs = database
      .query<{ id: string; payload: string }, []>(
        "SELECT id, payload FROM queue_jobs",
      )
      .all();
    for (const job of queuedJobs) {
      try {
        const payload = JSON.parse(job.payload) as Record<string, unknown>;
        if (typeof payload.filePath !== "string") continue;
        const filePath = toStoredPath(payload.filePath);
        if (filePath !== payload.filePath) {
          database
            .query("UPDATE queue_jobs SET payload = ? WHERE id = ?")
            .run(JSON.stringify({ ...payload, filePath }), job.id);
        }
      } catch {
        // Keep invalid queue rows for the queue API to report; do not abort migration.
      }
    }
  })();
}

if (hasLegacyPrismaSchema) {
  database.transaction(() => {
    database.exec(`
      INSERT INTO videos (id, filename, original_path, processed_path, original_metadata, title, description, media_type, status, original_size, processed_size, duration, width, height, created_at, uploaded_at, date, updated_at, deleted_at, is_hidden)
      SELECT id, filename, originalPath, processedPath, originalMetadata, title, description, mediaType, status, originalSize, processedSize, duration, width, height, createdAt, uploadedAt, date, updatedAt, deletedAt, isHidden FROM legacy_videos;
      INSERT INTO tags (id, name) SELECT id, name FROM legacy_tags;
      INSERT INTO video_tags (video_id, tag_id) SELECT B, A FROM legacy_video_tags;
      INSERT INTO job_history (id, video_id, job_type, status, started_at, completed_at, original_size, processed_size, error_message, metadata)
      SELECT id, videoId, jobType, status, startedAt, completedAt, originalSize, processedSize, errorMessage, metadata FROM legacy_job_history;
      DROP TABLE legacy_video_tags;
      DROP TABLE legacy_job_history;
      DROP TABLE legacy_tags;
      DROP TABLE legacy_videos;
    `);
  })();
}

function now() {
  return new Date().toISOString();
}

if (getSetting("media_paths_normalized") !== true) {
  normalizeVideoPaths();
  setSetting("media_paths_normalized", true);
}
function encodeJson(value: unknown) {
  return value === undefined || value === null ? null : JSON.stringify(value);
}
function decodeJson(value: string | null) {
  if (!value) return null;
  try {
    return JSON.parse(value);
  } catch {
    return null;
  }
}

function mapVideo(row: VideoRow, tags: Tag[] = []): Video {
  const originalPath = normalizeStoredPath(row.original_path) || row.original_path;
  const processedPath = normalizeStoredPath(row.processed_path);
  const activePath =
    normalizeStoredPath(row.active_path) || processedPath || originalPath;
  return {
    id: row.id,
    filename: row.filename,
    originalPath,
    processedPath,
    activePath,
    originalMetadata: decodeJson(row.original_metadata) as Record<
      string,
      unknown
    > | null,
    activeMetadata: decodeJson(row.active_metadata) as Record<
      string,
      unknown
    > | null,
    title: row.title,
    description: row.description,
    mediaType: row.media_type,
    status: row.status,
    originalSize: Number(row.original_size),
    processedSize: Number(row.processed_size),
    activeSize: Number(row.active_size || row.processed_size || row.original_size),
    duration: row.duration,
    width: row.width,
    height: row.height,
    createdAt: new Date(row.created_at),
    uploadedAt: new Date(row.uploaded_at),
    date: new Date(row.date),
    updatedAt: new Date(row.updated_at),
    deletedAt: row.deleted_at ? new Date(row.deleted_at) : null,
    isHidden: Boolean(row.is_hidden),
    tags,
  };
}

function tagsFor(videoId: string): Tag[] {
  return database
    .query<Tag, [string]>(
      `SELECT t.id, t.name FROM tags t JOIN video_tags vt ON vt.tag_id = t.id WHERE vt.video_id = ? ORDER BY t.name`,
    )
    .all(videoId);
}

function mapHistory(row: HistoryRow): JobHistory {
  const video =
    row.video_id && row.video_title !== null && row.video_filename !== null
      ? {
          id: row.video_id,
          title: row.video_title,
          filename: row.video_filename,
          originalMetadata: decodeJson(row.video_original_metadata) as Record<
            string,
            unknown
          > | null,
        }
      : null;
  return {
    id: row.id,
    videoId: row.video_id,
    jobType: row.job_type,
    status: row.status,
    startedAt: new Date(row.started_at),
    completedAt: row.completed_at ? new Date(row.completed_at) : null,
    originalSize: Number(row.original_size),
    processedSize: Number(row.processed_size),
    errorMessage: row.error_message,
    metadata: decodeJson(row.metadata) as Record<string, unknown> | null,
    video,
  };
}

export function getVideo(id: string, withTags = true): Video | null {
  const row = database
    .query<VideoRow, [string]>("SELECT * FROM videos WHERE id = ?")
    .get(id);
  return row ? mapVideo(row, withTags ? tagsFor(id) : []) : null;
}

export function findVideoIdByOriginalSha256(sha256: string): string | null {
  return (
    database
      .query<{ id: string }, [string]>(
        "SELECT id FROM videos WHERE original_sha256 = ?",
      )
      .get(sha256)?.id ?? null
  );
}

export function listVideos(
  options: { publicOnly?: boolean; limit?: number } = {},
): Video[] {
  const filters = ["deleted_at IS NULL"];
  if (options.publicOnly) filters.push("status = 'COMPLETED'", "is_hidden = 0");
  const limit = options.limit
    ? ` LIMIT ${Math.max(1, Math.floor(options.limit))}`
    : "";
  const rows = database
    .query<VideoRow, []>(
      `SELECT * FROM videos WHERE ${filters.join(" AND ")} ORDER BY ${options.publicOnly ? "date" : "uploaded_at"} DESC${limit}`,
    )
    .all();
  return rows.map((row) => mapVideo(row, tagsFor(row.id)));
}

export function createVideo(
  input: Omit<
    Video,
    | "processedPath"
    | "processedSize"
    | "activePath"
    | "activeSize"
    | "activeMetadata"
    | "duration"
    | "width"
    | "height"
    | "updatedAt"
    | "deletedAt"
    | "tags"
  > & {
    originalSha256: string;
    activePath?: string;
    activeSize?: number;
    activeMetadata?: Record<string, unknown> | null;
    tags?: string[];
  },
) {
  const timestamp = now();
  const originalPath = toStoredPath(input.originalPath);
  const activePath = toStoredPath(input.activePath || originalPath);
  const activeMetadata = input.activeMetadata ?? input.originalMetadata;
  const activeSize = input.activeSize ?? input.originalSize;
  database.transaction(() => {
    database
      .query(
        `INSERT INTO videos (id, filename, original_path, original_sha256, processed_path, active_path, original_metadata, active_metadata, title, description, media_type, status, original_size, processed_size, active_size, created_at, uploaded_at, date, updated_at, is_hidden) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      )
      .run(
        input.id,
        input.filename,
        originalPath,
        input.originalSha256,
        null,
        activePath,
        encodeJson(input.originalMetadata),
        encodeJson(activeMetadata),
        input.title,
        input.description,
        input.mediaType,
        input.status,
        input.originalSize,
        0,
        activeSize,
        input.createdAt.toISOString(),
        input.uploadedAt.toISOString(),
        input.date.toISOString(),
        timestamp,
        Number(input.isHidden),
      );
    replaceVideoTags(input.id, input.tags || []);
  })();
  return getVideo(input.id)!;
}

export function updateVideo(
  id: string,
  updates: Partial<Omit<Video, "id" | "tags" | "updatedAt">> & {
    tags?: string[];
  },
): Video | null {
  type SqlValue = string | number | bigint | boolean | null;
  const has = (key: keyof typeof updates) =>
    Number(Object.hasOwn(updates, key));
  const value = (
    key: keyof typeof updates,
    transform: (input: unknown) => unknown = (input) => input,
  ): SqlValue => {
    const result = transform(updates[key]);
    if (result === undefined) return null;
    if (
      result === null ||
      typeof result === "string" ||
      typeof result === "number" ||
      typeof result === "bigint" ||
      typeof result === "boolean"
    )
      return result;
    throw new TypeError(`Invalid SQLite binding for ${key}`);
  };

  database.transaction(() => {
    database
      .query(`
      UPDATE videos SET
        filename = CASE WHEN ? THEN ? ELSE filename END,
        original_path = CASE WHEN ? THEN ? ELSE original_path END,
        processed_path = CASE WHEN ? THEN ? ELSE processed_path END,
        active_path = CASE WHEN ? THEN ? ELSE active_path END,
        original_metadata = CASE WHEN ? THEN ? ELSE original_metadata END,
        active_metadata = CASE WHEN ? THEN ? ELSE active_metadata END,
        title = CASE WHEN ? THEN ? ELSE title END,
        description = CASE WHEN ? THEN ? ELSE description END,
        media_type = CASE WHEN ? THEN ? ELSE media_type END,
        status = CASE WHEN ? THEN ? ELSE status END,
        original_size = CASE WHEN ? THEN ? ELSE original_size END,
        processed_size = CASE WHEN ? THEN ? ELSE processed_size END,
        active_size = CASE WHEN ? THEN ? ELSE active_size END,
        duration = CASE WHEN ? THEN ? ELSE duration END,
        width = CASE WHEN ? THEN ? ELSE width END,
        height = CASE WHEN ? THEN ? ELSE height END,
        created_at = CASE WHEN ? THEN ? ELSE created_at END,
        uploaded_at = CASE WHEN ? THEN ? ELSE uploaded_at END,
        date = CASE WHEN ? THEN ? ELSE date END,
        deleted_at = CASE WHEN ? THEN ? ELSE deleted_at END,
        is_hidden = CASE WHEN ? THEN ? ELSE is_hidden END,
        updated_at = ?
      WHERE id = ?
    `)
      .run(
        has("filename"),
        value("filename"),
        has("originalPath"),
        value("originalPath", (item) =>
          item === null ? null : toStoredPath(String(item)),
        ),
        has("processedPath"),
        value("processedPath", (item) =>
          item === null ? null : toStoredPath(String(item)),
        ),
        has("activePath"),
        value("activePath", (item) =>
          item === null ? null : toStoredPath(String(item)),
        ),
        has("originalMetadata"),
        value("originalMetadata", encodeJson),
        has("activeMetadata"),
        value("activeMetadata", encodeJson),
        has("title"),
        value("title"),
        has("description"),
        value("description"),
        has("mediaType"),
        value("mediaType"),
        has("status"),
        value("status"),
        has("originalSize"),
        value("originalSize"),
        has("processedSize"),
        value("processedSize"),
        has("activeSize"),
        value("activeSize"),
        has("duration"),
        value("duration"),
        has("width"),
        value("width"),
        has("height"),
        value("height"),
        has("createdAt"),
        value("createdAt", (item) =>
          item instanceof Date ? item.toISOString() : item,
        ),
        has("uploadedAt"),
        value("uploadedAt", (item) =>
          item instanceof Date ? item.toISOString() : item,
        ),
        has("date"),
        value("date", (item) =>
          item instanceof Date ? item.toISOString() : item,
        ),
        has("deletedAt"),
        value("deletedAt", (item) =>
          item instanceof Date ? item.toISOString() : item,
        ),
        has("isHidden"),
        value("isHidden", Number),
        now(),
        id,
      );
    if (updates.tags !== undefined) replaceVideoTags(id, updates.tags);
  })();
  return getVideo(id);
}

function replaceVideoTags(videoId: string, names: string[]) {
  database.query("DELETE FROM video_tags WHERE video_id = ?").run(videoId);
  for (const name of names) {
    const tag =
      database
        .query<Tag, [string]>("SELECT id, name FROM tags WHERE name = ?")
        .get(name) ||
      (() => {
        const tag = { id: crypto.randomUUID(), name };
        database
          .query("INSERT INTO tags (id, name) VALUES (?, ?)")
          .run(tag.id, tag.name);
        return tag;
      })();
    database
      .query("INSERT INTO video_tags (video_id, tag_id) VALUES (?, ?)")
      .run(videoId, tag.id);
  }
}

export function deleteVideo(id: string) {
  database.query("DELETE FROM videos WHERE id = ?").run(id);
}

export function createJobHistory(
  input: Omit<JobHistory, "id" | "startedAt" | "video"> & {
    id?: string;
    startedAt?: Date;
  },
) {
  const id = input.id || crypto.randomUUID();
  database
    .query(
      `INSERT INTO job_history (id, video_id, job_type, status, started_at, completed_at, original_size, processed_size, error_message, metadata) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    )
    .run(
      id,
      input.videoId,
      input.jobType,
      input.status,
      (input.startedAt || new Date()).toISOString(),
      input.completedAt?.toISOString() || null,
      input.originalSize,
      input.processedSize,
      input.errorMessage,
      encodeJson(input.metadata),
    );
  return id;
}

export function listJobHistory(limit = 100): JobHistory[] {
  return database
    .query<HistoryRow, [number]>(
      `SELECT j.*, v.title AS video_title, v.filename AS video_filename, v.original_metadata AS video_original_metadata FROM job_history j LEFT JOIN videos v ON v.id = j.video_id ORDER BY j.started_at DESC LIMIT ?`,
    )
    .all(limit)
    .map(mapHistory);
}

export function jobHistoryForVideo(videoId: string) {
  return listJobHistoryByVideo(videoId);
}
function listJobHistoryByVideo(videoId: string) {
  return database
    .query<HistoryRow, [string]>(
      `SELECT j.*, v.title AS video_title, v.filename AS video_filename, v.original_metadata AS video_original_metadata FROM job_history j LEFT JOIN videos v ON v.id = j.video_id WHERE j.video_id = ?`,
    )
    .all(videoId)
    .map(mapHistory);
}
export function updateJobHistory(
  id: string,
  metadata: Record<string, unknown>,
) {
  database
    .query("UPDATE job_history SET metadata = ? WHERE id = ?")
    .run(encodeJson(metadata), id);
}

export function search(q: string, isAdmin: boolean) {
  const like = `%${q}%`;
  const tags = database
    .query<Pick<Tag, "name">, [string]>(
      "SELECT name FROM tags WHERE name LIKE ? COLLATE NOCASE ORDER BY name LIMIT 12",
    )
    .all(like);
  const publicClause = isAdmin
    ? ""
    : " AND v.status = 'COMPLETED' AND v.is_hidden = 0";
  const videos = database
    .query<Pick<Video, "id" | "title" | "filename">, [string, string]>(
      `SELECT DISTINCT v.id, v.title, v.filename FROM videos v LEFT JOIN video_tags vt ON vt.video_id = v.id LEFT JOIN tags t ON t.id = vt.tag_id WHERE v.deleted_at IS NULL${publicClause} AND (v.title LIKE ? COLLATE NOCASE OR t.name LIKE ? COLLATE NOCASE) ORDER BY v.date DESC LIMIT 20`,
    )
    .all(like, like);
  return { tags, videos };
}

export function getSetting(key: string): unknown | undefined {
  const row = database
    .query<{ value: string }, [string]>(
      "SELECT value FROM app_settings WHERE key = ?",
    )
    .get(key);
  return row ? decodeJson(row.value) : undefined;
}
export function setSetting(key: string, value: unknown) {
  database
    .query(
      "INSERT INTO app_settings (key, value, updated_at) VALUES (?, ?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at",
    )
    .run(key, JSON.stringify(value), now());
}
