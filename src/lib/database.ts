import { Database } from "bun:sqlite";
import { existsSync, mkdirSync } from "node:fs";
import path from "node:path";
import { normalizeMediaMetadata } from "./media";
import { resolveStoredPath, toStoredPath, vaultArtifactPath } from "./paths";

export type MediaType = "VIDEO" | "IMAGE";
export type VideoStatus = "UPLOADING" | "QUEUED" | "PROCESSING" | "COMPLETED" | "FAILED";
export type JobType = "UPLOAD" | "TRANSCODE" | "METADATA_EXTRACT" | "EDIT" | "DELETE" | "HIDE" | "RESTORE" | "CANCELLED";
export type JobStatus = "PENDING" | "RUNNING" | "COMPLETED" | "FAILED";
export type Tag = { id: string; name: string; deletedAt?: Date | null };
export type Video = {
  id: string;
  title: string;
  status: VideoStatus;
  size: number;
  sha256Hash: string | null;
  metadata: Record<string, unknown> | null;
  createdAt: Date;
  uploadedAt: Date;
  deletedAt: Date | null;
  isHidden: boolean;
  tags: Tag[];
  filename: string;
  description: string;
  mediaType: MediaType;
  originalPath: string;
  processedPath: string | null;
  activePath: string;
  originalMetadata: Record<string, unknown> | null;
  activeMetadata: Record<string, unknown> | null;
  originalSize: number;
  processedSize: number;
  activeSize: number;
  duration: number | null;
  width: number | null;
  height: number | null;
  date: Date;
  updatedAt: Date;
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
  title: string;
  status: VideoStatus;
  size: number;
  sha256_hash: string | null;
  metadata: string | null;
  description: string | null;
  created_at: string;
  uploaded_at: string;
  deleted_at: string | null;
  is_hidden: number;
};

type HistoryRow = {
  id: string;
  video_id: string | null;
  job_type: JobType;
  status: JobStatus;
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
  const configured = process.env.DB?.trim() || "./data/clips.db";
  // A plain path is the documented form; a file: URL still works, but a driver
  // connection string left over from another database would not.
  if (/^[a-z][a-z0-9+.-]*:\/\//i.test(configured)) {
    throw new Error("DB must be a SQLite file path, not a connection URL");
  }
  return path.resolve(process.cwd(), configured.replace(/^file:/, ""));
}

function now() { return new Date().toISOString(); }
function encodeJson(value: unknown) { return value == null ? null : JSON.stringify(value); }
function decodeJson(value: string | null): any {
  if (!value) return null;
  try {
    const parsed: unknown = JSON.parse(value);
    return parsed && typeof parsed === "object" && !Array.isArray(parsed)
      ? parsed as Record<string, unknown> : null;
  } catch { return null; }
}
function dateValue(value: unknown, fallback = now()) {
  const date = value instanceof Date ? value : new Date(String(value || fallback));
  return Number.isNaN(date.getTime()) ? fallback : date.toISOString();
}
function extension(value: string | null | undefined) {
  const match = value?.match(/\.([a-z0-9]+)$/i);
  return match ? `.${match[1].toLowerCase()}` : "";
}
function storedPath(folder: string, id: string, ext: string) {
  return toStoredPath(path.join(folder, `${id}${ext}`));
}

export const database = (() => {
  const file = databasePath();
  mkdirSync(path.dirname(file), { recursive: true });
  return new Database(file, { create: true, strict: true });
})();

