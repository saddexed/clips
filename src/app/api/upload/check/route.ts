import { NextRequest, NextResponse } from "next/server";
import { findVideoByFilename } from "@/lib/database";
import { requireAdmin } from "@/lib/auth";

export async function GET(request: NextRequest) {
  const unauthorized = await requireAdmin(request);
  if (unauthorized) return unauthorized;
  const filename = request.nextUrl.searchParams.get("filename")?.trim();
  if (!filename || filename.length > 255) {
    return NextResponse.json({ collision: null });
  }
  const collision = findVideoByFilename(filename);
  return NextResponse.json({ collision: collision ? {
    ...collision,
    createdAt: collision.createdAt.toISOString(),
    uploadedAt: collision.uploadedAt.toISOString(),
  } : null }, { headers: { "Cache-Control": "no-store" } });
}
