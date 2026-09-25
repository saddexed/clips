/**
 * One-off importer for the PostgreSQL/Prisma era into the lean SQLite schema.
 *
 *   bun scripts/import-postgres.ts pg-export.json            # dry run, reports only
 *   bun scripts/import-postgres.ts pg-export.json --confirm  # writes rows, copies media
 *
 * Add --skip-hashes to import without reading every original back off disk. The
 * hash column stays NULL, which the partial unique index allows; upload dedupe
 * simply won't recognize those videos until `bun run migrate:sqlite3` fills it in.
 *
 * Media is copied, never moved, so the PostgreSQL-era layout stays intact for a
 * manual cleanup pass. Expect peak disk usage to roughly double until then.
 */
import { createHash } from "node:crypto";
import { createReadStream, existsSync, mkdirSync, readdirSync, statSync } from "node:fs";
import { copyFile } from "node:fs/promises";
import path from "node:path";
import { createJobHistory, createVideo, database, setSetting } from "../src/lib/database";
import type { JobStatus, JobType, MediaType, VideoStatus } from "../src/lib/database";
import { normalizeMediaMetadata } from "../src/lib/media";
import { getDataPath, resolveStoredPath, vaultArtifactPath } from "../src/lib/paths";

type ExportedVideo = {
  id: string;
  filename: string;
  originalPath: string;
  processedPath: string | null;
  originalMetadata: Record<string, unknown> | null;
  title: string;
  description: string;
  mediaType: MediaType;
  status: VideoStatus;
  originalSize: number;
  processedSize: number;
  duration: number | null;
  width: number | null;
  height: number | null;
  isHidden: boolean;
  createdAt: string;
  uploadedAt: string;
  date: string | null;
  updatedAt: string | null;
  deletedAt: string | null;
};

type ExportedTag = { id: string; name: string };
type ExportedVideoTag = { A: string; B: string };
type ExportedJob = {
  id: string;
  videoId: string | null;
  jobType: JobType;
  status: JobStatus;
  originalSize: number;
  processedSize: number;
  errorMessage: string | null;
  metadata: Record<string, unknown> | null;
  startedAt: string;
  completedAt: string | null;
};
type ExportedSetting = { key: string; value: unknown; updated_at: string };

type Payload = {
  videos: ExportedVideo[];
  tags: ExportedTag[];
  video_tags: ExportedVideoTag[];
  job_history: ExportedJob[];
  app_settings?: ExportedSetting[];
};

/** Settings that belonged to the removed comments feature. */
const OBSOLETE_SETTINGS = new Set(["default_comments_enabled", "global_comments_enabled"]);

const [exportPath] = process.argv.slice(2).filter((arg) => !arg.startsWith("--"));
const confirm = process.argv.includes("--confirm");
const skipHashes = process.argv.includes("--skip-hashes");
if (!exportPath) {
  console.error(
    "Usage: bun scripts/import-postgres.ts <export.json> [--confirm] [--skip-hashes]",
  );
  process.exit(1);
}

const payload = (await Bun.file(exportPath).json()) as Payload;
for (const key of ["videos", "tags", "video_tags", "job_history"] as const) {
  if (!Array.isArray(payload[key])) throw new Error(`Export is missing the ${key} array`);
}

const existingVideos = Number(
  database.query<{ count: number }, []>("SELECT COUNT(*) count FROM videos").get()?.count || 0,
);
if (existingVideos && confirm) {
  throw new Error(
    `Refusing to import into a non-empty videos table (${existingVideos} rows). Start from an empty data/clips.db.`,
  );
}

/** _VideoTags.A references tags, .B references videos. */
const tagNames = new Map(payload.tags.map((tag) => [tag.id, tag.name]));
const tagsByVideo = new Map<string, string[]>();
for (const link of payload.video_tags) {
  const name = tagNames.get(link.A);
  if (!name) continue;
  const names = tagsByVideo.get(link.B) || [];
  names.push(name);
  tagsByVideo.set(link.B, names);
}

function hashFile(file: string) {
  const digest = createHash("sha256");
  return new Promise<string>((resolve, reject) => {
    const stream = createReadStream(file);
    stream.on("data", (chunk) => digest.update(chunk));
    stream.on("error", reject);
    stream.on("end", () => resolve(digest.digest("hex")));
  });
}

async function copyInto(source: string, target: string) {
  if (existsSync(target)) return "present" as const;
  if (!confirm) return "planned" as const;
  mkdirSync(path.dirname(target), { recursive: true });
  await copyFile(source, target);
  return "copied" as const;
}

