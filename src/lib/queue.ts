import { Queue, QueueOptions } from "bullmq";
import Redis from "ioredis";

// Reuse the Redis connection for all BullMQ instances
const connection = new Redis(process.env.REDIS_URL || "redis://localhost:6379", {
  maxRetriesPerRequest: null,
});

const queueOptions: QueueOptions = {
  connection: connection as any,
};

export const videoQueue = new Queue("video-jobs", queueOptions);

const QUEUE_PAUSED_KEY = "video-jobs:paused";

export async function isQueuePaused(): Promise<boolean> {
  return (await connection.get(QUEUE_PAUSED_KEY)) === "1";
}

export async function setQueuePaused(paused: boolean): Promise<void> {
  await connection.set(QUEUE_PAUSED_KEY, paused ? "1" : "0");
}

export type VideoJobData = {
  videoId: string;
  filePath: string;
};
