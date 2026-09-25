/**
 * One-off importer for the PostgreSQL/Prisma era into the lean SQLite schema.
 *
 *   bun scripts/import-postgres.ts pg-export.json            # dry run, reports only
 *   bun scripts/import-postgres.ts pg-export.json --confirm  # writes rows, copies media
 *
 * Media is copied, never moved, so the PostgreSQL-era layout stays intact for a
 * manual cleanup pass. Expect peak disk usage to roughly double until then.
 */
import { createHash } from "node:crypto";
import { createReadStream, existsSync, mkdirSync, statSync } from "node:fs";
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
if (!exportPath) {
  console.error("Usage: bun scripts/import-postgres.ts <export.json> [--confirm]");
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
const counts = {
  imported: 0,
  skippedMissingOriginal: 0,
  skippedDuplicateHash: 0,
  copiedOriginals: 0,
  copiedConverted: 0,
  copiedThumbnails: 0,
  missingConverted: 0,
  missingThumbnails: 0,
};
const seenHashes = new Map<string, string>();
const importedIds = new Set<string>();
const problems: string[] = [];

for (const video of payload.videos) {
  const originalSource = resolveStoredPath(video.originalPath);
  if (!originalSource || !existsSync(originalSource)) {
    counts.skippedMissingOriginal++;
    problems.push(`${video.id}: original missing at ${video.originalPath}`);
    continue;
  }

  const metadataRecord = video.originalMetadata || {};
  const sourceName = String(
    metadataRecord.originalFilename || metadataRecord.filename || video.filename || `${video.id}`,
  );
  const contentType = String(
    metadataRecord.contentType || (video.mediaType === "IMAGE" ? "image/*" : "video/*"),
  );

  const hash = await hashFile(originalSource);
  const clash = seenHashes.get(hash);
  if (clash) {
    counts.skippedDuplicateHash++;
    problems.push(`${video.id}: duplicate sha256 of ${clash}, skipped (unique index)`);
    continue;
  }
  seenHashes.set(hash, video.id);

  const originalSize = Number(video.originalSize) || statSync(originalSource).size;
  const metadata = normalizeMediaMetadata({
    id: video.id,
    filename: sourceName,
    hash,
    contentType,
    size: originalSize,
    createdAt: video.createdAt,
    uploadedAt: video.uploadedAt,
    raw: metadataRecord,
    width: video.width ?? undefined,
    height: video.height ?? undefined,
    duration: video.duration ?? undefined,
  });

  const originalTarget = vaultArtifactPath(video.id, sourceName, "original", video.mediaType);
  if ((await copyInto(originalSource, originalTarget)) === "copied") counts.copiedOriginals++;

  const convertedSource = video.processedPath ? resolveStoredPath(video.processedPath) : null;
  let convertedSize = 0;
  if (convertedSource && existsSync(convertedSource)) {
    const convertedTarget = vaultArtifactPath(video.id, sourceName, "converted", video.mediaType);
    if ((await copyInto(convertedSource, convertedTarget)) === "copied") counts.copiedConverted++;
    convertedSize = Number(video.processedSize) || statSync(convertedSource).size;
  } else if (video.processedPath) {
    counts.missingConverted++;
    problems.push(`${video.id}: converted artifact missing at ${video.processedPath}`);
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
console.log(`  videos      ${counts.imported} of ${payload.videos.length}`);
console.log(`  tags        ${tagNames.size} distinct, ${payload.video_tags.length} links`);
console.log(`  history     ${historyImported} rows (${historyOrphaned} orphaned to null)`);
console.log(`  settings    ${settingsImported} kept`);
console.log(
  `  media       originals ${counts.copiedOriginals} copied, converted ${counts.copiedConverted} copied, thumbnails ${counts.copiedThumbnails} present`,
);
console.log(
  `  gaps        ${counts.skippedMissingOriginal} missing originals, ${counts.skippedDuplicateHash} duplicate hashes, ${counts.missingConverted} missing converted, ${counts.missingThumbnails} missing thumbnails`,
);
if (problems.length) {
  console.log("\nDetails:");
  for (const problem of problems.slice(0, 40)) console.log(`  - ${problem}`);
  if (problems.length > 40) console.log(`  ... and ${problems.length - 40} more`);
}
if (confirm) setSetting("legacy_infrastructure_migrated", true);


