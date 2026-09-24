import "../src/lib/database";
import { database, setSetting } from "../src/lib/database";
import { createHash } from "node:crypto";
import { createReadStream, existsSync } from "node:fs";
import path from "node:path";
import { resolveStoredPath } from "../src/lib/paths";

const requiredVideoColumns = [
  "id",
  "title",
  "status",
  "size",
  "sha256_hash",
  "metadata",
  "created_at",
  "uploaded_at",
  "deleted_at",
  "is_hidden",
];
const removedVideoColumns = [
  "filename",
  "original_path",
  "processed_path",
  "description",
  "media_type",
  "original_size",
  "processed_size",
  "duration",
  "width",
  "height",
  "date",
  "updated_at",
  "active_path",
  "active_size",
  "active_metadata",
  "original_sha256",
];

const videoColumns = new Set(
  database
    .query<{ name: string }, []>("PRAGMA table_info(videos)")
    .all()
    .map((row) => row.name),
);
const missingColumns = requiredVideoColumns.filter((column) => !videoColumns.has(column));
const presentRemovedColumns = removedVideoColumns.filter((column) => videoColumns.has(column));
if (missingColumns.length || presentRemovedColumns.length) {
  throw new Error(
    `SQLite schema is not lean (missing: ${missingColumns.join(", ") || "none"}; removed columns present: ${presentRemovedColumns.join(", ") || "none"})`,
  );
}

const tables = database
  .query<{ name: string }, []>(
    "SELECT name FROM sqlite_master WHERE type = 'table' ORDER BY name",
  )
  .all()
  .map((row) => row.name);
if (!tables.includes("videos")) {
  throw new Error("SQLite migration did not create the required videos table");
}
if (tables.includes("artifacts")) {
  throw new Error("SQLite migration left the artifacts table behind");
}

const hashIndex = database
  .query<{ name: string; sql: string | null }, []>(
    "SELECT name, sql FROM sqlite_master WHERE type = 'index' AND name = 'videos_sha256_hash_idx'",
  )
  .get();
if (!hashIndex || !hashIndex.sql?.toUpperCase().includes("UNIQUE")) {
  throw new Error("SQLite migration did not create the unique SHA-256 index");
}

const unhashed = database
  .query<{ id: string; metadata: string | null }, []>(
    `SELECT id, metadata
     FROM videos
     WHERE sha256_hash IS NULL
     ORDER BY uploaded_at, id`,
  )
  .all();
let backfilledHashes = 0;
let missingOriginals = 0;
let duplicateOriginals = 0;

for (const video of unhashed) {
  let filename = `${video.id}.webm`;
  try {
    const metadata = video.metadata ? JSON.parse(video.metadata) : null;
    if (metadata && typeof metadata.filename === "string" && metadata.filename) {
      filename = metadata.filename;
    }
  } catch {
    // Use the deterministic WebM fallback when metadata is malformed.
  }
  const extension = path.extname(filename).toLowerCase() || ".webm";
  const candidates = [
    resolveStoredPath(`.uploads/${video.id}${extension}`),
    resolveStoredPath(`vault/${video.id}${extension}`),
  ];
  const originalPath = candidates.find((candidate) => candidate && existsSync(candidate)) || null;
  if (!originalPath) {
    missingOriginals++;
    continue;
  }

  const hash = createHash("sha256");
  try {
    for await (const chunk of createReadStream(originalPath)) hash.update(chunk);
  } catch (error) {
    if (
      error &&
      typeof error === "object" &&
      "code" in error &&
      (error.code === "ENOENT" || error.code === "ENOTDIR")
    ) {
      missingOriginals++;
      continue;
    }
    throw error;
  }

  const sha256Hash = hash.digest("hex");
  const matchingVideo = database
    .query<{ id: string }, [string]>("SELECT id FROM videos WHERE sha256_hash = ?")
    .get(sha256Hash);
  if (matchingVideo && matchingVideo.id !== video.id) {
    duplicateOriginals++;
    continue;
  }

  let metadata: Record<string, unknown> = {};
  try {
    const parsed = video.metadata ? JSON.parse(video.metadata) : {};
    if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) metadata = parsed;
  } catch {
    metadata = {};
  }
  metadata.hash = sha256Hash;
  database
    .query("UPDATE videos SET sha256_hash = ?, metadata = ? WHERE id = ? AND sha256_hash IS NULL")
    .run(sha256Hash, JSON.stringify(metadata), video.id);
  backfilledHashes++;
}

setSetting("legacy_infrastructure_migrated", true);

console.log(`SQLite schema is ready (${tables.length} tables).`);
console.log(
  `Backfilled ${backfilledHashes} upload hashes; skipped ${missingOriginals} missing files and ${duplicateOriginals} duplicate originals.`,
);
