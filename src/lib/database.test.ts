import { expect, test } from "bun:test";
import {
  createVideo,
  database,
  deleteVideo,
  findVideoIdByOriginalSha256,
  getSetting,
  listVideosPage,
  setSetting,
} from "./database";
import { hashBytes } from "./hash";

test("settings round-trip arrays, booleans, strings, and objects", () => {
  const key = `setting-${crypto.randomUUID()}`;
  const cases: unknown[] = [
    ["alpha", "beta"],
    true,
    false,
    "-crf 18",
    42,
    { nested: { value: 1 } },
  ];

  try {
    for (const value of cases) {
      setSetting(key, value);
      expect(getSetting(key)).toEqual(value);
    }
    expect(getSetting(`missing-${crypto.randomUUID()}`)).toBeUndefined();
  } finally {
    database.query("DELETE FROM app_settings WHERE key=?").run(key);
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
