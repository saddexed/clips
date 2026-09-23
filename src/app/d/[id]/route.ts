import { NextRequest, NextResponse } from "next/server";
import { repository } from "@/lib/repository";
import fs from "node:fs";
import { stat } from "node:fs/promises";
import { Readable } from "node:stream";
import path from "node:path";
import { mediaMimeType } from "@/lib/media";
import { resolveStoredPath } from "@/lib/paths";

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;

  try {
    const video = await repository.video.findUnique({
      where: { id },
    });

    if (!video || !video.activePath || video.status !== "COMPLETED") {
      return new NextResponse("Video not found or unavailable", {
        status: 404,
      });
    }

    const filePath = resolveStoredPath(video.activePath);
    if (!filePath) return new NextResponse("Video file missing on disk", { status: 404 });

    try {
      await stat(filePath);
    } catch {
      return new NextResponse("Video file missing on disk", { status: 404 });
    }

    const { size } = await stat(filePath);
    const fileStream = fs.createReadStream(filePath);
    const webStream = Readable.toWeb(fileStream);

    // Fallback original filename or generate a clean one
    const safeTitle = (video.title || video.filename).replace(
      /[^a-zA-Z0-9.\-_]/g,
      "_",
    );
    const extension = path.extname(filePath).toLowerCase() || ".webm";
    const downloadFilename = safeTitle.endsWith(extension)
      ? safeTitle
      : `${safeTitle}${extension}`;

    return new NextResponse(webStream as any, {
      headers: {
        "Content-Length": size.toString(),
        "Content-Type": mediaMimeType(
          video.activeMetadata || video.originalMetadata,
          extension,
          video.mediaType,
        ),
        "Content-Disposition": `attachment; filename="${downloadFilename}"`,
      },
    });
  } catch (error) {
    console.error("Download API Error:", error);
    return new NextResponse("Internal Server Error", { status: 500 });
  }
}
