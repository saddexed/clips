import { Worker, Job } from "bullmq";
import Redis from "ioredis";
import { rename, stat, mkdir, unlink } from "node:fs/promises";
import path from "node:path";
import { prisma } from "../lib/prisma.js";
import { extractMetadata, transcodeToWebM } from "../lib/ffmpeg.js";
import sharp from "sharp";

const connection = new Redis(process.env.REDIS_URL || "redis://localhost:6379", {
  maxRetriesPerRequest: null,
});

const DATA_PATH = path.resolve(process.cwd(), process.env.DATA_PATH || "/app/data");

function getOldestDate(dates: (Date | number | string | undefined | null)[]): Date | undefined {
  let oldest: Date | undefined;
  for (const d of dates) {
    if (!d) continue;
    const date = new Date(d);
    // Ignore invalid dates and the Unix Epoch (zero date, often used as default empty)
    if (isNaN(date.getTime()) || date.getTime() === 0) continue; 
    if (!oldest || date < oldest) oldest = date;
  }
  return oldest;
}

async function processVideo(job: Job) {
  const { videoId } = job.data;
  console.log(`[Worker] Started processing video ${videoId}`);

  await prisma.video.update({
    where: { id: videoId },
    data: { status: "PROCESSING" },
  });

  // We no longer pre-fetch jobHistory because it is not created until completion.

  const videoRecord = await prisma.video.findUnique({
    where: { id: videoId },
  });

  if (!videoRecord) {
    throw new Error(`Video record not found for id ${videoId}`);
  }

  const filename = videoRecord.filename;
  const filePath = path.join(DATA_PATH, ".uploads", filename);
  
  const isImage = videoRecord.mediaType === "IMAGE";

  try {
    if (isImage) {
      // --- IMAGE PROCESSING PIPELINE ---
      console.log(`[Worker] Extracting metadata for image ${videoId}`);
      const metadata = await sharp(filePath).metadata();
      const originalStats = await stat(filePath);
      const oldestDate = getOldestDate([
        videoRecord.createdAt,
        originalStats.birthtime, 
        originalStats.mtime, 
        originalStats.atime
      ]);
      
      const existingMeta = (videoRecord.originalMetadata as Record<string, any>) || {};

      await prisma.video.update({
        where: { id: videoId },
        data: {
          width: metadata.width,
          height: metadata.height,
          createdAt: oldestDate,
          date: oldestDate,
          originalMetadata: {
            ...existingMeta,
            format: metadata.format,
            size: metadata.size,
          },
        },
      });

      const baseName = path.parse(filename).name;

      console.log(`[Worker] Attempting WebP conversion for ${videoId}`);
      const processedDir = path.join(DATA_PATH, "processed");
      await mkdir(processedDir, { recursive: true });
      
      const outputFilename = `${baseName}.webp`;
      const outputPath = path.join(processedDir, outputFilename);

      await sharp(filePath)
        .webp({ lossless: true })
        .toFile(outputPath);
      
      const webpStats = await stat(outputPath);
      
      const vaultDir = path.join(DATA_PATH, "vault");
      await mkdir(vaultDir, { recursive: true });

      let finalPath;
      let finalSize = 0;

      // Ensure the generated webp is smaller. If tracking original lossless, keep original otherwise
      if (webpStats.size > originalStats.size) {
        console.log(`[Worker] Image ${videoId} WebP was larger (${webpStats.size} > ${originalStats.size}), keeping original`);
        await unlink(outputPath); // throw away the webp
        finalPath = path.join(vaultDir, `${videoId}${path.extname(filename)}`);
        await rename(filePath, finalPath);
        finalSize = originalStats.size;
      } else {
        console.log(`[Worker] Image ${videoId} compressed (${originalStats.size} -> ${webpStats.size})`);
        finalPath = path.join(vaultDir, outputFilename);
        await rename(outputPath, finalPath);
        await unlink(filePath).catch(() => {});
        finalSize = webpStats.size;
      }
      
      await job.updateProgress(100);

      // Final DB Updates
      await prisma.video.update({
        where: { id: videoId },
        data: {
          status: "COMPLETED",
          processedPath: finalPath,
          processedSize: finalSize,
        },
      });

      console.log(`[Worker] Finished processing image ${videoId}`);

    } else {
      // --- VIDEO PROCESSING PIPELINE ---
      console.log(`[Worker] Extracting metadata for video ${videoId}`);
      const metadata = await extractMetadata(filePath);
      const originalStats = await stat(filePath);
      
      const oldestDate = getOldestDate([
        videoRecord.createdAt,
        originalStats.birthtime, 
        originalStats.mtime, 
        originalStats.atime, 
        metadata.creation_time
      ]);
      
      const existingMeta = (videoRecord.originalMetadata as Record<string, any>) || {};

      await prisma.video.update({
        where: { id: videoId },
        data: {
          duration: metadata.duration,
          width: metadata.width,
          height: metadata.height,
          createdAt: oldestDate,
          date: oldestDate,
          originalMetadata: {
            ...existingMeta,
            ...(metadata.raw as object)
          },
        },
      });

      if (!metadata.duration) {
        throw new Error("Could not determine video duration");
      }



      const baseName = path.parse(filename).name;

      // 3. Mark Transcode start time so it sits correctly chronologically
      const transcodeStartedAt = new Date();

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

      await prisma.jobHistory.create({
        data: {
          videoId,
          jobType: "TRANSCODE",
          status: "COMPLETED",
          startedAt: transcodeStartedAt,
          completedAt: new Date(),
          originalSize: videoRecord.originalSize,
          processedSize: processedStats.size,
        },
      });

      console.log(`[Worker] Finished processing video ${videoId}`);
    }

  } catch (error) {
    console.error(`[Worker] Error processing video ${videoId}:`, error);

    await prisma.video.update({
      where: { id: videoId },
      data: { status: "FAILED" },
    });

    await prisma.jobHistory.create({
      data: {
        videoId,
        jobType: "TRANSCODE",
        status: "FAILED",
        completedAt: new Date(),
        errorMessage: error instanceof Error ? error.message : "Unknown error",
      }
    });

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