const dataPath = getDataPath();

/**
 * Recorded paths go stale when a later build reorganizes storage, so index every
 * layout this project has used and look artifacts up by id instead. Ordered by
 * preference: the flat `vault/` of the intermediate builds comes last because an
 * original and its transcode could collide there when both were WebM.
 */
const ORIGINAL_DIRS = [".uploads", "vault/original", "vault"];
const CONVERTED_DIRS = ["processed", "vault/converted", "vault"];

function indexDirectory(relative: string) {
  const absolute = path.join(dataPath, relative);
  const index = new Map<string, string[]>();
  if (!existsSync(absolute)) return index;
  for (const entry of readdirSync(absolute, { withFileTypes: true })) {
    if (!entry.isFile()) continue;
    const id = path.basename(entry.name, path.extname(entry.name));
    const found = index.get(id) || [];
    found.push(path.join(absolute, entry.name));
    index.set(id, found);
  }
  return index;
}

const directoryIndex = new Map(
  [...new Set([...ORIGINAL_DIRS, ...CONVERTED_DIRS])].map((dir) => [dir, indexDirectory(dir)]),
);

/** Resolves an artifact by id, preferring `preferredExt` when several exist. */
function locate(dirs: string[], id: string, preferredExt: string | null, exclude?: string | null) {
  for (const dir of dirs) {
    const matches = (directoryIndex.get(dir)?.get(id) || []).filter((file) => file !== exclude);
    if (!matches.length) continue;
    const preferred = preferredExt
      ? matches.find((file) => path.extname(file).toLowerCase() === preferredExt)
      : null;
    return { file: preferred || matches[0], dir };
  }
  return null;
}

const counts = {
  imported: 0,
  missingOriginal: 0,
  skippedDuplicateHash: 0,
  copiedOriginals: 0,
  copiedConverted: 0,
  copiedThumbnails: 0,
  missingConverted: 0,
  missingThumbnails: 0,
  unhashed: 0,
};
const foundIn = new Map<string, number>();
const seenHashes = new Map<string, string>();
const importedIds = new Set<string>();
const problems: string[] = [];

for (const video of payload.videos) {
  const metadataRecord = video.originalMetadata || {};
  const sourceName = String(
    metadataRecord.originalFilename || metadataRecord.filename || video.filename || `${video.id}`,
  );
  const contentType = String(
    metadataRecord.contentType || (video.mediaType === "IMAGE" ? "image/*" : "video/*"),
  );
  const preferredExt = path.extname(sourceName).toLowerCase() || null;

  const recorded = resolveStoredPath(video.originalPath);
  const located = recorded && existsSync(recorded)
    ? { file: recorded, dir: "recorded" }
    : locate(ORIGINAL_DIRS, video.id, preferredExt);
  const originalSource = located?.file || null;
  if (located) foundIn.set(located.dir, (foundIn.get(located.dir) || 0) + 1);
  else {
    counts.missingOriginal++;
    problems.push(`${video.id}: no original found for ${sourceName}`);
  }

  // The hash is best effort: PostgreSQL never stored one, so it can only come from
  // the bytes. A row without it imports fine - the unique index is partial - but
  // upload dedupe cannot recognize that video until it is rehashed.
  let hash: string | null = null;
  if (originalSource && !skipHashes) {
    hash = await hashFile(originalSource);
    const clash = seenHashes.get(hash);
    if (clash) {
      counts.skippedDuplicateHash++;
      problems.push(`${video.id}: duplicate sha256 of ${clash}, skipped (unique index)`);
      continue;
    }
    seenHashes.set(hash, video.id);
  } else {
    counts.unhashed++;
  }

  const originalSize =
    Number(video.originalSize) || (originalSource ? statSync(originalSource).size : 0);
  const metadata = normalizeMediaMetadata({
    id: video.id,
    filename: sourceName,
    hash: hash || "",
    contentType,
    size: originalSize,
    createdAt: video.createdAt,
    uploadedAt: video.uploadedAt,
    raw: metadataRecord,
    width: video.width ?? undefined,
    height: video.height ?? undefined,
    duration: video.duration ?? undefined,
  });
  // createVideo falls back to metadata.hash for the column, and an empty string is
  // NOT NULL - the partial unique index would reject the second unhashed video.
  // Dropping the key keeps sha256_hash genuinely NULL.
  if (!hash) delete (metadata as Partial<typeof metadata>).hash;

  if (originalSource) {
    const originalTarget = vaultArtifactPath(video.id, sourceName, "original", video.mediaType);
    if ((await copyInto(originalSource, originalTarget)) === "copied") counts.copiedOriginals++;
  }

  const recordedConverted = video.processedPath ? resolveStoredPath(video.processedPath) : null;
  // Exclude the original so a flat vault/<id>.webm is never claimed as both.
  const converted = recordedConverted && existsSync(recordedConverted)
    ? { file: recordedConverted, dir: "recorded" }
    : locate(CONVERTED_DIRS, video.id, ".webm", originalSource);
  let convertedSize = 0;
  if (converted) {
    const convertedTarget = vaultArtifactPath(video.id, sourceName, "converted", video.mediaType);
    if ((await copyInto(converted.file, convertedTarget)) === "copied") counts.copiedConverted++;
    convertedSize = Number(video.processedSize) || statSync(converted.file).size;
  } else if (video.processedPath) {
    counts.missingConverted++;
    problems.push(`${video.id}: no converted artifact found (recorded ${video.processedPath})`);
  }

  // Thumbnails still live at .thumbnails/<id>.webp at HEAD, so they need no move -
  // only a presence check, since a missing one means a blank card in the gallery.
  if (existsSync(path.join(dataPath, ".thumbnails", `${video.id}.webp`))) {
    counts.copiedThumbnails++;
  } else {
    counts.missingThumbnails++;
  }

  if (confirm) {
    createVideo({
      id: video.id,
      title: video.title || sourceName,
      description: video.description || "",
      status: video.status,
      size: convertedSize || originalSize,
      sha256Hash: hash,
      metadata,
      createdAt: new Date(video.createdAt),
      uploadedAt: new Date(video.uploadedAt),
      deletedAt: video.deletedAt ? new Date(video.deletedAt) : null,
      isHidden: Boolean(video.isHidden),
      tags: tagsByVideo.get(video.id) || [],
    });
  }
  importedIds.add(video.id);
  counts.imported++;
}

