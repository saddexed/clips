import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import fs from "node:fs";
import { stat } from "node:fs/promises";
import { Readable } from "node:stream";

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;

  try {
    const video = await prisma.video.findUnique({
      where: { id },
    });

    if (!video || !video.processedPath || video.status !== "COMPLETED") {
      return new NextResponse("Video not found or unavailable", { status: 404 });
    }

    const filePath = video.processedPath;
    
    try {
      await stat(filePath);
    } catch {
      return new NextResponse("Video file missing on disk", { status: 404 });
    }

    const { size } = await stat(filePath);
    const fileStream = fs.createReadStream(filePath);
    const webStream = Readable.toWeb(fileStream);
    
    // Fallback original filename or generate a clean one
    const safeTitle = (video.title || video.filename).replace(/[^a-zA-Z0-9.\-_]/g, '_');
    const downloadFilename = safeTitle.endsWith('.webm') ? safeTitle : `${safeTitle}.webm`;

    return new NextResponse(webStream as any, {
      headers: {
        "Content-Length": size.toString(),
        "Content-Type": "application/octet-stream",
        "Content-Disposition": `attachment; filename="${downloadFilename}"`,
      },
    });

  } catch (error) {
    console.error("Download API Error:", error);
    return new NextResponse("Internal Server Error", { status: 500 });
  }
}
