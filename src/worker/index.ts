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
import sharp from "sharp";

const DATA_PATH = path.resolve(
  process.cwd(),
  process.env.DATA_PATH || "./data",
);

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

function hasMediaTools(): boolean {
  return hasMediaTool("ffmpeg") && hasMediaTool("ffprobe");
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
        originalStats.atime,
      ]);

      const existingMeta =
        (videoRecord.originalMetadata as Record<string, unknown>) || {};

      updateVideo(videoId, {
        width: metadata.width,
        height: metadata.height,
        createdAt: oldestDate,
        date: oldestDate,
        originalMetadata: {
          ...existingMeta,
          format: metadata.format,
          size: metadata.size,
        },
      });

      const baseName = path.parse(filename).name;

      console.log(`[Worker] Attempting WebP conversion for ${videoId}`);
      const processedDir = path.join(DATA_PATH, "processed");
      await mkdir(processedDir, { recursive: true });

      const outputFilename = `${baseName}.webp`;
      const outputPath = path.join(processedDir, outputFilename);

      await sharp(filePath).webp({ lossless: true }).toFile(outputPath);

      const webpStats = await stat(outputPath);

      const vaultDir = path.join(DATA_PATH, "vault");
      await mkdir(vaultDir, { recursive: true });

      let finalPath: string;
      let finalSize = 0;

      // Ensure the generated webp is smaller. If tracking original lossless, keep original otherwise
      if (webpStats.size > originalStats.size) {
        console.log(
          `[Worker] Image ${videoId} WebP was larger (${webpStats.size} > ${originalStats.size}), keeping original`,
        );
        await unlink(outputPath); // throw away the webp
        finalPath = path.join(vaultDir, `${videoId}${path.extname(filename)}`);
        await rename(filePath, finalPath);
        finalSize = originalStats.size;
      } else {
        console.log(
          `[Worker] Image ${videoId} compressed (${originalStats.size} -> ${webpStats.size})`,
        );
        finalPath = path.join(vaultDir, outputFilename);
        await rename(outputPath, finalPath);
        await unlink(filePath).catch(() => {});
        finalSize = webpStats.size;
      }

      updateQueueProgress(job.id, 100);

      // Final DB Updates
      updateVideo(videoId, {
        status: "COMPLETED",
        processedPath: finalPath,
        processedSize: finalSize,
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

      updateVideo(videoId, {
        duration: metadata.duration,
        width: metadata.width,
        height: metadata.height,
        createdAt: oldestDate,
        date: oldestDate,
        originalMetadata: {
          ...existingMeta,
          ...(metadata.raw as object),
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

      const finalWebmPath = path.join(vaultDir, outputFilename);

      const transcodedStats = await stat(outputPath);
      let finalPath = finalWebmPath;
      let finalSize = transcodedStats.size;

      if (transcodedStats.size > originalStats.size) {
        finalPath = path.join(vaultDir, filename);
        finalSize = originalStats.size;

        await unlink(outputPath).catch(() => {});
        await rename(filePath, finalPath);
      } else {
        // Delete the original raw file from .uploads, keep only WebM
        await unlink(filePath);
        await rename(outputPath, finalPath);
      }

      // 5. Final DB Updates
      updateVideo(videoId, {
        status: "COMPLETED",
        processedPath: finalPath,
        processedSize: finalSize,
      });

      createJobHistory({
        videoId,
        jobType: "TRANSCODE",
        status: "COMPLETED",
        startedAt: transcodeStartedAt,
        completedAt: new Date(),
        originalSize: videoRecord.originalSize,
        processedSize: transcodedStats.size,
        errorMessage: null,
        metadata: null,
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
      originalSize: 0,
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
    if (!hasMediaTools()) {
      if (!missingToolsReported) {
        console.error(
          "[Worker] Waiting for ffmpeg and ffprobe to be available on PATH before claiming jobs.",
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
