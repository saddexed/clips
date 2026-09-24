import { NextRequest, NextResponse } from "next/server";
import { writeFile, mkdir, rename, unlink } from "node:fs/promises";
import path from "node:path";
import {
  createJobHistory,
  createVideo,
  findVideoIdByOriginalSha256,
} from "@/lib/database";
import { getUploadDefaults } from "@/lib/settings";
import { enqueueVideoJob } from "@/lib/queue";
import { extractMetadata } from "@/lib/ffmpeg";
import { normalizeMediaMetadata } from "@/lib/media";
import { getDataPath, toStoredPath, vaultArtifactPath } from "@/lib/paths";
import { hashBytes } from "@/lib/hash";
import { revalidatePath, revalidateTag } from "next/cache";
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
    const originalDir = path.join(dataPath, "vault", "original");

    // Stage the upload outside the vault, then publish it with one rename.
    await mkdir(tempDir, { recursive: true });
    await mkdir(originalDir, { recursive: true });

    // Generate UUID manually so we can write the file deterministically in one pass
    const videoId = crypto.randomUUID();
    const physicalName = path.basename(
      vaultArtifactPath(videoId, file.name, "original", isImage ? "IMAGE" : "VIDEO"),
    );
    const stagedPath = path.join(tempDir, physicalName);
    const filePath = path.join(originalDir, physicalName);

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
    await writeFile(stagedPath, buffer);
    await rename(stagedPath, filePath);

    const lastModifiedStr = formData.get("lastModified")?.toString();
    const clientDate = lastModifiedStr
      ? new Date(parseInt(lastModifiedStr, 10))
      : undefined;
    const defaults = await getUploadDefaults();

    let probeMetadata: Awaited<ReturnType<typeof extractMetadata>> | null = null;
    if (isVideo) {
      try {
        probeMetadata = await extractMetadata(filePath);
      } catch (error) {
        console.warn("Unable to inspect uploaded media before queueing", error);
      }
    }

    const now = new Date();
    const createdAt =
      clientDate && !isNaN(clientDate.getTime()) ? clientDate : now;
    const normalizedMetadata = normalizeMediaMetadata({
      id: videoId,
      filename: file.name,
      hash: originalSha256,
      contentType: file.type || (isImage ? "image/*" : "video/*"),
      size: file.size,
      createdAt,
      uploadedAt: now,
      raw: probeMetadata?.raw,
      width: probeMetadata?.width,
      height: probeMetadata?.height,
      duration: probeMetadata?.duration,
      videoCodec: probeMetadata?.videoCodec,
      bitRate:
        typeof probeMetadata?.raw?.format?.bit_rate === "string"
          ? Number(probeMetadata.raw.format.bit_rate)
          : undefined,
    });
    let video: ReturnType<typeof createVideo>;
    try {
      video = createVideo({
        id: videoId,
        filename: physicalName,
        originalSha256,
        activeSize: file.size,
        metadata: normalizedMetadata,
        title:
          formData.get("title")?.toString() ||
          file.name.replace(/\.[^/.]+$/, ""),
        status: "QUEUED",
        isHidden: !defaults.visibilityEnabled,
        createdAt,
        uploadedAt: now,
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
    revalidatePath("/");
    revalidateTag("videos", { expire: 0 });

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
