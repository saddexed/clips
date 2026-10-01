import { expect, test } from "bun:test";
import { mkdir, mkdtemp, rename, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import {
  createVideo,
  deleteVideo,
  findVideoIdByOriginalSha256,
  getVideo,
  getVideoLibraryStats,
  listVideosPage,
  listVideos,
  updateVideo,
  recordTrashArtifact,
  trashArtifactsForVideo,
} from "./database";
import { hashBytes } from "./hash";
import { toStoredPath, vaultArtifactPath } from "./paths";

test("serves the original until the worker publishes a completed transcode", async () => {
  const id = crypto.randomUUID();
  const filename = `${id}.mp4`;
  const previousDataPath = process.env.DATA_PATH;
  const directory = await mkdtemp(path.join(tmpdir(), "clips-preview-"));
  process.env.DATA_PATH = directory;
  try {
    const originalPath = vaultArtifactPath(id, filename, "original");
    const convertedPath = vaultArtifactPath(id, filename, "converted");
    const temporaryPath = path.join(directory, "processed", `${id}.webm`);
    await mkdir(path.dirname(originalPath), { recursive: true });
    await mkdir(path.dirname(temporaryPath), { recursive: true });
    await writeFile(originalPath, "full original");
    await writeFile(temporaryPath, "incomplete transcode");

    const now = new Date();
    createVideo({
      id, filename, title: "processing preview", status: "QUEUED",
      originalSha256: hashBytes(new TextEncoder().encode(id)), originalSize: 13,
      createdAt: now, uploadedAt: now, isHidden: false,
    });
    const original = toStoredPath(originalPath);
    expect(getVideo(id)?.activePath).toBe(original);
    updateVideo(id, { status: "PROCESSING" });
    expect(getVideo(id)?.activePath).toBe(original);
    expect(getVideo(id)?.processedPath).toBeNull();

    // Completed legacy records may still store their final file in processed/.
    updateVideo(id, { status: "COMPLETED" });
    expect(getVideo(id)?.activePath).toBe(`processed/${id}.webm`);
    await mkdir(path.dirname(convertedPath), { recursive: true });
    await rename(temporaryPath, convertedPath);
    expect(getVideo(id)?.activePath).toBe(toStoredPath(convertedPath));
  } finally {
    deleteVideo(id);
    if (previousDataPath === undefined) delete process.env.DATA_PATH;
    else process.env.DATA_PATH = previousDataPath;
    await rm(directory, { recursive: true, force: true });
  }
});

test("original upload hashes are unique in SQLite", () => {
  const originalSha256 = hashBytes(
    new TextEncoder().encode(crypto.randomUUID()),
  );
  const firstId = crypto.randomUUID();
  const duplicateId = crypto.randomUUID();
  const now = new Date();
  const makeVideo = (id: string) => ({
    id,
    filename: `${id}.mp4`,
    originalPath: `.uploads/${id}.mp4`,
    originalSha256,
    originalMetadata: null,
    title: "hash uniqueness test",
    description: "",
    mediaType: "VIDEO" as const,
    status: "QUEUED" as const,
    originalSize: 1,
    createdAt: now,
    uploadedAt: now,
    date: now,
    isHidden: false,
  });

  try {
    createVideo(makeVideo(firstId));
    expect(findVideoIdByOriginalSha256(originalSha256)).toBe(firstId);
    expect(() => createVideo(makeVideo(duplicateId))).toThrow();
    expect(findVideoIdByOriginalSha256(originalSha256)).toBe(firstId);
  } finally {
    deleteVideo(firstId);
    deleteVideo(duplicateId);
  }
});

test("date and upload sorting span pages and preserve the original media date", () => {
  const ids = Array.from({ length: 3 }, () => crypto.randomUUID());
  const title = `sort-${ids[0]}`;
  const originals = ["2023-01-01", "2025-01-01", "2024-01-01"].map((day) => new Date(`${day}T12:00:00Z`));
  const uploads = ["2025-02-01", "2023-02-01", "2024-02-01"].map((day) => new Date(`${day}T12:00:00Z`));

  try {
    ids.forEach((id, index) => createVideo({
      id, title, filename: `${id}.mp4`, status: "QUEUED",
      originalSha256: hashBytes(new TextEncoder().encode(id)), originalSize: 1,
      createdAt: originals[index], uploadedAt: uploads[index], isHidden: false,
    }));

    const page = (number: number, sortField: "date" | "uploadedAt" = "date") =>
      listVideosPage({ page: number, limit: 2, query: title, sortField });
    expect(page(1).items.map((video) => video.id)).toEqual([ids[1], ids[2]]);
    expect(page(2).items.map((video) => video.id)).toEqual([ids[0]]);
    expect(listVideosPage({ page: 1, limit: 2, query: title, sortField: "date", sortOrder: "asc" }).items.map((video) => video.id)).toEqual([ids[0], ids[2]]);
    expect(page(1, "uploadedAt").items.map((video) => video.id)).toEqual([ids[0], ids[2]]);
    expect(page(2, "uploadedAt").items.map((video) => video.id)).toEqual([ids[1]]);

    const custom = new Date("2026-01-01T12:00:00Z");
    updateVideo(ids[0], { date: custom });
    expect(page(1).items[0].id).toBe(ids[0]);
    expect(page(1).items[0].createdAt).toEqual(originals[0]);
    expect(page(1).items[0].date).toEqual(custom);
    expect(page(1, "uploadedAt").items.map((video) => video.id)).toEqual([ids[0], ids[2]]);
    expect(listVideos({ publicOnly: true }).filter((video) => ids.includes(video.id))[0].id).toBe(ids[0]);

    updateVideo(ids[0], { date: originals[0] });
    expect(page(2).items[0].id).toBe(ids[0]);
  } finally {
    ids.forEach(deleteVideo);
  }
});

test("manage pagination keeps filtered results within page bounds", () => {
  const ids = Array.from({ length: 3 }, () => crypto.randomUUID());
  const title = `pagination-${ids[0]}`;
  const now = Date.now();

  try {
    ids.forEach((id, index) => createVideo({
      id,
      filename: `${id}.mp4`,
      title,
      status: "QUEUED",
      originalSha256: hashBytes(new TextEncoder().encode(id)),
      originalSize: 1,
      createdAt: new Date(now + index * 1000),
      uploadedAt: new Date(now + index * 1000),
      isHidden: false,
    }));

    const first = listVideosPage({ page: 1, limit: 2, query: title });
    expect(first.total).toBe(3);
    expect(first.totalPages).toBe(2);
    expect(first.items.map((video) => video.id)).toEqual([ids[2], ids[1]]);
    expect(listVideosPage({ page: 2, limit: 2, query: title }).items.map((video) => video.id)).toEqual([ids[0]]);
    expect(listVideosPage({ page: 99, limit: 2, query: title }).page).toBe(2);
    expect(listVideosPage({ page: Number.NaN, limit: 2, query: title }).page).toBe(1);
  } finally {
    ids.forEach(deleteVideo);
  }
});

test("library totals use current video sizes across pages and exclude trash and images", () => {
  const baseline = getVideoLibraryStats();
  const ids = Array.from({ length: 5 }, () => crypto.randomUUID());
  const title = `totals-${ids[0]}`;
  const now = new Date();
  const sizes = [1000, 500, 2000, 9999, 9999];
  const durations = [3600.75, 61.25, undefined, 9999, 9999];

  try {
    ids.forEach((id, index) => createVideo({
      id, title: index === 4 ? "image" : title, status: index === 2 ? "QUEUED" : "COMPLETED",
      size: sizes[index], createdAt: now, uploadedAt: now,
      isHidden: index === 1, deletedAt: index === 3 ? now : null,
      metadata: { filename: `${id}.mp4`, contentType: index === 4 ? "image/png" : "video/mp4", size: 50000, duration: durations[index] },
    }));

    const expected = { count: baseline.count + 4, videos: baseline.videos + 3, images: baseline.images + 1, size: baseline.size + 3500, duration: baseline.duration + 3662 };
    expect(getVideoLibraryStats()).toEqual(expected);
    expect(listVideosPage({ query: title, limit: 1, page: 2 }).total).toBe(3);
    expect(getVideoLibraryStats()).toEqual(expected);

    updateVideo(ids[0], { deletedAt: now });
    expect(getVideoLibraryStats()).toEqual({ count: baseline.count + 3, videos: baseline.videos + 2, images: baseline.images + 1, size: baseline.size + 2500, duration: baseline.duration + 61.25 });
    updateVideo(ids[0], { deletedAt: null });
    expect(getVideoLibraryStats()).toEqual(expected);
  } finally {
    ids.forEach(deleteVideo);
  }
});

test("trash artifact indexing preserves deletion timestamps unless explicitly repaired", () => {
  const id = crypto.randomUUID();
  const original = new Date("2025-01-02T03:04:05.000Z");
  const later = new Date("2026-01-02T03:04:05.000Z");

  try {
    createVideo({
      id,
      title: "trash timestamp test",
      filename: `${id}.mp4`,
      status: "QUEUED",
      originalSize: 1,
      createdAt: original,
      uploadedAt: original,
      isHidden: false,
    });
    recordTrashArtifact(id, "original", original);
    recordTrashArtifact(id, "original");
    expect(trashArtifactsForVideo(id)[0]?.deleted_at).toBe(original.toISOString());

    recordTrashArtifact(id, "original", later);
    expect(trashArtifactsForVideo(id)[0]?.deleted_at).toBe(later.toISOString());
  } finally {
    deleteVideo(id);
  }
});

test("requested sort fields drive the video list queries", () => {
  const ids = Array.from({ length: 3 }, () => crypto.randomUUID());
  const title = `order-${ids[0]}`;
  const created = ["2023-05-01", "2025-05-01", "2024-05-01"].map((day) => new Date(`${day}T12:00:00Z`));
  const uploaded = ["2025-06-01", "2023-06-01", "2024-06-01"].map((day) => new Date(`${day}T12:00:00Z`));

  try {
    ids.forEach((id, index) => createVideo({
      id, title, filename: `${id}.mp4`, status: "QUEUED",
      originalSha256: hashBytes(new TextEncoder().encode(id)), originalSize: 1,
      createdAt: created[index], uploadedAt: uploaded[index], isHidden: false,
    }));

    const onlyTestVideos = (videos: { id: string }[]) =>
      videos.filter((video) => ids.includes(video.id)).map((video) => video.id);
    const listed = (options: Parameters<typeof listVideos>[0]) => onlyTestVideos(listVideos(options));

    // Default list order is the media date, newest first.
    expect(listed({})).toEqual([ids[1], ids[2], ids[0]]);
    expect(listed({ sortField: "uploadedAt", sortOrder: "desc" })).toEqual([ids[0], ids[2], ids[1]]);
    expect(listed({ sortField: "uploadedAt", sortOrder: "asc" })).toEqual([ids[1], ids[2], ids[0]]);
    expect(listed({ sortField: "date", sortOrder: "desc" })).toEqual([ids[1], ids[2], ids[0]]);
    expect(listed({ sortField: "date", sortOrder: "asc" })).toEqual([ids[0], ids[2], ids[1]]);
  } finally {
    ids.forEach(deleteVideo);
  }
});

test("videos sharing a timestamp keep a stable id order", () => {
  const ids = Array.from({ length: 3 }, () => crypto.randomUUID()).sort();
  const title = `tie-${ids[0]}`;
  const when = new Date("2024-03-03T12:00:00Z");

  try {
    ids.forEach((id) => createVideo({
      id, title, filename: `${id}.mp4`, status: "QUEUED",
      originalSha256: hashBytes(new TextEncoder().encode(id)), originalSize: 1,
      createdAt: when, uploadedAt: when, isHidden: false,
    }));

    const ordered = (sortField: "date" | "uploadedAt") =>
      listVideos({ sortField, sortOrder: "desc" }).filter((video) => video.title === title).map((video) => video.id);

    expect(ordered("date")).toEqual([...ids].reverse());
    expect(ordered("uploadedAt")).toEqual([...ids].reverse());
  } finally {
    ids.forEach(deleteVideo);
  }
});
