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

export type VideoJobData = {
  videoId: string;
  filePath: string;
};
