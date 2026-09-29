import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/auth";
import { hasChunk, parseChunkInfo, saveChunk, UploadRequestError } from "@/lib/chunked-upload";
import { DuplicateUploadError } from "@/lib/upload";

function failure(error: unknown) {
  if (error instanceof UploadRequestError || error instanceof DuplicateUploadError) {
    const status = error instanceof UploadRequestError ? error.status : 409;
    return NextResponse.json({ error: error.message }, { status });
  }
  return NextResponse.json({ error: "Failed to upload chunk" }, { status: 500 });
}

export async function GET(request: NextRequest) {
  const params = request.nextUrl.searchParams;
  const unauthorized = await requireAdmin(request);
  if (unauthorized) return unauthorized;
  try {
    const found = await hasChunk(parseChunkInfo(params));
    return new Response(null, { status: found ? 200 : 204, headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    return failure(error);
  }
}

export async function POST(request: NextRequest) {
  const params = request.nextUrl.searchParams;
  const unauthorized = await requireAdmin(request);
  if (unauthorized) return unauthorized;
  try {
    await saveChunk(request, parseChunkInfo(params));
    return NextResponse.json({ received: true });
  } catch (error) {
    return failure(error);
  }
}