database.exec("PRAGMA foreign_keys = OFF; PRAGMA busy_timeout = 5000;");
database.exec(`
CREATE TABLE IF NOT EXISTS tags (id TEXT PRIMARY KEY, name TEXT NOT NULL UNIQUE, deleted_at TEXT);
CREATE TABLE IF NOT EXISTS app_settings (key TEXT PRIMARY KEY, value TEXT NOT NULL, updated_at TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS queue_state (key TEXT PRIMARY KEY, value TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS job_history (
  id TEXT PRIMARY KEY, video_id TEXT REFERENCES videos(id) ON DELETE SET NULL,
  job_type TEXT NOT NULL, status TEXT NOT NULL DEFAULT 'PENDING', started_at TEXT NOT NULL,
  completed_at TEXT, original_size INTEGER NOT NULL DEFAULT 0, processed_size INTEGER NOT NULL DEFAULT 0,
  error_message TEXT, metadata TEXT
);
CREATE TABLE IF NOT EXISTS queue_jobs (
  id INTEGER PRIMARY KEY AUTOINCREMENT, name TEXT NOT NULL, video_id TEXT NOT NULL REFERENCES videos(id) ON DELETE CASCADE,
  payload TEXT NOT NULL, status TEXT NOT NULL DEFAULT 'wait', progress INTEGER NOT NULL DEFAULT 0,
  attempts INTEGER NOT NULL DEFAULT 0, max_attempts INTEGER NOT NULL DEFAULT 3, failed_reason TEXT,
  created_at TEXT NOT NULL, started_at TEXT, completed_at TEXT, lease_expires_at TEXT
);
CREATE TABLE IF NOT EXISTS trash_items (
  video_id TEXT NOT NULL REFERENCES videos(id) ON DELETE CASCADE,
  artifact_kind TEXT NOT NULL CHECK (artifact_kind IN ('original', 'converted')),
  deleted_at TEXT NOT NULL,
  PRIMARY KEY (video_id, artifact_kind)
);
`);

function columns(table: string) {
  return new Set(database.query<{ name: string }, []>(`PRAGMA table_info(${table})`).all().map((row) => row.name));
}

function migrateQueueJobIds() {
  const idColumn = database.query<{ name: string; type: string }, []>("PRAGMA table_info(queue_jobs)").all().find((column) => column.name === "id");
  const tableSql = database.query<{ sql: string | null }, []>("SELECT sql FROM sqlite_master WHERE type='table' AND name='queue_jobs'").get()?.sql || "";
  if (idColumn?.type.toUpperCase() === "INTEGER" && /AUTOINCREMENT/i.test(tableSql)) return;

  const preserveIds = idColumn?.type.toUpperCase() === "INTEGER";
  database.transaction(() => {
    database.exec(`
DROP INDEX IF EXISTS queue_jobs_status_created_idx;
ALTER TABLE queue_jobs RENAME TO queue_jobs_legacy;
CREATE TABLE queue_jobs_serial (
  id INTEGER PRIMARY KEY AUTOINCREMENT, name TEXT NOT NULL, video_id TEXT NOT NULL REFERENCES videos(id) ON DELETE CASCADE,
  payload TEXT NOT NULL, status TEXT NOT NULL DEFAULT 'wait', progress INTEGER NOT NULL DEFAULT 0,
  attempts INTEGER NOT NULL DEFAULT 0, max_attempts INTEGER NOT NULL DEFAULT 3, failed_reason TEXT,
  created_at TEXT NOT NULL, started_at TEXT, completed_at TEXT, lease_expires_at TEXT
);
`);
    const id = preserveIds ? "id," : "";
    database.exec(`INSERT INTO queue_jobs_serial (${id}name,video_id,payload,status,progress,attempts,max_attempts,failed_reason,created_at,started_at,completed_at,lease_expires_at)
SELECT ${id}name,video_id,payload,status,progress,attempts,max_attempts,failed_reason,created_at,started_at,completed_at,lease_expires_at
FROM queue_jobs_legacy ORDER BY created_at ASC, rowid ASC;`);
    database.exec("DROP TABLE queue_jobs_legacy; ALTER TABLE queue_jobs_serial RENAME TO queue_jobs;");
  })();
}

function createVideos() {
  database.exec(`
CREATE TABLE IF NOT EXISTS videos (
  id TEXT PRIMARY KEY, title TEXT NOT NULL DEFAULT '', status TEXT NOT NULL DEFAULT 'UPLOADING',
  size INTEGER NOT NULL DEFAULT 0, sha256_hash TEXT, metadata TEXT NOT NULL DEFAULT '{}',
  description TEXT NOT NULL DEFAULT '',
  created_at TEXT NOT NULL, uploaded_at TEXT NOT NULL, deleted_at TEXT, is_hidden INTEGER NOT NULL DEFAULT 0
);
CREATE INDEX IF NOT EXISTS videos_status_idx ON videos(status);
CREATE INDEX IF NOT EXISTS videos_created_idx ON videos(created_at);
CREATE UNIQUE INDEX IF NOT EXISTS videos_sha256_hash_idx ON videos(sha256_hash) WHERE sha256_hash IS NOT NULL;
`);
}

