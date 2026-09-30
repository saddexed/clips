import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/auth";
import { completeUpload, UploadRequestError } from "@/lib/chunked-upload";
import { DuplicateUploadError } from "@/lib/upload";

export async function POST(request: NextRequest) {
  const startedAt = Date.now();
  console.info("[upload:complete] received", { contentLength: request.headers.get("content-length") });
  const unauthorized = await requireAdmin(request);
  if (unauthorized) {
    console.warn("[upload:complete] unauthorized", { status: unauthorized.status });
    return unauthorized;
  }
  let uploadId = "unknown";
  try {
    const length = Number(request.headers.get("content-length"));
    if (!Number.isFinite(length) || length > 1024) {
      console.warn("[upload:complete] invalid length", { contentLength: request.headers.get("content-length") });
      return NextResponse.json({ error: "Invalid completion request" }, { status: 413 });
    }
    const body: unknown = await request.json().catch(() => null);
    if (!body || typeof body !== "object" || !("identifier" in body) || typeof body.identifier !== "string") {
      console.warn("[upload:complete] invalid identifier");
      return NextResponse.json({ error: "Invalid upload ID" }, { status: 400 });
    }
    uploadId = /^[a-f0-9]{64}$/.test(body.identifier) ? body.identifier.slice(0, 12) : "invalid";
    const videoId = await completeUpload(body.identifier);
    console.info("[upload:complete] finished", { uploadId, videoId, durationMs: Date.now() - startedAt });
    return NextResponse.json({ message: "Upload successful, video queued for processing", videoId }, { status: 201 });
  } catch (error) {
    if (error instanceof UploadRequestError || error instanceof DuplicateUploadError) {
      const status = error instanceof UploadRequestError ? error.status : 409;
      console.warn("[upload:complete] rejected", { uploadId, status, durationMs: Date.now() - startedAt, error: error.message });
      return NextResponse.json({ error: error.message }, { status });
    }
    console.error("[upload:complete] failed", { uploadId, durationMs: Date.now() - startedAt }, error);
    return NextResponse.json({ error: "Failed to finalize upload" }, { status: 500 });
  }
}
