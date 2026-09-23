import "../src/lib/database";
import { database, setSetting } from "../src/lib/database";
import { createHash } from "node:crypto";
import { createReadStream } from "node:fs";
import path from "node:path";
import { resolveStoredPath } from "../src/lib/paths";

const tables = database
  .query<{ name: string }, []>(
    "SELECT name FROM sqlite_master WHERE type = 'table' ORDER BY name",
  )
  .all()
  .map((row) => row.name);

if (!tables.includes("videos") || !tables.includes("job_history")) {
  throw new Error("SQLite migration did not create the required tables");
}

const mediaPaths = database
  .query<
    { original_path: string; processed_path: string | null; active_path: string },
    []
  >("SELECT original_path, processed_path, active_path FROM videos")
  .all();
const hasAbsoluteMediaPath = mediaPaths.some((video) =>
  [video.original_path, video.processed_path, video.active_path].some(
    (value) =>
      value !== null &&
      (path.isAbsolute(value) || path.posix.isAbsolute(value) || path.win32.isAbsolute(value)),
  ),
);

if (hasAbsoluteMediaPath) {
  throw new Error("SQLite migration left an absolute media path in the database");
}

database.exec("PRAGMA journal_mode = WAL;");

const unhashedOriginals = database
  .query<{ id: string; original_path: string }, []>(
    `SELECT id, original_path
     FROM videos
     WHERE original_sha256 IS NULL
     ORDER BY uploaded_at, id`,
  )
  .all();
let backfilledHashes = 0;
let missingOriginals = 0;
let duplicateOriginals = 0;

for (const video of unhashedOriginals) {
  const originalPath = resolveStoredPath(video.original_path);
  if (!originalPath) {
    missingOriginals++;
    continue;
  }

  const hash = createHash("sha256");
  try {
    for await (const chunk of createReadStream(originalPath)) {
      hash.update(chunk);
    }
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

  const originalSha256 = hash.digest("hex");
  const matchingVideo = database
    .query<{ id: string }, [string]>(
      "SELECT id FROM videos WHERE original_sha256 = ?",
    )
    .get(originalSha256);
  if (matchingVideo && matchingVideo.id !== video.id) {
    duplicateOriginals++;
    continue;
  }

  database
    .query(
      "UPDATE videos SET original_sha256 = ? WHERE id = ? AND original_sha256 IS NULL",
    )
    .run(originalSha256, video.id);
  backfilledHashes++;
}

setSetting("legacy_infrastructure_migrated", true);

console.log(`SQLite schema is ready (${tables.length} tables).`);
console.log(
  `Backfilled ${backfilledHashes} original upload hashes; skipped ${missingOriginals} missing files and ${duplicateOriginals} duplicate originals.`,
);