function migrateVideoDescription() {
  if (columns("videos").has("description")) return;
  database.exec("ALTER TABLE videos ADD COLUMN description TEXT NOT NULL DEFAULT '';");
}

createVideos();
migrateVideoDescription();
migrateQueueJobIds();
database.exec(`
CREATE TABLE IF NOT EXISTS video_tags (video_id TEXT NOT NULL REFERENCES videos(id) ON DELETE CASCADE, tag_id TEXT NOT NULL REFERENCES tags(id) ON DELETE CASCADE, PRIMARY KEY(video_id, tag_id));
CREATE INDEX IF NOT EXISTS job_history_video_id_idx ON job_history(video_id);
CREATE INDEX IF NOT EXISTS job_history_status_idx ON job_history(status);
CREATE INDEX IF NOT EXISTS job_history_started_idx ON job_history(started_at);
CREATE INDEX IF NOT EXISTS queue_jobs_status_created_idx ON queue_jobs(status, created_at);
CREATE INDEX IF NOT EXISTS trash_items_deleted_at_idx ON trash_items(deleted_at);
CREATE INDEX IF NOT EXISTS video_tags_tag_id_idx ON video_tags(tag_id);
CREATE INDEX IF NOT EXISTS videos_uploaded_idx ON videos(uploaded_at);
CREATE INDEX IF NOT EXISTS videos_live_uploaded_idx ON videos(uploaded_at DESC) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS videos_deleted_at_idx ON videos(deleted_at) WHERE deleted_at IS NOT NULL;
`);

