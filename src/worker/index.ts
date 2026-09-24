import { spawnSync } from "node:child_process";
import { rename, stat, mkdir, unlink } from "node:fs/promises";
import path from "node:path";
import { createJobHistory, getVideo, updateVideo } from "../lib/database.js";
import {
  claimNextJob,
  completeQueueJob,
  failQueueJob,
  isQueuePaused,
  updateQueueProgress,
  type QueueJob,
} from "../lib/queue.js";
import {
  extractMetadata,
  killActiveFfmpegProcess,
  transcodeToWebM,
} from "../lib/ffmpeg.js";
import { isAdoptableWebm, normalizeMediaMetadata } from "../lib/media.js";
import {
  getDataPath,
  resolveStoredPath,
} from "../lib/paths.js";
import sharp from "sharp";

const DATA_PATH = getDataPath();

function getOldestDate(
  dates: (Date | number | string | undefined | null)[],
): Date | undefined {
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

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

function hasMediaTool(command: "ffmpeg" | "ffprobe"): boolean {
  return spawnSync(command, ["-version"], { stdio: "ignore" }).status === 0;
}

async function waitUntilQueueResumed() {
  while (isQueuePaused()) {
    await sleep(1000);
  }
}

async function processVideo(job: QueueJob) {
  const { videoId } = job.data;
  console.log(`[Worker] Started processing video ${videoId}`);

  await waitUntilQueueResumed();

  updateVideo(videoId, { status: "PROCESSING" });

  // We no longer pre-fetch jobHistory because it is not created until completion.

  const videoRecord = getVideo(videoId);

  if (!videoRecord) {
    throw new Error(`Video record not found for id ${videoId}`);
  }

  const filename = videoRecord.filename;
  const storedSourcePath = videoRecord.originalPath || job.data.filePath;
  const filePath = resolveStoredPath(storedSourcePath);
  if (!filePath) {
    throw new Error(`Video ${videoId} has no source path`);
  }

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
        originalStats.atime,
      ]);

      const existingMeta =
        (videoRecord.originalMetadata as Record<string, unknown>) || {};
      const originalMetadata = normalizeMediaMetadata({
        id: videoId,
        filename,
        hash: videoRecord.sha256Hash || "",
        contentType:
          typeof existingMeta.contentType === "string"
            ? existingMeta.contentType
            : "image/*",
        size: originalStats.size,
        createdAt: oldestDate || videoRecord.createdAt,
        uploadedAt: videoRecord.uploadedAt,
        raw: { format: { format_name: metadata.format } },
        width: metadata.width,
        height: metadata.height,
      });

      updateVideo(videoId, {
        width: metadata.width,
        height: metadata.height,
        createdAt: oldestDate,
        originalMetadata,
        activeSize: originalStats.size,
      });

      console.log(`[Worker] Attempting WebP conversion for ${videoId}`);
      const processedDir = path.join(DATA_PATH, "processed");
      await mkdir(processedDir, { recursive: true });

      const outputFilename = `${videoId}.webp`;
      const outputPath = path.join(processedDir, outputFilename);
      await sharp(filePath).webp({ lossless: true }).toFile(outputPath);

      const webpStats = await stat(outputPath);
      const vaultDir = path.join(DATA_PATH, "vault");
      await mkdir(vaultDir, { recursive: true });

      let finalPath: string;
      let finalSize: number;

      if (webpStats.size > originalStats.size) {
        console.log(
          `[Worker] Image ${videoId} WebP was larger (${webpStats.size} > ${originalStats.size}), keeping original`,
        );
        await unlink(outputPath);
        finalPath = path.join(vaultDir, `${videoId}${path.extname(filename)}`);
        await rename(filePath, finalPath);
        finalSize = originalStats.size;
      } else {
        console.log(
          `[Worker] Image ${videoId} compressed (${originalStats.size} -> ${webpStats.size})`,
        );
        finalPath = path.join(vaultDir, `${videoId}.webp`);
        await rename(outputPath, finalPath);
        finalSize = webpStats.size;
      }

      updateQueueProgress(job.id, 100);
      updateVideo(videoId, {
        status: "COMPLETED",
        activeSize: finalSize,
        originalMetadata,
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
        metadata.creation_time,
      ]);

      const existingMeta =
        (videoRecord.originalMetadata as Record<string, unknown>) || {};
      const originalMetadata = normalizeMediaMetadata({
        id: videoId,
        filename,
        hash: videoRecord.sha256Hash || "",
        contentType:
          typeof existingMeta.contentType === "string"
            ? existingMeta.contentType
            : "video/*",
        size: originalStats.size,
        createdAt: oldestDate || videoRecord.createdAt,
        uploadedAt: videoRecord.uploadedAt,
        raw: metadata.raw,
        width: metadata.width,
        height: metadata.height,
        duration: metadata.duration,
        videoCodec: metadata.videoCodec,
        bitRate:
          typeof metadata.raw?.format?.bit_rate === "string"
            ? Number(metadata.raw.format.bit_rate)
            : undefined,
      });

      updateVideo(videoId, {
        duration: metadata.duration,
        width: metadata.width,
        height: metadata.height,
        createdAt: oldestDate,
        originalMetadata,
        activeSize: originalStats.size,
      });

      if (isAdoptableWebm(metadata.raw)) {
        const vaultDir = path.join(DATA_PATH, "vault");
        await mkdir(vaultDir, { recursive: true });
        const finalPath = path.join(vaultDir, `${videoId}.webm`);
        if (path.resolve(filePath) !== path.resolve(finalPath)) {
          await rename(filePath, finalPath);
        }
        const finalStats = await stat(finalPath);
        updateVideo(videoId, {
          status: "COMPLETED",
          activeSize: finalStats.size,
          originalMetadata,
        });
        updateQueueProgress(job.id, 100);
        createJobHistory({
          videoId,
          jobType: "TRANSCODE",
          status: "COMPLETED",
          startedAt: new Date(),
          completedAt: new Date(),
          originalSize: originalStats.size,
          processedSize: finalStats.size,
          errorMessage: null,
          metadata: {
            action: "ADOPTED",
            codec: metadata.videoCodec || null,
            container: metadata.container || metadata.format || null,
          },
        });
        console.log(`[Worker] Adopted compatible WebM ${videoId}`);
        return;
      }

      if (!metadata.duration) {
        throw new Error("Could not determine video duration");
      }
      if (!hasMediaTool("ffmpeg")) {
        throw new Error("ffmpeg is required to process this video");
      }

      // 3. Mark Transcode start time so it sits correctly chronologically
      const transcodeStartedAt = new Date();

      console.log(`[Worker] Transcoding to WebM for ${videoId}`);
      const processedDir = path.join(DATA_PATH, "processed");
      await mkdir(processedDir, { recursive: true });

      const outputFilename = `${videoId}.webm`;
      const outputPath = path.join(processedDir, outputFilename);

      let transcoded = false;

      while (!transcoded) {
        await waitUntilQueueResumed();

        let pauseCheckTimer: NodeJS.Timeout | null = null;
        let pauseTriggered = false;

        try {
          pauseCheckTimer = setInterval(() => {
            if (isQueuePaused()) {
              pauseTriggered = true;
              const killed = killActiveFfmpegProcess();
              if (killed) {
                console.log(
                  `[Worker] Queue paused - interrupted ffmpeg for ${videoId}`,
                );
              }
            }
          }, 750);

          await transcodeToWebM(
            filePath,
            outputPath,
            metadata.duration,
            async (percent) => {
              updateQueueProgress(job.id, percent);
            },
            metadata.audioBitrate,
          );

          transcoded = true;
        } catch (error) {
          const currentlyPaused = isQueuePaused();
          if (pauseTriggered || currentlyPaused) {
            updateQueueProgress(job.id, 0);
            console.log(
              `[Worker] Queue is paused; restarting transcode from beginning once resumed for ${videoId}`,
            );
            await waitUntilQueueResumed();
            continue;
          }
          throw error;
        } finally {
          if (pauseCheckTimer) {
            clearInterval(pauseCheckTimer);
          }
        }
      }

      // 4. Move to Vault
      console.log(`[Worker] Moving files to vault for ${videoId}`);
      const vaultDir = path.join(DATA_PATH, "vault");
      await mkdir(vaultDir, { recursive: true });

      const finalWebmPath = path.join(vaultDir, `${videoId}.webm`);

      const transcodedStats = await stat(outputPath);
      let finalPath: string;
      let finalSize: number;
      let processedSize = 0;

      if (transcodedStats.size > originalStats.size) {
        finalPath = path.join(vaultDir, `${videoId}${path.extname(filename)}`);
        finalSize = originalStats.size;

        await unlink(outputPath).catch(() => {});
        await unlink(finalPath).catch(() => {});
        await rename(filePath, finalPath);
      } else {
        await unlink(finalWebmPath).catch(() => {});
        await rename(outputPath, finalWebmPath);
        finalPath = finalWebmPath;
        processedSize = transcodedStats.size;
        finalSize = processedSize;
      }

      // 5. Final DB Updates
      updateVideo(videoId, {
        status: "COMPLETED",
        activeSize: finalSize,
        originalMetadata,
      });

      createJobHistory({
        videoId,
        jobType: "TRANSCODE",
        status: "COMPLETED",
        startedAt: transcodeStartedAt,
        completedAt: new Date(),
        originalSize: videoRecord.originalSize,
        processedSize,
        errorMessage: null,
        metadata: { action: "TRANSCODED" },
      });

      console.log(`[Worker] Finished processing video ${videoId}`);
    }
  } catch (error) {
    console.error(`[Worker] Error processing video ${videoId}:`, error);

    updateVideo(videoId, { status: "FAILED" });

    createJobHistory({
      videoId,
      jobType: "TRANSCODE",
      status: "FAILED",
      completedAt: new Date(),
      originalSize: videoRecord.originalSize,
      processedSize: 0,
      errorMessage: error instanceof Error ? error.message : "Unknown error",
      metadata: null,
    });

    throw error;
  }
}

let stopping = false;
process.once("SIGINT", () => {
  stopping = true;
});
process.once("SIGTERM", () => {
  stopping = true;
});

async function runWorker() {
  console.log("[Worker] SQLite worker started successfully");
  let missingToolsReported = false;
  while (!stopping) {
    if (!hasMediaTool("ffprobe")) {
      if (!missingToolsReported) {
        console.error(
          "[Worker] Waiting for ffprobe to be available on PATH before claiming jobs.",
        );
        missingToolsReported = true;
      }
      await sleep(30_000);
      continue;
    }
    missingToolsReported = false;

    const job = claimNextJob();
    if (!job) {
      await sleep(1000);
      continue;
    }

    try {
      await processVideo(job);
      completeQueueJob(job.id);
      console.log(`[Worker] Job ${job.id} completed successfully`);
    } catch (error) {
      failQueueJob(job.id, error);
      console.error(`[Worker] Job ${job.id} failed:`, error);
    }
  }
  console.log("[Worker] SQLite worker stopped");
}

void runWorker();
