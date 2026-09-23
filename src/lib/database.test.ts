import { expect, test } from "bun:test";
import {
  createVideo,
  deleteVideo,
  findVideoIdByOriginalSha256,
} from "./database";
import { hashBytes } from "./hash";

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
