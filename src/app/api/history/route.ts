import { NextRequest, NextResponse } from "next/server";
import { jobHistoryForVideo, listJobHistoryPage } from "@/lib/database";

export async function GET(request: NextRequest) {
  const videoId = request.nextUrl.searchParams.get("videoId");
  if (videoId) return NextResponse.json({ items: jobHistoryForVideo(videoId) });
  return NextResponse.json(listJobHistoryPage(
    Number(request.nextUrl.searchParams.get("page") || 1),
    Number(request.nextUrl.searchParams.get("limit") || 50),
  ));
}
