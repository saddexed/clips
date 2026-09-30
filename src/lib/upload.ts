import { createHash, randomUUID } from "node:crypto";
import { createReadStream } from "node:fs";
import { mkdir, rename, unlink } from "node:fs/promises";
import path from "node:path";
import { revalidatePath, revalidateTag } from "next/cache";
import { createJobHistory, createVideo, findVideoIdByOriginalSha256 } from "@/lib/database";
import { getUploadDefaults } from "@/lib/settings";
import { enqueueVideoJob } from "@/lib/queue";
import { extractMetadata } from "@/lib/ffmpeg";
import { normalizeMediaMetadata } from "@/lib/media";
import { getDataPath, toStoredPath, vaultArtifactPath } from "@/lib/paths";

export class DuplicateUploadError extends Error {}

export async function finalizeUploadedFile(input: {
  stagedPath: string;
  filename: string;
  title?: string;
  contentType: string;
  size: number;
  lastModified?: number;
}): Promise<string> {
  const isImage = input.contentType.startsWith("image/");
  const hash = createHash("sha256");
  for await (const bytes of createReadStream(input.stagedPath)) hash.update(bytes);
  const originalSha256 = hash.digest("hex");
  if (findVideoIdByOriginalSha256(originalSha256)) {
    throw new DuplicateUploadError("This file has already been uploaded.");
  }

  const videoId = randomUUID();
  const physicalName = path.basename(
    vaultArtifactPath(videoId, input.filename, "original", isImage ? "IMAGE" : "VIDEO"),
  );
  const originalDir = path.join(getDataPath(), "vault", "original");
  const filePath = path.join(originalDir, physicalName);
  await mkdir(originalDir, { recursive: true });
  await rename(input.stagedPath, filePath);

  const defaults = await getUploadDefaults();
  let probeMetadata: Awaited<ReturnType<typeof extractMetadata>> | null = null;
  if (!isImage) {
    try {
      probeMetadata = await extractMetadata(filePath);
    } catch (error) {
      console.warn("Unable to inspect uploaded media before queueing", error);
    }
  }

  const now = new Date();
  const clientDate = input.lastModified === undefined ? undefined : new Date(input.lastModified);
  const createdAt = clientDate && !isNaN(clientDate.getTime()) ? clientDate : now;
  const normalizedMetadata = normalizeMediaMetadata({
    id: videoId,
    filename: input.filename,
    hash: originalSha256,
    contentType: input.contentType || (isImage ? "image/*" : "video/*"),
    size: input.size,
    createdAt,
    uploadedAt: now,
    raw: probeMetadata?.raw,
    width: probeMetadata?.width,
    height: probeMetadata?.height,
    duration: probeMetadata?.duration,
    videoCodec: probeMetadata?.videoCodec,
    bitRate: typeof probeMetadata?.raw?.format?.bit_rate === "string"
      ? Number(probeMetadata.raw.format.bit_rate)
      : undefined,
  });

  let video: ReturnType<typeof createVideo>;
  try {
    video = createVideo({
      id: videoId,
      filename: physicalName,
      originalSha256,
      activeSize: input.size,
      metadata: normalizedMetadata,
      title: input.title || input.filename.replace(/\.[^/.]+$/, ""),
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
      throw new DuplicateUploadError("This file has already been uploaded.");
    }
    throw error;
  }

  createJobHistory({
    videoId: video.id,
    jobType: "UPLOAD",
    status: "COMPLETED",
    completedAt: new Date(),
    originalSize: input.size,
    processedSize: 0,
    errorMessage: null,
    metadata: null,
  });
  enqueueVideoJob({ videoId: video.id, filePath: toStoredPath(filePath) });
  revalidatePath("/admin");
  revalidatePath("/");
  revalidateTag("videos", { expire: 0 });
  return video.id;
}