function tagsFor(videoId: string) {
  return database.query<Tag, [string]>("SELECT t.id,t.name FROM tags t JOIN video_tags vt ON vt.tag_id=t.id WHERE vt.video_id=? AND t.deleted_at IS NULL ORDER BY t.name").all(videoId);
}
export function listTagsPage(page = 1, limit = 50) {
  const safeLimit = Math.min(50, Math.max(1, Math.floor(limit)));
  const safePage = Math.max(1, Math.floor(page));
  const total = Number(database.query<{ count: number }, []>("SELECT COUNT(*) count FROM tags WHERE deleted_at IS NULL").get()?.count || 0);
  const rows = database.query<{ id: string; name: string; deleted_at: string | null }, [number, number]>("SELECT id,name,deleted_at FROM tags WHERE deleted_at IS NULL ORDER BY name LIMIT ? OFFSET ?").all(safeLimit, (safePage - 1) * safeLimit);
  return { items: rows.map((row) => ({ id: row.id, name: row.name, deletedAt: row.deleted_at ? new Date(row.deleted_at) : null })), page: safePage, limit: safeLimit, total, totalPages: Math.max(1, Math.ceil(total / safeLimit)) };
}
export function renameTag(id: string, name: string) {
  const existing = database.query<{ id: string }, [string, string]>("SELECT id FROM tags WHERE name=? COLLATE NOCASE AND id<>? AND deleted_at IS NULL").get(name, id);
  if (existing) throw new Error("A tag with that name already exists.");
  const result = database.query("UPDATE tags SET name=? WHERE id=? AND deleted_at IS NULL").run(name, id);
  if (!result.changes) throw new Error("Tag not found.");
}
export function softDeleteTag(id: string) {
  const result = database.query("UPDATE tags SET deleted_at=? WHERE id=? AND deleted_at IS NULL").run(now(), id);
  if (!result.changes) throw new Error("Tag not found.");
}
export function listDeletedTags() {
  return database.query<{ id: string; name: string; deleted_at: string }, []>("SELECT id,name,deleted_at FROM tags WHERE deleted_at IS NOT NULL ORDER BY deleted_at DESC").all().map((row) => ({ id: row.id, name: row.name, deletedAt: new Date(row.deleted_at) }));
}
export function restoreTag(id: string) {
  const tag = database.query<{ name: string }, [string]>("SELECT name FROM tags WHERE id=? AND deleted_at IS NOT NULL").get(id);
  if (!tag) throw new Error("Deleted tag not found.");
  const existing = database.query<{ id: string }, [string, string]>("SELECT id FROM tags WHERE name=? COLLATE NOCASE AND id<>? AND deleted_at IS NULL").get(tag.name, id);
  if (existing) throw new Error("A tag with that name already exists.");
  database.query("UPDATE tags SET deleted_at=NULL WHERE id=?").run(id);
}
function replaceTags(videoId: string, names: string[]) {
  database.query("DELETE FROM video_tags WHERE video_id=?").run(videoId);
  for (const name of names) {
    const tag = database.query<Tag, [string]>("SELECT id,name FROM tags WHERE name=? AND deleted_at IS NULL").get(name) || (() => { const value = { id: crypto.randomUUID(), name }; database.query("INSERT INTO tags (id,name) VALUES (?,?)").run(value.id, value.name); return value; })();
    database.query("INSERT OR IGNORE INTO video_tags(video_id,tag_id) VALUES (?,?)").run(videoId, tag.id);
  }
}
function filename(metadata: Record<string, unknown> | null, id: string) { return typeof metadata?.filename === "string" && metadata.filename ? metadata.filename : `${id}.webm`; }
function dimensions(metadata: Record<string, unknown> | null): [number | null, number | null] { const value = metadata?.resolution; const match = typeof value === "string" ? value.match(/^(\d+)x(\d+)$/) : null; return match ? [Number(match[1]), Number(match[2])] : [null, null]; }
function pathExists(value: string) {
  const resolved = resolveStoredPath(value);
  return resolved ? existsSync(resolved) : false;
}
function mediaPaths(id: string, name: string, mediaType: MediaType) {
  const originalExtension = extension(name) || ".webm";
  const uploadPath = storedPath(".uploads", id, originalExtension);
  const canonicalOriginalPath = toStoredPath(vaultArtifactPath(id, name, "original", mediaType));
  const canonicalConvertedPath = toStoredPath(vaultArtifactPath(id, name, "converted", mediaType));
  const legacyVaultOriginalPath = storedPath("vault", id, originalExtension);
  const legacyProcessedPath = storedPath("processed", id, mediaType === "IMAGE" ? ".webp" : ".webm");
  const legacyVaultConvertedPath = storedPath("vault", id, mediaType === "IMAGE" ? ".webp" : ".webm");
  const originalPath = pathExists(canonicalOriginalPath)
    ? canonicalOriginalPath
    : pathExists(uploadPath)
    ? uploadPath
    : pathExists(legacyVaultOriginalPath)
      ? legacyVaultOriginalPath
      : uploadPath;
  const processedPath = [canonicalConvertedPath, legacyVaultConvertedPath, legacyProcessedPath]
    .find((candidate) => pathExists(candidate) && candidate !== originalPath) || null;
  const activePath = processedPath || (
    pathExists(canonicalOriginalPath)
      ? canonicalOriginalPath
      : pathExists(legacyVaultOriginalPath)
        ? legacyVaultOriginalPath
        : originalPath
  );
  return {
    originalPath,
    processedPath,
    activePath,
  };
}
function mapVideo(row: VideoRow, tags: Tag[]): Video {
  const metadata = decodeJson(row.metadata);
  const originalDate = typeof metadata?.created_at === "string" && !Number.isNaN(Date.parse(metadata.created_at))
    ? metadata.created_at : row.created_at;
  const name = filename(metadata, row.id);
  const mediaType: MediaType = String(metadata?.contentType || "").startsWith("image/") ? "IMAGE" : "VIDEO";
  const paths = mediaPaths(row.id, name, mediaType);
  const activeMetadata = paths.processedPath
    ? {
        ...metadata,
        contentType: mediaType === "IMAGE" ? "image/webp" : "video/webm",
        ...(mediaType === "VIDEO" ? { video_codec: "vp9/webm", audio_codec: "opus/webm" } : {}),
      }
    : metadata;
  const [width, height] = dimensions(metadata);
  return { id: row.id, title: row.title, status: row.status, size: Number(row.size), sha256Hash: row.sha256_hash, metadata, createdAt: new Date(originalDate), uploadedAt: new Date(row.uploaded_at), deletedAt: row.deleted_at ? new Date(row.deleted_at) : null, isHidden: Boolean(row.is_hidden), tags, filename: name, description: row.description || "", mediaType, originalPath: paths.originalPath, processedPath: paths.processedPath, activePath: paths.activePath, originalMetadata: metadata, activeMetadata, originalSize: Number(metadata?.size || 0), processedSize: paths.processedPath ? Number(row.size) : 0, activeSize: Number(row.size), duration: typeof metadata?.duration === "number" ? metadata.duration : null, width, height, date: new Date(row.created_at), updatedAt: new Date(row.created_at) };
}
export function getVideo(id: string, withTags = true) { const row = database.query<VideoRow, [string]>("SELECT * FROM videos WHERE id=?").get(id); return row ? mapVideo(row, withTags ? tagsFor(id) : []) : null; }
export function listDeletedVideos() {
  return database.query<VideoRow, []>("SELECT * FROM videos WHERE deleted_at IS NOT NULL ORDER BY deleted_at DESC").all().map((row) => mapVideo(row, tagsFor(row.id)));
}
export function findVideoIdByOriginalSha256(hash: string) { return database.query<{ id: string }, [string]>("SELECT id FROM videos WHERE sha256_hash=?").get(hash)?.id || null; }
export type VideoSortField = "title" | "duration" | "originalSize" | "date" | "uploadedAt";
export type VideoSortOrder = "asc" | "desc";
// Every video list orders through this one mapping so a requested sort is what the
// SQL uses, and the same field means the same thing in each list.
function videoSortColumns(prefix: string): Record<VideoSortField, string> {
  return {
    title: `LOWER(COALESCE(NULLIF(${prefix}title, ''), json_extract(${prefix}metadata, '$.filename')))`,
    duration: `CAST(json_extract(${prefix}metadata, '$.duration') AS REAL)`,
    originalSize: `${prefix}size`,
    date: `${prefix}created_at`,
    uploadedAt: `${prefix}uploaded_at`,
  };
}
function videoOrderBy(sortField?: VideoSortField, sortOrder?: VideoSortOrder, prefix = "") {
  const columns = videoSortColumns(prefix);
  const field = sortField && Object.hasOwn(columns, sortField) ? sortField : "date";
  return `${columns[field]} ${sortOrder === "asc" ? "ASC" : "DESC"}, ${prefix}id DESC`;
}
export function listVideos(options: { publicOnly?: boolean; limit?: number; sortField?: VideoSortField; sortOrder?: VideoSortOrder } = {}) { const filters = ["deleted_at IS NULL"]; if (options.publicOnly) filters.push("is_hidden=0"); const limit = options.limit ? ` LIMIT ${Math.max(1, Math.floor(options.limit))}` : ""; return database.query<VideoRow, []>(`SELECT * FROM videos WHERE ${filters.join(" AND ")} ORDER BY ${videoOrderBy(options.sortField, options.sortOrder)}${limit}`).all().map((row) => mapVideo(row, tagsFor(row.id))); }
export function listVideosPage(options: { page?: number; limit?: number; query?: string; tags?: string[]; sortField?: VideoSortField; sortOrder?: VideoSortOrder } = {}) {
  const limit = Math.min(50, Math.max(1, Math.floor(options.limit || 50)));
  const requestedPage = options.page ?? 1;
  const page = Number.isFinite(requestedPage) ? Math.max(1, Math.floor(requestedPage)) : 1;
  const query = (options.query || "").trim();
  const like = `%${query}%`;
  const tags = (options.tags || []).map((tag) => tag.trim().toLowerCase()).filter(Boolean);
  const conditions = ["v.deleted_at IS NULL"];
  const params: (string | number)[] = [];
  if (query) { conditions.push("(v.title LIKE ? COLLATE NOCASE OR json_extract(v.metadata,'$.filename') LIKE ? COLLATE NOCASE OR t.name LIKE ? COLLATE NOCASE)"); params.push(like, like, like); }
  for (const tag of tags) { conditions.push("EXISTS (SELECT 1 FROM video_tags selected_vt JOIN tags selected_t ON selected_t.id=selected_vt.tag_id WHERE selected_vt.video_id=v.id AND selected_t.deleted_at IS NULL AND selected_t.name = ?)"); params.push(tag); }
  const where = conditions.join(" AND ");
  const total = Number(database.query<{ count: number }, any[]>(`SELECT COUNT(DISTINCT v.id) count FROM videos v LEFT JOIN video_tags vt ON vt.video_id=v.id LEFT JOIN tags t ON t.id=vt.tag_id WHERE ${where}`).get(...params)?.count || 0);
  const totalPages = Math.max(1, Math.ceil(total / limit));
  const currentPage = Math.min(page, totalPages);
  const rows = database.query<VideoRow, (string | number)[]>(`SELECT DISTINCT v.* FROM videos v LEFT JOIN video_tags vt ON vt.video_id=v.id LEFT JOIN tags t ON t.id=vt.tag_id WHERE ${where} ORDER BY ${videoOrderBy(options.sortField, options.sortOrder, "v.")} LIMIT ? OFFSET ?`).all(...params, limit, (currentPage - 1) * limit);
  return { items: rows.map((row) => mapVideo(row, tagsFor(row.id))), page: currentPage, limit, total, totalPages };
}

