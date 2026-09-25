import { expect, test } from "bun:test";
import {
  createVideo,
  deleteVideo,
  findVideoIdByOriginalSha256,
  listVideosPage,
  listVideos,
  updateVideo,
} from "./database";
import { hashBytes } from "./hash";
import { repository } from "./repository";

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

test("requested sort fields drive the video list and repository queries", async () => {
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

    // The gallery and search read through the repository, so its orderBy must count.
    const found = async (orderBy: Record<string, string>) =>
      onlyTestVideos(await repository.video.findMany({ where: { deletedAt: null }, orderBy }));
    expect(await found({ date: "desc" })).toEqual([ids[1], ids[2], ids[0]]);
    expect(await found({ date: "asc" })).toEqual([ids[0], ids[2], ids[1]]);
    expect(await found({ createdAt: "asc" })).toEqual([ids[0], ids[2], ids[1]]);
    expect(await found({ uploadedAt: "desc" })).toEqual([ids[0], ids[2], ids[1]]);
    // Unknown keys keep the default order instead of throwing.
    expect(await found({ status: "asc" })).toEqual([ids[1], ids[2], ids[0]]);
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
