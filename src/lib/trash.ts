import { readdir, copyFile, mkdir, rename, stat, unlink } from "node:fs/promises";
import path from "node:path";
import { getDataPath, resolveStoredPath, toStoredPath, vaultArtifactPath } from "./paths";
import {
  createJobHistory,
  deleteVideo,
  getVideo,
  listVideos,
  listDeletedVideos,
  allTrashArtifacts,
  listTrashArtifactRows,
  recordTrashArtifact,
  removeTrashArtifact,
  trashArtifactsForVideo,
  countTrashArtifacts,
  updateVideo,
  type Video,
} from "./database";
import { enqueueVideoJob, removePendingJobsForVideo } from "./queue";

export type TrashArtifactKind = "original" | "converted";

const TRASH_DIR = ".trashed";

function extension(filename: string, fallback: string) {
  const value = path.extname(filename).toLowerCase();
  return value || fallback;
}

function normalizeKind(kind: TrashArtifactKind | "processed"): TrashArtifactKind {
  return kind === "processed" ? "converted" : kind;
}

function convertedExtension(filename: string) {
  return /\.(png|jpe?g|gif|avif|webp)$/i.test(filename) ? ".webp" : ".webm";
}

function artifactDirectory(kind: TrashArtifactKind) {
  return path.join(getDataPath(), TRASH_DIR, kind);
}

function legacyDirectory() {
  return path.join(getDataPath(), TRASH_DIR);
}

export function trashArtifactPath(
  id: string,
  filename: string,
  kind: TrashArtifactKind | "processed",
) {
  const normalized = normalizeKind(kind);
  const suffix = normalized === "original"
    ? extension(filename, convertedExtension(filename))
    : convertedExtension(filename);
  const directory = kind === "processed"
    ? path.join(getDataPath(), TRASH_DIR, "processed")
    : artifactDirectory(normalized);
  return path.join(directory, `${id}${suffix}`);
}

async function findArtifact(id: string, filename: string, kind: TrashArtifactKind) {
  const normalized = normalizeKind(kind);
  const candidates = [trashArtifactPath(id, filename, normalized)];
  if (normalized === "converted") {
    candidates.push(
      path.join(getDataPath(), TRASH_DIR, "processed", `${id}.webm`),
      path.join(getDataPath(), TRASH_DIR, "processed", `${id}.webp`),
    );
  }
  const directories = normalized === "original"
    ? [artifactDirectory(normalized), legacyDirectory()]
    : [artifactDirectory(normalized), path.join(getDataPath(), TRASH_DIR, "processed")];
  for (const directory of directories) {
    try {
      for (const entry of await readdir(directory)) {
        if (entry.startsWith(`${id}.`)) candidates.push(path.join(directory, entry));
      }
    } catch {
      // A missing trash directory means the artifact is missing.
    }
  }
  for (const candidate of new Set(candidates)) {
    try {
      await stat(candidate);
      return candidate;
    } catch {
      // Try the next known extension.
    }
  }
  return null;
}

async function syncTrashIndex() {
  const videos = [...listVideos(), ...listDeletedVideos()];
  const seen = new Set<string>();
  for (const video of videos) {
    if (seen.has(video.id)) continue;
    seen.add(video.id);
    let found = 0;
    for (const kind of ["original", "converted"] as const) {
      if (await findArtifact(video.id, video.filename, kind)) {
        recordTrashArtifact(video.id, kind);
        found += 1;
      }
    }
    if (video.deletedAt && found === 0) recordTrashArtifact(video.id, "original");
  }
}

export async function moveToTrash(
  source: string,
  id: string,
  filename: string,
  kind: TrashArtifactKind | "processed",
) {
  const normalized = normalizeKind(kind);
  const target = trashArtifactPath(id, filename, normalized);
  await mkdir(path.dirname(target), { recursive: true });
  if (path.resolve(source) === path.resolve(target)) {
    recordTrashArtifact(id, normalized);
    return toStoredPath(target);
  }
  await stat(source);
  await unlink(target).catch(() => {});
  try {
    await rename(source, target);
  } catch {
    // A browser may still have the original open on Windows. Copy first so
    // the converted artifact can remain active without losing the backup.
    await copyFile(source, target);
    await unlink(source).catch(() => {});
  }
  recordTrashArtifact(id, normalized);
  return toStoredPath(target);
}

export async function removeTrashArtifacts(id: string, filename: string) {
  const paths = new Set<string>();
  for (const kind of ["original", "converted"] as const) {
    const found = await findArtifact(id, filename, kind);
    if (found) paths.add(found);
    removeTrashArtifact(id, kind);
  }
  for (const file of paths) await unlink(file).catch(() => {});
  return paths.size;
}

export async function originalTrashArtifactExists(id: string, filename: string) {
  return Boolean(await findArtifact(id, filename, "original"));
}

function resolvedPath(value: string | null | undefined) {
  if (!value) return null;
  return resolveStoredPath(value);
}

