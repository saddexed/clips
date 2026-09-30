import { describe, expect, test } from "bun:test";
import { mkdtemp, readFile, readdir, rm, stat } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { completeUpload, hasChunk, parseChunkInfo, saveChunk } from "./chunked-upload";
import { CHUNK_SIZE, MAX_UPLOAD_BYTES } from "./upload-limits";

function params(overrides: Record<string, string> = {}) {
  return new URLSearchParams({
    resumableIdentifier: "a".repeat(64),
    resumableFilename: "large.png",
    resumableType: "image/png",
    resumableTotalSize: String(CHUNK_SIZE + 1),
    resumableTotalChunks: "2",
    resumableChunkSize: String(CHUNK_SIZE),
    resumableChunkNumber: "2",
    resumableCurrentChunkSize: "1",
    lastModified: "1700000000000",
    ...overrides,
  });
}

describe("resumable uploads", () => {
  test("only chunks files over 90 million bytes, enforcing exact final sizes", () => {
    expect(parseChunkInfo(params()).chunkNumber).toBe(2);
    expect(() => parseChunkInfo(params({ resumableTotalSize: String(CHUNK_SIZE) }))).toThrow();
    expect(() => parseChunkInfo(params({ resumableTotalSize: String(MAX_UPLOAD_BYTES + 1) }))).toThrow();
    expect(() => parseChunkInfo(params({ resumableCurrentChunkSize: "2" }))).toThrow();
    expect(() => parseChunkInfo(params({ resumableTotalChunks: "1" }))).toThrow();
    expect(() => parseChunkInfo(params({ resumableChunkSize: String(90 * 1024 * 1024) }))).toThrow();
    expect(() => parseChunkInfo(params({ resumableIdentifier: "../other" }))).toThrow();
  });

  test("retries concurrent chunks and removes incomplete writes", async () => {
    const previous = process.env.DATA_PATH;
    const directory = await mkdtemp(path.join(tmpdir(), "clips-chunks-"));
    process.env.DATA_PATH = directory;
    try {
      const info = parseChunkInfo(params());
      const request = () => new Request("http://localhost/api/upload/chunk", {
        method: "POST", body: new Uint8Array([42]),
      });
      expect(await hasChunk(info)).toBe(false);
      await Promise.all([saveChunk(request(), info), saveChunk(request(), info)]);
      expect(await hasChunk(info)).toBe(true);
      expect((await stat(path.join(directory, ".uploads", "chunks", info.identifier, "2.part"))).size).toBe(1);
      expect((await readdir(path.join(directory, ".uploads", "chunks", info.identifier))).sort()).toEqual(["2.part", "manifest.json"]);
      await expect(completeUpload(info.identifier)).rejects.toThrow("Upload is missing a chunk");
      await saveChunk(request(), info);
      expect(await hasChunk(info)).toBe(true);

      const first = parseChunkInfo(params({ resumableChunkNumber: "1", resumableCurrentChunkSize: String(CHUNK_SIZE) }));
      await expect(saveChunk(request(), first)).rejects.toThrow("Incomplete chunk");
      expect(await hasChunk(first)).toBe(false);
      expect((await readdir(path.join(directory, ".uploads", "chunks", info.identifier))).sort()).toEqual(["2.part", "manifest.json"]);

      const other = parseChunkInfo(params({
        resumableIdentifier: "b".repeat(64), resumableTotalSize: String(CHUNK_SIZE + 2),
        resumableCurrentChunkSize: "2",
      }));
      const stream = new ReadableStream<Uint8Array>({
        start(controller) {
          controller.enqueue(new Uint8Array([42]));
          controller.enqueue(new Uint8Array([43]));
          controller.close();
        },
      });
      await saveChunk(new Request("http://localhost/api/upload/chunk", {
        method: "POST", body: stream, duplex: "half",
      } as RequestInit & { duplex: "half" }), other);
      expect(await hasChunk(other)).toBe(true);
      expect([...await readFile(path.join(directory, ".uploads", "chunks", other.identifier, "2.part"))]).toEqual([42, 43]);
    } finally {
      if (previous === undefined) delete process.env.DATA_PATH;
      else process.env.DATA_PATH = previous;
      await rm(directory, { recursive: true, force: true });
    }
  });
});
