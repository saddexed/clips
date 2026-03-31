import { NextRequest, NextResponse } from "next/server";
import { prisma } from "../../../lib/prisma";
import { getGlobalCommentsEnabled } from "@/lib/settings";

export async function POST(req: NextRequest) {
  try {
    const { videoId, content } = await req.json();

    const globalCommentsEnabled = await getGlobalCommentsEnabled();
    if (!globalCommentsEnabled) {
      return NextResponse.json({ error: "Comments are disabled globally" }, { status: 403 });
    }

    if (!videoId || !content || content.trim() === "") {
      return NextResponse.json({ error: "Missing required fields" }, { status: 400 });
    }

    const video = await prisma.video.findUnique({
      where: { id: videoId },
      select: { originalMetadata: true, status: true },
    });

    if (!video || video.status !== "COMPLETED") {
      return NextResponse.json({ error: "Video not available" }, { status: 404 });
    }

    const commentsEnabled =
      !video.originalMetadata ||
      typeof video.originalMetadata !== "object" ||
      Array.isArray(video.originalMetadata)
        ? true
        : (video.originalMetadata as Record<string, unknown>).commentsEnabled !== false;

    if (!commentsEnabled) {
      return NextResponse.json({ error: "Comments are disabled for this video" }, { status: 403 });
    }

    const comment = await prisma.comment.create({
      data: {
        content: content.trim(),
        video: { connect: { id: videoId } },
      },
      select: {
        id: true,
        content: true,
        createdAt: true,
      }
    });

    return NextResponse.json({ comment });
  } catch (error) {
    console.error("Create Comment error:", error);
    return NextResponse.json({ error: "Internal Server Error" }, { status: 500 });
  }
}