export async function softDeleteVideo(video: Video, jobType: "DELETE" | "CANCELLED" = "DELETE", details: Record<string, unknown> = {}) {
  const kind: TrashArtifactKind = video.processedPath && video.activePath === video.processedPath ? "converted" : "original";
  const active = resolvedPath(video.activePath);
  let trashPath: string | null = null;
  if (active) {
    try {
      trashPath = await moveToTrash(active, video.id, video.filename, kind);
    } catch {
      recordTrashArtifact(video.id, kind);
    }
  } else {
    recordTrashArtifact(video.id, kind);
  }
  removePendingJobsForVideo(video.id);
  const deletedAt = new Date();
  updateVideo(video.id, { deletedAt });
  createJobHistory({
    videoId: video.id,
    jobType,
    status: "COMPLETED",
    completedAt: deletedAt,
    originalSize: video.originalSize,
    processedSize: video.processedSize,
    errorMessage: null,
    metadata: { videoId: video.id, filename: video.filename, artifactKind: kind, trashPath, ...details },
  });
  return { artifactKind: kind, trashPath };
}

export async function restoreTrashArtifact(id: string, kind: TrashArtifactKind) {
  const video = getVideo(id);
  if (!video) return { status: "not_found" as const };
  const source = await findArtifact(id, video.filename, kind);
  if (!source) {
    recordTrashArtifact(id, kind);
    return { status: "missing" as const };
  }

  const otherKind: TrashArtifactKind = kind === "original" ? "converted" : "original";
  const otherPath = resolvedPath(otherKind === "original" ? video.originalPath : video.processedPath);
  if (otherPath) {
    try { await moveToTrash(otherPath, video.id, video.filename, otherKind); } catch { /* already in trash */ }
  }

  const target = vaultArtifactPath(video.id, video.filename, kind, video.mediaType);
  await mkdir(path.dirname(target), { recursive: true });
  await unlink(target).catch(() => {});
  try {
    await rename(source, target);
  } catch {
    await copyFile(source, target);
    await unlink(source).catch(() => {});
  }
  removeTrashArtifact(video.id, kind);
  await unlink(path.join(getDataPath(), ".thumbnails", `${video.id}.webp`)).catch(() => {});

  const requeue = kind === "original" && video.status !== "COMPLETED";
  removePendingJobsForVideo(video.id);
  updateVideo(video.id, { deletedAt: null, status: requeue ? "QUEUED" : "COMPLETED" });
  createJobHistory({
    videoId: video.id,
    jobType: "RESTORE",
    status: "COMPLETED",
    completedAt: new Date(),
    originalSize: video.originalSize,
    processedSize: video.processedSize,
    errorMessage: null,
    metadata: { artifactKind: kind, restoredPath: toStoredPath(target), requeued: requeue },
  });
  if (requeue) enqueueVideoJob({ videoId: video.id, filePath: toStoredPath(target) });
  return { status: "restored" as const, requeued: requeue };
}

export async function restoreVideoFromTrash(id: string) {
  const video = getVideo(id);
  if (!video) return { status: "not_found" as const };
  const kind = trashArtifactsForVideo(id)[0]?.artifact_kind || "original";
  return restoreTrashArtifact(id, kind);
}

export async function permanentlyDeleteVideo(id: string) {
  const video = getVideo(id);
  if (!video) return false;
  await removeTrashArtifacts(video.id, video.filename);
  for (const candidate of [video.originalPath, video.processedPath, video.activePath]) {
    const file = resolvedPath(candidate);
    if (file) await unlink(file).catch(() => {});
  }
  for (const suffix of [".webm", ".webp"]) {
    await unlink(path.join(getDataPath(), "processed", `${video.id}${suffix}`)).catch(() => {});
  }
  deleteVideo(video.id);
  return true;
}

export async function permanentlyDeleteArtifact(id: string, kind: TrashArtifactKind) {
  const video = getVideo(id);
  if (!video) return false;
  const source = await findArtifact(id, video.filename, kind);
  if (source) await unlink(source).catch(() => {});
  removeTrashArtifact(id, kind);
  if (video.deletedAt && countTrashArtifacts(id) === 0) deleteVideo(id);
  return true;
}

export async function purgeExpiredTrash() {
  const expiry = Date.now() - 14 * 24 * 60 * 60 * 1000;
  let purged = 0;
  for (const row of allTrashArtifacts()) {
    if (new Date(row.deleted_at).getTime() <= expiry) {
      if (await permanentlyDeleteArtifact(row.video_id, row.artifact_kind)) purged += 1;
    }
  }
  return purged;
}

export async function listTrashItems(page = 1, limit = 50) {
  await syncTrashIndex();
  await purgeExpiredTrash();
  const result = listTrashArtifactRows(page, limit);
  const items = await Promise.all(result.items.map(async (item) => ({
    ...item,
    deletedAt: item.deletedAt.toISOString(),
    missing: !(await findArtifact(item.videoId, item.filename, item.artifactKind)),
  })));
  return { ...result, items };
}

export async function clearTrash() {
  await syncTrashIndex();
  for (const row of allTrashArtifacts()) {
    await permanentlyDeleteArtifact(row.video_id, row.artifact_kind);
  }
  for (const video of listDeletedVideos()) {
    if (countTrashArtifacts(video.id) === 0) await permanentlyDeleteVideo(video.id);
  }
}
