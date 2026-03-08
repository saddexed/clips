import { NextRequest, NextResponse } from "next/server";
import { prisma } from "../../../lib/prisma";

export async function POST(req: NextRequest) {
  try {
    const { videoId, content } = await req.json();

    if (!videoId || !content || content.trim() === "") {
      return NextResponse.json({ error: "Missing required fields" }, { status: 400 });
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