type VideoInput = { id: string; title: string; description?: string; status: VideoStatus; size?: number; sha256Hash?: string | null; originalSha256?: string | null; metadata?: Record<string, unknown> | null; originalMetadata?: Record<string, unknown> | null; activeSize?: number; filename?: string; originalSize?: number; createdAt: Date; uploadedAt: Date; deletedAt?: Date | null; isHidden: boolean; tags?: string[] };
export function createVideo(input: VideoInput) {
  const metadata = input.metadata || input.originalMetadata || { filename: input.filename || `${input.id}.webm`, id: input.id, hash: input.sha256Hash || input.originalSha256 || "", contentType: "video/*", size: input.originalSize || input.size || 0, created_at: input.createdAt.toISOString(), uploaded_at: input.uploadedAt.toISOString() };
  const metadataHash = typeof metadata.hash === "string" ? metadata.hash : null;
  const activeSize = input.activeSize ?? input.size ?? input.originalSize ?? Number(metadata.size || 0);
  database.transaction(() => { database.query("INSERT INTO videos(id,title,description,status,size,sha256_hash,metadata,created_at,uploaded_at,deleted_at,is_hidden) VALUES(?,?,?,?,?,?,?,?,?,?,?)").run(input.id, input.title, input.description || "", input.status, activeSize, input.sha256Hash || input.originalSha256 || metadataHash, JSON.stringify(metadata), input.createdAt.toISOString(), input.uploadedAt.toISOString(), input.deletedAt?.toISOString() || null, Number(input.isHidden)); replaceTags(input.id, input.tags || []); })();
  return getVideo(input.id)!;
}
export function updateVideo(id: string, updates: Omit<Partial<Video>, "tags"> & Record<string, unknown> & { tags?: string[] }) {
  const metadata = (updates.metadata || updates.originalMetadata) as Record<string, unknown> | undefined;
  const setters: string[] = []; const values: unknown[] = []; const add = (key: string, value: unknown) => { setters.push(`${key}=?`); values.push(value); };
  if (Object.hasOwn(updates, "title")) add("title", updates.title); if (Object.hasOwn(updates, "description")) add("description", updates.description ?? ""); if (Object.hasOwn(updates, "status")) add("status", updates.status); if (Object.hasOwn(updates, "size")) add("size", updates.size); else if (Object.hasOwn(updates, "activeSize")) add("size", updates.activeSize); if (Object.hasOwn(updates, "sha256Hash")) add("sha256_hash", updates.sha256Hash); if (metadata) add("metadata", JSON.stringify(metadata)); if (Object.hasOwn(updates, "createdAt") || Object.hasOwn(updates, "date")) add("created_at", dateValue(updates.date ?? updates.createdAt)); if (Object.hasOwn(updates, "uploadedAt")) add("uploaded_at", dateValue(updates.uploadedAt)); if (Object.hasOwn(updates, "deletedAt")) add("deleted_at", updates.deletedAt ? dateValue(updates.deletedAt) : null); if (Object.hasOwn(updates, "isHidden")) add("is_hidden", Number(updates.isHidden));
  if (setters.length) { values.push(id); database.query(`UPDATE videos SET ${setters.join(",")} WHERE id=?`).run(...(values as any[])); }
  if (updates.tags) replaceTags(id, updates.tags);
  return getVideo(id);
}
export type TrashArtifactKind = "original" | "converted";
export type TrashArtifactRow = { videoId: string; artifactKind: TrashArtifactKind; deletedAt: Date; filename: string; title: string; missing: boolean };
export function recordTrashArtifact(videoId: string, artifactKind: TrashArtifactKind, deletedAt = new Date()) {
  database.query("INSERT INTO trash_items(video_id,artifact_kind,deleted_at) VALUES(?,?,?) ON CONFLICT(video_id,artifact_kind) DO UPDATE SET deleted_at=excluded.deleted_at").run(videoId, artifactKind, deletedAt.toISOString());
}
export function removeTrashArtifact(videoId: string, artifactKind: TrashArtifactKind) { database.query("DELETE FROM trash_items WHERE video_id=? AND artifact_kind=?").run(videoId, artifactKind); }
export function trashArtifactsForVideo(videoId: string) { return database.query<{ artifact_kind: TrashArtifactKind; deleted_at: string }, [string]>("SELECT artifact_kind,deleted_at FROM trash_items WHERE video_id=? ORDER BY deleted_at DESC").all(videoId); }
export function allTrashArtifacts() { return database.query<{ video_id: string; artifact_kind: TrashArtifactKind; deleted_at: string }, []>("SELECT video_id,artifact_kind,deleted_at FROM trash_items ORDER BY deleted_at DESC").all(); }
export function listTrashArtifactRows(page = 1, limit = 50) {
  const safeLimit = Math.min(50, Math.max(1, Math.floor(limit)));
  const safePage = Math.max(1, Math.floor(page));
  const total = Number(database.query<{ count: number }, []>("SELECT COUNT(*) count FROM trash_items").get()?.count || 0);
  const rows = database.query<{ video_id: string; artifact_kind: TrashArtifactKind; deleted_at: string; title: string; metadata: string | null }, [number, number]>("SELECT t.video_id,t.artifact_kind,t.deleted_at,v.title,v.metadata FROM trash_items t JOIN videos v ON v.id=t.video_id ORDER BY t.deleted_at DESC LIMIT ? OFFSET ?").all(safeLimit, (safePage - 1) * safeLimit);
  return { items: rows.map((row) => ({ videoId: row.video_id, artifactKind: row.artifact_kind, deletedAt: new Date(row.deleted_at), filename: filename(decodeJson(row.metadata), row.video_id), title: row.title, missing: false })), page: safePage, limit: safeLimit, total, totalPages: Math.max(1, Math.ceil(total / safeLimit)) };
}
export function countTrashArtifacts(videoId: string) { return Number(database.query<{ count: number }, [string]>("SELECT COUNT(*) count FROM trash_items WHERE video_id=?").get(videoId)?.count || 0); }
export function deleteVideo(id: string) { database.query("DELETE FROM videos WHERE id=?").run(id); }

