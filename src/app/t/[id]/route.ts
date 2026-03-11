import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import fs from "node:fs";
import { stat, mkdir } from "node:fs/promises";
import { exec } from "node:child_process";
import util from "node:util";
import path from "node:path";
import { Readable } from "node:stream";

const execAsync = util.promisify(exec);

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;

  try {
    const video = await prisma.video.findUnique({
      where: { id },
    });

    if (!video) {
        return new NextResponse(null, { status: 404 });
    }

    const dataPath = process.env.DATA_PATH || "/app/data";
    const thumbPath = path.join(dataPath, ".thumbnails", `${id}.png`);

    try {
      await stat(thumbPath);
    } catch {
      // Generate a thumbnail frame on the fly if it doesn't already exist
      // Priority: processedPath, then originalPath
      let sourcePath = video.processedPath || video.originalPath;
      if (sourcePath && sourcePath.startsWith('/app/data') && process.env.DATA_PATH && process.env.DATA_PATH !== '/app/data') {
        sourcePath = sourcePath.replace('/app/data', process.env.DATA_PATH);
      }
      
      if (!sourcePath) return new NextResponse(null, { status: 404 });

      try {
        await stat(sourcePath);
        // Ensure directory exists
        const thumbDir = path.dirname(thumbPath);
        await mkdir(thumbDir, { recursive: true });
        
        await execAsync(`ffmpeg -i "${sourcePath}" -ss 00:00:01.000 -vframes 1 "${thumbPath}"`);
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
          "Content-Type": "image/png",
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
