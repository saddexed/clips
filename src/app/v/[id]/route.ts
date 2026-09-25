import { NextRequest, NextResponse } from "next/server";
import { getVideo } from "@/lib/database";
import fs from "node:fs";
import { stat } from "node:fs/promises";
import { Readable } from "node:stream";
import path from "node:path";
import { mediaMimeType } from "@/lib/media";
import { resolveStoredPath } from "@/lib/paths";

export const dynamic = "force-dynamic";

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;

  try {
    const video = getVideo(id);

    if (!video || !video.activePath || video.deletedAt) {
      return new NextResponse("Video not found or unavailable", {
        status: 404,
      });
    }

    const filePath = resolveStoredPath(video.activePath);
    if (!filePath) return new NextResponse("Video file missing", { status: 404 });

    try {
      await stat(filePath);
    } catch {
      return new NextResponse("Video file missing on disk", { status: 404 });
    }

    const { size } = await stat(filePath);
    const range = req.headers.get("range");

    if (range) {
      const match = /^bytes=(\d+)-(\d*)$/.exec(range.trim());
      if (!match) {
        return new NextResponse(null, {
          status: 416,
          headers: { "Content-Range": `bytes */${size}` },
        });
      }

      const start = Number(match[1]);
      const requestedEnd = match[2] ? Number(match[2]) : size - 1;
      const end = Math.min(requestedEnd, size - 1);

      if (!Number.isSafeInteger(start) || !Number.isSafeInteger(requestedEnd) || start >= size || end < start) {
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
          "Content-Type": mediaMimeType(
            video.activeMetadata || video.originalMetadata,
            path.extname(filePath),
            video.mediaType,
          ),
        },
      });
    } else {
      const fileStream = fs.createReadStream(filePath);
      const webStream = Readable.toWeb(fileStream);

      return new NextResponse(webStream as any, {
        status: 200,
        headers: {
          "Content-Length": size.toString(),
          "Content-Type": mediaMimeType(
            video.activeMetadata || video.originalMetadata,
            path.extname(filePath),
            video.mediaType,
          ),
          "Accept-Ranges": "bytes",
        },
      });
    }
  } catch (error) {
    console.error("Stream API Error:", error);
    return new NextResponse("Internal Server Error", { status: 500 });
  }
}
