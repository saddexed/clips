import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/auth";
import { hasChunk, parseChunkInfo, saveChunk, UploadRequestError } from "@/lib/chunked-upload";
import { DuplicateUploadError } from "@/lib/upload";

function failure(error: unknown, context: Record<string, unknown>) {
  if (error instanceof UploadRequestError || error instanceof DuplicateUploadError) {
    const status = error instanceof UploadRequestError ? error.status : 409;
    console.warn("[upload:chunk] rejected", { ...context, status, error: error.message });
    return NextResponse.json({ error: error.message }, { status });
  }
  console.error("[upload:chunk] failed", context, error);
  return NextResponse.json({ error: "Failed to upload chunk" }, { status: 500 });
}

export async function GET(request: NextRequest) {
  const startedAt = Date.now();
  const params = request.nextUrl.searchParams;
  const identifier = params.get("resumableIdentifier") || "";
  const context = { uploadId: /^[a-f0-9]{64}$/.test(identifier) ? identifier.slice(0, 12) : "invalid", chunk: params.get("resumableChunkNumber") };
  const unauthorized = await requireAdmin(request);
  if (unauthorized) {
    console.warn("[upload:chunk] probe unauthorized", { ...context, status: unauthorized.status });
    return unauthorized;
  }
  try {
    const found = await hasChunk(parseChunkInfo(params));
    console.info("[upload:chunk] probe", { ...context, status: found ? 200 : 204, durationMs: Date.now() - startedAt });
    return new Response(null, { status: found ? 200 : 204, headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    return failure(error, context);
  }
}

export async function POST(request: NextRequest) {
  const startedAt = Date.now();
  const params = request.nextUrl.searchParams;
  const identifier = params.get("resumableIdentifier") || "";
  const context = { uploadId: /^[a-f0-9]{64}$/.test(identifier) ? identifier.slice(0, 12) : "invalid", chunk: params.get("resumableChunkNumber"), contentLength: request.headers.get("content-length") };
  console.info("[upload:chunk] received", context);
  const unauthorized = await requireAdmin(request);
  if (unauthorized) {
    console.warn("[upload:chunk] unauthorized", { ...context, status: unauthorized.status });
    return unauthorized;
  }
  try {
    await saveChunk(request, parseChunkInfo(params));
    console.info("[upload:chunk] saved", { ...context, durationMs: Date.now() - startedAt });
    return NextResponse.json({ received: true });
  } catch (error) {
    return failure(error, { ...context, durationMs: Date.now() - startedAt });
  }
}
