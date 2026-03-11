import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import fs from "node:fs";
import { stat } from "node:fs/promises";
import { Readable } from "node:stream";

export const dynamic = "force-dynamic";

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
      return new NextResponse("Video not found or still processing", { status: 404 });
    }

    let filePath = video.processedPath;
    if (filePath && filePath.startsWith('/app/data') && process.env.DATA_PATH && process.env.DATA_PATH !== '/app/data') {
      filePath = filePath.replace('/app/data', process.env.DATA_PATH);
    }

    try {
      await stat(filePath);
    } catch {
      return new NextResponse("Video file missing on disk", { status: 404 });
    }

    const { size } = await stat(filePath);
    const range = req.headers.get("range");

    if (range) {
      const parts = range.replace(/bytes=/, "").split("-");
      const start = parseInt(parts[0], 10);
      const end = parts[1] ? parseInt(parts[1], 10) : size - 1;

      if (start >= size) {
        return new NextResponse(null, {
          status: 416,
          headers: {
            "Content-Range": `bytes */${size}`,
          },
        });
      }

      const chunksize = end - start + 1;
      const fileStream = fs.createReadStream(filePath, { start, end });
      const webStream = Readable.toWeb(fileStream);

      return new NextResponse(webStream as any, {
        status: 206,
        headers: {
          "Content-Range": `bytes ${start}-${end}/${size}`,
          "Accept-Ranges": "bytes",
          "Content-Length": chunksize.toString(),
          "Content-Type": video.mediaType === "IMAGE" ? "image/webp" : "video/webm",
        },
      });
    } else {
      const fileStream = fs.createReadStream(filePath);
      const webStream = Readable.toWeb(fileStream);

      return new NextResponse(webStream as any, {
        status: 200,
        headers: {
          "Content-Length": size.toString(),
          "Content-Type": video.mediaType === "IMAGE" ? "image/webp" : "video/webm",
          "Accept-Ranges": "bytes",
        },
      });
    }
  } catch (error) {
    console.error("Stream API Error:", error);
    return new NextResponse("Internal Server Error", { status: 500 });
  }
}
