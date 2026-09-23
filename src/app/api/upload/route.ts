import { NextRequest, NextResponse } from "next/server";
import { writeFile, mkdir, unlink } from "node:fs/promises";
import path from "node:path";
import {
  createJobHistory,
  createVideo,
  findVideoIdByOriginalSha256,
} from "@/lib/database";
import { getUploadDefaults } from "@/lib/settings";
import { enqueueVideoJob } from "@/lib/queue";
import { extractMetadata } from "@/lib/ffmpeg";
import { getDataPath, toStoredPath } from "@/lib/paths";
import { hashBytes } from "@/lib/hash";
import { revalidatePath } from "next/cache";
import { cookies } from "next/headers";
import { jwtVerify } from "jose";

export async function POST(request: NextRequest) {
  try {
    // 1. Manually enforce JWT authentication
    // We do this inside the route handler instead of Edge Middleware to evade the 10MB edge proxy limits.
    if (process.env.ADMIN_PASSWORD) {
      const cookieStore = await cookies();
      const token = cookieStore.get("admin_session")?.value;
      if (!token) {
        return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
      }
      try {
        const secret = new TextEncoder().encode(
          process.env.AUTH_SECRET || "fallback_secret_for_dev_only",
        );
        await jwtVerify(token, secret);
      } catch (err) {
        return NextResponse.json({ error: "Invalid session" }, { status: 401 });
      }
    }

    const formData = await request.formData();
    const file = formData.get("file") as File | null;

    if (!file) {
      return NextResponse.json({ error: "No file provided" }, { status: 400 });
    }

    const isVideo = file.type.startsWith("video/");
    const isImage = file.type.startsWith("image/");

    if (!isVideo && !isImage) {
      return NextResponse.json(
        { error: "Only video and image files are allowed" },
        { status: 400 },
      );
    }

    const dataPath = getDataPath();
    const tempDir = path.join(dataPath, ".uploads");

    // Ensure the .uploads directory exists
    await mkdir(tempDir, { recursive: true });

    // Generate UUID manually so we can write the file deterministically in one pass
    const videoId = crypto.randomUUID();
    const ext = path.extname(file.name) || "";
    const physicalName = `${videoId}${ext}`;
    const filePath = path.join(tempDir, physicalName);

    // Read the file as an ArrayBuffer and save to disk
    const bytes = await file.arrayBuffer();
    const buffer = Buffer.from(bytes);
    const originalSha256 = hashBytes(buffer);
    if (findVideoIdByOriginalSha256(originalSha256)) {
      return NextResponse.json(
        { error: "This file has already been uploaded." },
        { status: 409 },
      );
    }
    await writeFile(filePath, buffer);

    const lastModifiedStr = formData.get("lastModified")?.toString();
    const clientDate = lastModifiedStr
      ? new Date(parseInt(lastModifiedStr, 10))
      : undefined;
    const defaults = await getUploadDefaults();

    let sourceMetadata: Record<string, unknown> = {
      originalFilename: file.name,
      contentType: file.type,
    };
    if (isVideo) {
      try {
        const metadata = await extractMetadata(filePath);
        sourceMetadata = { ...sourceMetadata, ...metadata.raw };
      } catch (error) {
        console.warn("Unable to inspect uploaded media before queueing", error);
      }
    }

    const now = new Date();
    let video: ReturnType<typeof createVideo>;
    try {
      video = createVideo({
        id: videoId,
        filename: physicalName,
        originalPath: toStoredPath(filePath),
        originalSha256,
        activePath: toStoredPath(filePath),
        activeSize: file.size,
        activeMetadata: sourceMetadata,
        title:
          formData.get("title")?.toString() ||
          file.name.replace(/\.[^/.]+$/, ""),
        description: formData.get("description")?.toString() || "",
        status: "QUEUED",
        mediaType: isImage ? "IMAGE" : "VIDEO",
        isHidden: !defaults.visibilityEnabled,
        originalSize: file.size,
        originalMetadata: sourceMetadata,
        createdAt: clientDate && !isNaN(clientDate.getTime()) ? clientDate : now,
        uploadedAt: now,
        date: clientDate && !isNaN(clientDate.getTime()) ? clientDate : now,
        tags: defaults.tags,
      });
    } catch (error) {
      const duplicateVideoId = findVideoIdByOriginalSha256(originalSha256);
      if (duplicateVideoId && duplicateVideoId !== videoId) {
        await unlink(filePath).catch(() => {});
        return NextResponse.json(
          { error: "This file has already been uploaded." },
          { status: 409 },
        );
      }
      throw error;
    }

    createJobHistory({
      videoId: video.id,
      jobType: "UPLOAD",
      status: "COMPLETED",
      completedAt: new Date(),
      originalSize: file.size,
      processedSize: 0,
      errorMessage: null,
      metadata: null,
    });

    enqueueVideoJob({ videoId: video.id, filePath: toStoredPath(filePath) });

    // Force the Next.js router cache to invalidate the Manage tab
    // so it immediately picks up this new QUEUED video row.
    revalidatePath("/admin");

    return NextResponse.json(
      {
        message: "Upload successful, video queued for processing",
        videoId: video.id,
      },
      { status: 201 },
    );
  } catch (error) {
    console.error("Upload Error:", error);
    return NextResponse.json(
      { error: "Failed to upload file" },
      { status: 500 },
    );
  }
}
