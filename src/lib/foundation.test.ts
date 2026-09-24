import { describe, expect, test } from "bun:test";
import path from "node:path";
import { isAdoptableWebm, mediaTypeLabel } from "./media";
import { resolveStoredPath, toStoredPath, vaultArtifactPath } from "./paths";
import { hashBytes } from "./hash";
import { trashArtifactPath } from "./trash";

describe("upload hashes", () => {
  test("uses SHA-256 for the uploaded bytes", () => {
    expect(hashBytes(new TextEncoder().encode("abc"))).toBe(
      "ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad",
    );
  });
});

describe("media detection", () => {
  test("recognizes VP9 WebM from ffprobe metadata", () => {
    const metadata = {
      format: { format_name: "matroska,webm" },
      streams: [{ codec_type: "video", codec_name: "vp9" }],
    };
    expect(isAdoptableWebm(metadata)).toBe(true);
    expect(mediaTypeLabel(metadata)).toBe("vp9/webm");
  });

  test("recognizes AV1 WebM and maps HEVC to x265", () => {
    expect(
      mediaTypeLabel({
        format: { format_name: "webm" },
        streams: [{ codec_type: "video", codec_name: "av1" }],
      }),
    ).toBe("av1/webm");
    expect(
      mediaTypeLabel({
        format: { format_name: "matroska" },
        streams: [{ codec_type: "video", codec_name: "hevc" }],
      }),
    ).toBe("x265/mkv");
  });

  test("does not adopt a WebM with an unsupported codec", () => {
    expect(
      isAdoptableWebm({
        format: { format_name: "webm" },
        streams: [{ codec_type: "video", codec_name: "vp8" }],
      }),
    ).toBe(false);
    expect(mediaTypeLabel({ format: { format_name: "webm" }, streams: [] })).toBe(
      "unknown/webm",
    );
    expect(
      isAdoptableWebm({ originalFilename: "clip.webm", videoCodec: "vp9" }),
    ).toBe(false);
  });
});

describe("media paths", () => {
  test("stores paths relative to DATA_PATH and resolves them at the boundary", () => {
    const absolute = path.join(process.cwd(), "data", "vault", "clip.webm");
    expect(toStoredPath(absolute)).toBe("vault/clip.webm");
    expect(resolveStoredPath("vault/clip.webm")).toBe(absolute);
  });

  test("normalizes the legacy container path and rejects traversal", () => {
    expect(toStoredPath("/app/data/vault/clip.webm")).toBe("vault/clip.webm");
    expect(() => toStoredPath("/app/data/../../outside.webm")).toThrow();
    expect(() => resolveStoredPath("../outside.webm")).toThrow();
  });

  test("uses a configured data directory", () => {
    const originalDataPath = process.env.DATA_PATH;
    const configuredPath = path.join(process.cwd(), "custom-media-data");
    process.env.DATA_PATH = configuredPath;
    try {
      const absolute = path.join(configuredPath, ".uploads", "clip.webm");
      expect(toStoredPath(absolute)).toBe(".uploads/clip.webm");
      expect(resolveStoredPath(".uploads/clip.webm")).toBe(absolute);
    } finally {
      if (originalDataPath === undefined) delete process.env.DATA_PATH;
      else process.env.DATA_PATH = originalDataPath;
    }
  });
});

describe("trash paths", () => {
  test("keeps original and processed artifacts separate", () => {
    const originalDataPath = process.env.DATA_PATH;
    process.env.DATA_PATH = path.join(process.cwd(), "custom-media-data");
    try {
      expect(trashArtifactPath("clip", "recording.mkv", "original")).toBe(
        path.join(process.env.DATA_PATH, ".trashed", "original", "clip.mkv"),
      );
      expect(trashArtifactPath("clip", "recording.mkv", "processed")).toBe(
        path.join(process.env.DATA_PATH, ".trashed", "processed", "clip.webm"),
      );
      expect(trashArtifactPath("clip", "recording.mkv", "converted")).toBe(
        path.join(process.env.DATA_PATH, ".trashed", "converted", "clip.webm"),
      );
    } finally {
      if (originalDataPath === undefined) delete process.env.DATA_PATH;
      else process.env.DATA_PATH = originalDataPath;
    }
  });

  test("keeps active original and converted paths distinct", () => {
    const originalDataPath = process.env.DATA_PATH;
    process.env.DATA_PATH = path.join(process.cwd(), "custom-media-data");
    try {
      expect(vaultArtifactPath("clip", "recording.webm", "original")).toBe(
        path.join(process.env.DATA_PATH, "vault", "original", "clip.webm"),
      );
      expect(vaultArtifactPath("clip", "recording.webm", "converted")).toBe(
        path.join(process.env.DATA_PATH, "vault", "converted", "clip.webm"),
      );
    } finally {
      if (originalDataPath === undefined) delete process.env.DATA_PATH;
      else process.env.DATA_PATH = originalDataPath;
    }
  });
});