let historyImported = 0;
let historyOrphaned = 0;
for (const job of payload.job_history) {
  // job_history.video_id is ON DELETE SET NULL, so rows for skipped videos are
  // retained with a null reference rather than dropped.
  const videoId = job.videoId && importedIds.has(job.videoId) ? job.videoId : null;
  if (job.videoId && !videoId) historyOrphaned++;
  if (confirm) {
    createJobHistory({
      id: job.id,
      videoId,
      jobType: job.jobType,
      status: job.status,
      startedAt: new Date(job.startedAt),
      completedAt: job.completedAt ? new Date(job.completedAt) : null,
      originalSize: Number(job.originalSize) || 0,
      processedSize: Number(job.processedSize) || 0,
      errorMessage: job.errorMessage,
      metadata: job.metadata,
    });
  }
  historyImported++;
}

let settingsImported = 0;
for (const setting of payload.app_settings || []) {
  if (OBSOLETE_SETTINGS.has(setting.key)) continue;
  if (confirm) setSetting(setting.key, setting.value);
  settingsImported++;
}

console.log(confirm ? "Import complete." : "Dry run - nothing was written. Re-run with --confirm.");
console.log(`  data root   ${dataPath}`);
console.log(`  videos      ${counts.imported} of ${payload.videos.length}`);
console.log(`  tags        ${tagNames.size} distinct, ${payload.video_tags.length} links`);
console.log(`  history     ${historyImported} rows (${historyOrphaned} orphaned to null)`);
console.log(`  settings    ${settingsImported} kept`);
console.log(
  `  media       originals ${counts.copiedOriginals} copied, converted ${counts.copiedConverted} copied, thumbnails ${counts.copiedThumbnails} present`,
);
console.log(
  `  originals   ${[...foundIn].map(([dir, n]) => `${dir} ${n}`).join(", ") || "none resolved"}`,
);
console.log(
  `  gaps        ${counts.missingOriginal} missing originals, ${counts.unhashed} unhashed, ${counts.skippedDuplicateHash} duplicate hashes, ${counts.missingConverted} missing converted, ${counts.missingThumbnails} missing thumbnails`,
);
if (problems.length) {
  console.log("\nDetails:");
  for (const problem of problems.slice(0, 40)) console.log(`  - ${problem}`);
  if (problems.length > 40) console.log(`  ... and ${problems.length - 40} more`);
}
if (confirm) setSetting("legacy_infrastructure_migrated", true);


