import { NextRequest, NextResponse } from "next/server";
import { repository } from "@/lib/repository";
import { extractThumbnail } from "@/lib/ffmpeg";
import fs from "node:fs";
import { stat, mkdir } from "node:fs/promises";
import path from "node:path";
import { Readable } from "node:stream";

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;

  try {
    const video = await repository.video.findUnique({
      where: { id },
    });

    if (!video) {
      return new NextResponse(null, { status: 404 });
    }

    const dataPath = process.env.DATA_PATH || "/app/data";
    const thumbPath = path.join(dataPath, ".thumbnails", `${id}.webp`);

    try {
      await stat(thumbPath);
    } catch {
      // Generate a thumbnail frame on the fly if it doesn't already exist
      // Priority: processedPath, then originalPath
      let sourcePath = video.processedPath || video.originalPath;
      if (
        sourcePath &&
        sourcePath.startsWith("/app/data") &&
        process.env.DATA_PATH &&
        process.env.DATA_PATH !== "/app/data"
      ) {
        sourcePath = sourcePath.replace("/app/data", process.env.DATA_PATH);
      }

      if (!sourcePath) return new NextResponse(null, { status: 404 });

      try {
        await stat(sourcePath);
        // Ensure directory exists
        const thumbDir = path.dirname(thumbPath);
        await mkdir(thumbDir, { recursive: true });

        await extractThumbnail(sourcePath, thumbPath);
      } catch (err) {
        console.error("Failed to generate thumbnail via ffmpeg", err);
        return new NextResponse(null, { status: 404 });
      }
    }

    try {
      const { size } = await stat(thumbPath);
      const fileStream = fs.createReadStream(thumbPath);
      const webStream = Readable.toWeb(fileStream);

      return new NextResponse(webStream as any, {
        headers: {
          "Content-Type": "image/webp",
          "Content-Length": size.toString(),
          "Cache-Control": "public, max-age=86400",
        },
      });
    } catch (err) {
      console.error("Failed to read thumbnail", err);
      return new NextResponse("Internal Server Error", { status: 500 });
    }
  } catch (error) {
    console.error("Thumbnail API Error:", error);
    return new NextResponse("Internal Server Error", { status: 500 });
  }
}
