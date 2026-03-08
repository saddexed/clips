import { Worker, Job } from "bullmq";
import Redis from "ioredis";
import { rename, stat, mkdir, unlink } from "node:fs/promises";
import path from "node:path";
import { prisma } from "../lib/prisma.js";
import { extractMetadata, transcodeToWebM, extractThumbnail } from "../lib/ffmpeg.js";

const connection = new Redis(process.env.REDIS_URL || "redis://localhost:6379", {
  maxRetriesPerRequest: null,
});

const DATA_PATH = process.env.DATA_PATH || "/app/data";

async function processVideo(job: Job) {
  const { videoId, filePath } = job.data;
  console.log(`[Worker] Started processing video ${videoId} at ${filePath}`);
  
  const filename = path.basename(filePath);

  await prisma.video.update({
    where: { id: videoId },
    data: { status: "PROCESSING" },
  });

  const jobHistory = await prisma.jobHistory.findFirst({
    where: { videoId, status: "PENDING", jobType: "TRANSCODE" },
    orderBy: { startedAt: "desc" },
  });

  try {
    // 1. Extract Metadata
    console.log(`[Worker] Extracting metadata for ${videoId}`);
    const metadata = await extractMetadata(filePath);
    
    // Fetch the existing video to preserve its originalMetadata (like originalFilename)
    const existingVideo = await prisma.video.findUnique({
      where: { id: videoId },
      select: { originalMetadata: true }
    });
    
    const existingMeta = (existingVideo?.originalMetadata as Record<string, any>) || {};

    await prisma.video.update({
      where: { id: videoId },
      data: {
        duration: metadata.duration,
        width: metadata.width,
        height: metadata.height,
        originalMetadata: {
          ...existingMeta,
          ...(metadata.raw as object)
        },
      },
    });

    if (!metadata.duration) {
      throw new Error("Could not determine video duration");
    }

    // 2. Extract Thumbnail
    console.log(`[Worker] Extracting thumbnail for ${videoId}`);
    const thumbnailDir = path.join(DATA_PATH, ".thumbnails");
    await mkdir(thumbnailDir, { recursive: true });
    
    const baseName = path.parse(filename).name;
    const thumbnailPath = path.join(thumbnailDir, `${videoId}.png`);
    await extractThumbnail(filePath, thumbnailPath);
    
    await prisma.jobHistory.create({
      data: {
        videoId,
        jobType: "THUMBNAIL",
        status: "COMPLETED",
        completedAt: new Date()
      }
    });

    // 3. Transcode to WebM
    console.log(`[Worker] Transcoding to WebM for ${videoId}`);
    const processedDir = path.join(DATA_PATH, "processed");
    await mkdir(processedDir, { recursive: true });
    
    const outputFilename = `${baseName}.webm`;
    const outputPath = path.join(processedDir, outputFilename);

    await transcodeToWebM(filePath, outputPath, metadata.duration, async (percent) => {
      await job.updateProgress(percent);
    });

    // 4. Move to Vault
    console.log(`[Worker] Moving files to vault for ${videoId}`);
    const vaultDir = path.join(DATA_PATH, "vault");
    await mkdir(vaultDir, { recursive: true });
    
    const finalWebmPath = path.join(vaultDir, outputFilename);
    
    // Delete the original raw file from .uploads, keep only WebM
    await unlink(filePath);
    await rename(outputPath, finalWebmPath);

    // 5. Final DB Updates
    const processedStats = await stat(finalWebmPath);

    await prisma.video.update({
      where: { id: videoId },
      data: {
        status: "COMPLETED",
        processedPath: finalWebmPath,
        processedSize: processedStats.size,
      },
    });

    if (jobHistory) {
      await prisma.jobHistory.update({
        where: { id: jobHistory.id },
        data: {
          status: "COMPLETED",
          completedAt: new Date(),
          processedSize: processedStats.size,
        },
      });
    }

    console.log(`[Worker] Finished processing video ${videoId}`);

  } catch (error) {
    console.error(`[Worker] Error processing video ${videoId}:`, error);

    await prisma.video.update({
      where: { id: videoId },
      data: { status: "FAILED" },
    });

    if (jobHistory) {
      await prisma.jobHistory.update({
        where: { id: jobHistory.id },
        data: {
          status: "FAILED",
          completedAt: new Date(),
          errorMessage: error instanceof Error ? error.message : "Unknown error",
        },
      });
    }

    throw error;
  }
}

const worker = new Worker("video-jobs", processVideo, { connection: connection as any });

worker.on("completed", (job) => {
  console.log(`[BullMQ] Job ${job.id} completed successfully`);
});

worker.on("failed", (job, err) => {
  console.log(`[BullMQ] Job ${job?.id} failed:`, err);
});

console.log("[Worker] BullMQ Worker started successfully");
