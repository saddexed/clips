import { randomUUID } from "node:crypto";
import { createReadStream, createWriteStream } from "node:fs";
import { link, mkdir, open, readFile, readdir, rename, rm, stat, unlink, writeFile } from "node:fs/promises";
import path from "node:path";
import { pipeline } from "node:stream/promises";
import { getDataPath } from "@/lib/paths";
import { CHUNK_SIZE, MAX_UPLOAD_BYTES } from "@/lib/upload-limits";
import { finalizeUploadedFile } from "@/lib/upload";

const SESSION_TTL_MS = 24 * 60 * 60 * 1000;
let lastCleanupAt = 0;

export class UploadRequestError extends Error {
  constructor(message: string, public status: number) {
    super(message);
  }
}

export type ChunkInfo = {
  identifier: string;
  filename: string;
  contentType: string;
  totalSize: number;
  totalChunks: number;
  lastModified: number;
  chunkNumber: number;
};

function integer(value: string | null): number {
  return value !== null && /^\d+$/.test(value) ? Number(value) : NaN;
}

export function parseChunkInfo(params: URLSearchParams): ChunkInfo {
  const identifier = params.get("resumableIdentifier") || "";
  const filename = params.get("resumableFilename") || "";
  const contentType = params.get("resumableType") || "";
  const totalSize = integer(params.get("resumableTotalSize"));
  const totalChunks = integer(params.get("resumableTotalChunks"));
  const chunkSize = integer(params.get("resumableChunkSize"));
  const chunkNumber = integer(params.get("resumableChunkNumber"));
  const currentChunkSize = integer(params.get("resumableCurrentChunkSize"));
  const lastModified = integer(params.get("lastModified"));

  if (!/^[a-f0-9]{64}$/.test(identifier) || !filename || filename.length > 255 ||
      (!contentType.startsWith("video/") && !contentType.startsWith("image/")) ||
      !Number.isSafeInteger(lastModified)) {
    throw new UploadRequestError("Invalid upload metadata", 400);
  }
  if (!Number.isSafeInteger(totalSize) || totalSize <= CHUNK_SIZE || totalSize > MAX_UPLOAD_BYTES) {
    throw new UploadRequestError("File exceeds the 500 MB limit or does not need chunking", 413);
  }
  if (chunkSize !== CHUNK_SIZE || totalChunks !== Math.ceil(totalSize / CHUNK_SIZE) ||
      !Number.isSafeInteger(chunkNumber) || chunkNumber < 1 || chunkNumber > totalChunks ||
      currentChunkSize !== Math.min(CHUNK_SIZE, totalSize - (chunkNumber - 1) * CHUNK_SIZE)) {
    throw new UploadRequestError("Invalid chunk size or index", 400);
  }
  return { identifier, filename, contentType, totalSize, totalChunks, chunkNumber, lastModified };
}

function rootDir() {
  return path.join(getDataPath(), ".uploads", "chunks");
}

function sessionDir(identifier: string) {
  if (!/^[a-f0-9]{64}$/.test(identifier)) throw new UploadRequestError("Invalid upload ID", 400);
  return path.join(rootDir(), identifier);
}

function manifest(info: ChunkInfo) {
  const { chunkNumber: _chunkNumber, ...details } = info;
  return details;
}

async function readManifest(info: ChunkInfo) {
  try {
    const existing = JSON.parse(await readFile(path.join(sessionDir(info.identifier), "manifest.json"), "utf8"));
    if (JSON.stringify(existing) !== JSON.stringify(manifest(info))) {
      throw new UploadRequestError("Conflicting upload metadata", 409);
    }
    return true;
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return false;
    throw error;
  }
}

async function ensureManifest(info: ChunkInfo) {
  const dir = sessionDir(info.identifier);
  await mkdir(dir, { recursive: true });
  const draft = path.join(dir, `${randomUUID()}.tmp`);
  try {
    await writeFile(draft, JSON.stringify(manifest(info)));
    try {
      await link(draft, path.join(dir, "manifest.json"));
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== "EEXIST") throw error;
    }
  } finally {
    await unlink(draft).catch(() => {});
  }
  await readManifest(info);
}

function expectedSize(info: ChunkInfo) {
  return Math.min(CHUNK_SIZE, info.totalSize - (info.chunkNumber - 1) * CHUNK_SIZE);
}

async function chunkExists(info: ChunkInfo) {
  try {
    return (await stat(path.join(sessionDir(info.identifier), `${info.chunkNumber}.part`))).size === expectedSize(info);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return false;
    throw error;
  }
}

async function completedId(identifier: string): Promise<string | null> {
  try {
    return await readFile(path.join(sessionDir(identifier), "completed.txt"), "utf8");
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return null;
    throw error;
  }
}