function historyMap(row: HistoryRow): JobHistory { return { id: row.id, videoId: row.video_id, jobType: row.job_type, status: row.status, startedAt: new Date(row.started_at), completedAt: row.completed_at ? new Date(row.completed_at) : null, originalSize: Number(row.original_size), processedSize: Number(row.processed_size), errorMessage: row.error_message, metadata: decodeJson(row.metadata), video: row.video_id && row.video_title !== null ? { id: row.video_id, title: row.video_title, filename: row.video_filename || row.video_id, originalMetadata: decodeJson(row.video_original_metadata) } : null }; }
export function createJobHistory(input: Omit<JobHistory, "id" | "startedAt" | "video"> & { id?: string; startedAt?: Date }) { const id = input.id || crypto.randomUUID(); database.query("INSERT INTO job_history(id,video_id,job_type,status,started_at,completed_at,original_size,processed_size,error_message,metadata) VALUES(?,?,?,?,?,?,?,?,?,?)").run(id, input.videoId, input.jobType, input.status, (input.startedAt || new Date()).toISOString(), input.completedAt?.toISOString() || null, input.originalSize, input.processedSize, input.errorMessage, encodeJson(input.metadata)); return id; }
export function listJobHistory(limit = 100) { return database.query<HistoryRow, [number]>("SELECT j.*,v.title video_title,json_extract(v.metadata,'$.filename') video_filename,v.metadata video_original_metadata FROM job_history j LEFT JOIN videos v ON v.id=j.video_id WHERE j.job_type <> 'TRANSCODE' ORDER BY j.started_at DESC LIMIT ?").all(limit).map(historyMap); }
export function listJobHistoryPage(page = 1, limit = 50) {
  const safeLimit = Math.min(50, Math.max(1, Math.floor(limit)));
  const safePage = Math.max(1, Math.floor(page));
  const total = Number(database.query<{ count: number }, []>("SELECT COUNT(*) count FROM job_history WHERE job_type <> 'TRANSCODE'").get()?.count || 0);
  const items = database.query<HistoryRow, [number, number]>("SELECT j.*,v.title video_title,json_extract(v.metadata,'$.filename') video_filename,v.metadata video_original_metadata FROM job_history j LEFT JOIN videos v ON v.id=j.video_id WHERE j.job_type <> 'TRANSCODE' ORDER BY j.started_at DESC LIMIT ? OFFSET ?").all(safeLimit, (safePage - 1) * safeLimit).map(historyMap);
  return { items, page: safePage, limit: safeLimit, total, totalPages: Math.max(1, Math.ceil(total / safeLimit)) };
}
export function jobHistoryForVideo(videoId: string) { return database.query<HistoryRow, [string]>("SELECT j.*,v.title video_title,json_extract(v.metadata,'$.filename') video_filename,v.metadata video_original_metadata FROM job_history j LEFT JOIN videos v ON v.id=j.video_id WHERE j.video_id=? ORDER BY j.started_at").all(videoId).map(historyMap); }
export function updateJobHistory(id: string, metadata: Record<string, unknown>) { database.query("UPDATE job_history SET metadata=? WHERE id=?").run(JSON.stringify(metadata), id); }
export function search(q: string, isAdmin: boolean, sortField?: VideoSortField, sortOrder?: VideoSortOrder) { const like = `%${q}%`; const tags = database.query<Pick<Tag, "name">, [string]>("SELECT name FROM tags WHERE deleted_at IS NULL AND name LIKE ? COLLATE NOCASE ORDER BY name LIMIT 12").all(like); const visibility = isAdmin ? "" : " AND v.is_hidden=0"; const rows = database.query<{ id: string; title: string; metadata: string }, [string, string, string]>(`SELECT DISTINCT v.id,v.title,v.metadata FROM videos v LEFT JOIN video_tags vt ON vt.video_id=v.id LEFT JOIN tags t ON t.id=vt.tag_id WHERE v.deleted_at IS NULL${visibility} AND (v.title LIKE ? COLLATE NOCASE OR json_extract(v.metadata,'$.filename') LIKE ? COLLATE NOCASE OR t.name LIKE ? COLLATE NOCASE) ORDER BY ${videoOrderBy(sortField, sortOrder, "v.")} LIMIT 20`).all(like, like, like); return { tags, videos: rows.map((row) => ({ id: row.id, title: row.title, filename: filename(decodeJson(row.metadata), row.id) })) }; }
export function getSetting(key: string) { const row = database.query<{ value: string }, [string]>("SELECT value FROM app_settings WHERE key=?").get(key); return row ? decodeJson(row.value) : undefined; }
export function setSetting(key: string, value: unknown) { database.query("INSERT INTO app_settings(key,value,updated_at) VALUES(?,?,?) ON CONFLICT(key) DO UPDATE SET value=excluded.value,updated_at=excluded.updated_at").run(key, JSON.stringify(value), now()); }
database.exec("PRAGMA foreign_keys = ON;");
