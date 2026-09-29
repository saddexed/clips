import { NextRequest, NextResponse } from "next/server";
import { mkdir, unlink, writeFile } from "node:fs/promises";
import path from "node:path";
import { randomUUID } from "node:crypto";
import { requireAdmin } from "@/lib/auth";
import { getDataPath } from "@/lib/paths";
import { CHUNK_SIZE } from "@/lib/upload-limits";
import { DuplicateUploadError, finalizeUploadedFile } from "@/lib/upload";

export async function POST(request: NextRequest) {
  const unauthorized = await requireAdmin(request);
  if (unauthorized) return unauthorized;

  const contentLength = Number(request.headers.get("content-length") || 0);
  if (contentLength > CHUNK_SIZE + 2_000_000) {
    return NextResponse.json({ error: "Use chunked upload for files over 90 MB" }, { status: 413 });
  }

  let stagedPath: string | undefined;
  try {
    const formData = await request.formData();
    const file = formData.get("file");
    if (!(file instanceof File)) {
      return NextResponse.json({ error: "No file provided" }, { status: 400 });
    }
    if (file.size <= 0 || file.size > CHUNK_SIZE) {
      return NextResponse.json({ error: "Use chunked upload for files over 90 MB" }, { status: 413 });
    }
    if (!file.type.startsWith("video/") && !file.type.startsWith("image/")) {
      return NextResponse.json({ error: "Only video and image files are allowed" }, { status: 400 });
    }

    const tempDir = path.join(getDataPath(), ".uploads");
    await mkdir(tempDir, { recursive: true });
    stagedPath = path.join(tempDir, `${randomUUID()}.part`);
    await writeFile(stagedPath, Buffer.from(await file.arrayBuffer()));
    const rawLastModified = formData.get("lastModified");
    const lastModified = rawLastModified === null ? undefined : Number(rawLastModified);
    const videoId = await finalizeUploadedFile({
      stagedPath,
      filename: file.name,
      title: formData.get("title")?.toString(),
      contentType: file.type,
      size: file.size,
      lastModified: lastModified !== undefined && Number.isFinite(lastModified) ? lastModified : undefined,
    });
    return NextResponse.json({ message: "Upload successful, video queued for processing", videoId }, { status: 201 });
  } catch (error) {
    if (error instanceof DuplicateUploadError) {
      return NextResponse.json({ error: error.message }, { status: 409 });
    }
    console.error("Upload Error:", error);
    return NextResponse.json({ error: "Failed to upload file" }, { status: 500 });
  } finally {
    if (stagedPath) await unlink(stagedPath).catch(() => {});
  }
}
