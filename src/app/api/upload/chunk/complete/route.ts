import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/auth";
import { completeUpload, UploadRequestError } from "@/lib/chunked-upload";
import { DuplicateUploadError } from "@/lib/upload";

export async function POST(request: NextRequest) {
  const unauthorized = await requireAdmin(request);
  if (unauthorized) return unauthorized;
  try {
    const length = Number(request.headers.get("content-length"));
    if (!Number.isFinite(length) || length > 1024) {
      return NextResponse.json({ error: "Invalid completion request" }, { status: 413 });
    }
    const body: unknown = await request.json().catch(() => null);
    if (!body || typeof body !== "object" || !("identifier" in body) || typeof body.identifier !== "string") {
      return NextResponse.json({ error: "Invalid upload ID" }, { status: 400 });
    }
    const videoId = await completeUpload(body.identifier);
    return NextResponse.json({ message: "Upload successful, video queued for processing", videoId }, { status: 201 });
  } catch (error) {
    if (error instanceof UploadRequestError || error instanceof DuplicateUploadError) {
      const status = error instanceof UploadRequestError ? error.status : 409;
      return NextResponse.json({ error: error.message }, { status });
    }
    return NextResponse.json({ error: "Failed to finalize upload" }, { status: 500 });
  }
}