export async function hasChunk(info: ChunkInfo) {
  if (!(await readManifest(info))) return false;
  return Boolean(await completedId(info.identifier)) || chunkExists(info);
}

async function cleanupStaleSessions() {
  if (Date.now() - lastCleanupAt < 60 * 60 * 1000) return;
  lastCleanupAt = Date.now();
  for (const entry of await readdir(rootDir(), { withFileTypes: true })) {
    if (!entry.isDirectory() || !/^[a-f0-9]{64}$/.test(entry.name)) continue;
    const dir = sessionDir(entry.name);
    try {
      if (Date.now() - (await stat(dir)).mtimeMs > SESSION_TTL_MS) {
        await rm(dir, { recursive: true, force: true });
      }
    } catch {
      // A failed cleanup can be retried on a later upload.
    }
  }
}

export async function saveChunk(request: Request, info: ChunkInfo) {
  const expected = expectedSize(info);
  const length = request.headers.get("content-length");
  if (length !== null && Number(length) !== expected) {
    throw new UploadRequestError("Invalid chunk length", 400);
  }
  await mkdir(rootDir(), { recursive: true });
  await cleanupStaleSessions();
  await ensureManifest(info);
  if (await completedId(info.identifier)) return;
  if (await chunkExists(info)) return;
  if (!request.body) throw new UploadRequestError("Missing chunk body", 400);

  const draft = path.join(sessionDir(info.identifier), `${randomUUID()}.tmp`);
  const handle = await open(draft, "wx");
  try {
    const reader = request.body.getReader();
    let size = 0;
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      size += value.byteLength;
      if (size > expected) {
        await reader.cancel();
        throw new UploadRequestError("Chunk exceeds expected size", 413);
      }
      await handle.writeFile(value);
    }
    if (size !== expected) throw new UploadRequestError("Incomplete chunk", 400);
  } catch (error) {
    await handle.close();
    await unlink(draft).catch(() => {});
    throw error;
  }
  await handle.close();
  try {
    await rename(draft, path.join(sessionDir(info.identifier), `${info.chunkNumber}.part`));
  } finally {
    await unlink(draft).catch(() => {});
  }
}

export async function completeUpload(identifier: string) {
  const dir = sessionDir(identifier);
  const raw = await readFile(path.join(dir, "manifest.json"), "utf8").catch((error: NodeJS.ErrnoException) => {
    if (error.code === "ENOENT") throw new UploadRequestError("Upload session not found", 404);
    throw error;
  });
  const details = JSON.parse(raw) as Omit<ChunkInfo, "chunkNumber">;
  const info = parseChunkInfo(new URLSearchParams({
    resumableIdentifier: identifier, resumableFilename: details.filename, resumableType: details.contentType,
    resumableTotalSize: String(details.totalSize), resumableTotalChunks: String(details.totalChunks),
    resumableChunkSize: String(CHUNK_SIZE), resumableChunkNumber: "1",
    resumableCurrentChunkSize: String(CHUNK_SIZE), lastModified: String(details.lastModified),
  }));
  const completed = await completedId(identifier);
  if (completed) return completed;

  const lock = path.join(dir, ".finalizing");
  try {
    await mkdir(lock);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "EEXIST") {
      throw new UploadRequestError("Upload is already being finalized", 409);
    }
    throw error;
  }
  let stagedPath: string | undefined;
  try {
    const existing = await completedId(identifier);
    if (existing) return existing;
    for (let index = 1; index <= info.totalChunks; index++) {
      if (!(await chunkExists({ ...info, chunkNumber: index }))) {
        throw new UploadRequestError("Upload is missing a chunk", 409);
      }
    }
    stagedPath = path.join(getDataPath(), ".uploads", `${randomUUID()}.part`);
    for (let index = 1; index <= info.totalChunks; index++) {
      await pipeline(
        createReadStream(path.join(dir, `${index}.part`)),
        createWriteStream(stagedPath, { flags: index === 1 ? "wx" : "a" }),
      );
    }
    if ((await stat(stagedPath)).size !== info.totalSize) {
      throw new UploadRequestError("Assembled file has an unexpected size", 409);
    }
    const videoId = await finalizeUploadedFile({
      stagedPath, filename: info.filename, contentType: info.contentType,
      size: info.totalSize, lastModified: info.lastModified,
    });
    await writeFile(path.join(dir, "completed.txt"), videoId);
    for (let index = 1; index <= info.totalChunks; index++) {
      await unlink(path.join(dir, `${index}.part`)).catch(() => {});
    }
    return videoId;
  } finally {
    if (stagedPath) await unlink(stagedPath).catch(() => {});
    await rm(lock, { recursive: true, force: true });
  }
}
