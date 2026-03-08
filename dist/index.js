var __defProp = Object.defineProperty;
var __export = (target, all) => {
  for (var name in all)
    __defProp(target, name, { get: all[name], enumerable: true });
};

// src/worker/index.ts
import { Worker } from "bullmq";
import Redis from "ioredis";
import { rename, stat } from "fs/promises";
import path2 from "path";

// src/lib/prisma.ts
import { Pool } from "pg";
import { PrismaPg } from "@prisma/adapter-pg";

// src/generated/prisma/client.ts
import * as path from "path";
import { fileURLToPath } from "url";

// src/generated/prisma/internal/class.ts
import * as runtime from "@prisma/client/runtime/client";
var config = {
  "previewFeatures": [],
  "clientVersion": "7.4.2",
  "engineVersion": "94a226be1cf2967af2541cca5529f0f7ba866919",
  "activeProvider": "postgresql",
  "inlineSchema": 'generator client {\n  provider = "prisma-client"\n  output   = "../src/generated/prisma"\n}\n\ndatasource db {\n  provider = "postgresql"\n}\n\n// \u2500\u2500 Enums \u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\n\nenum VideoStatus {\n  UPLOADING\n  QUEUED\n  PROCESSING\n  COMPLETED\n  FAILED\n}\n\nenum JobType {\n  TRANSCODE\n  THUMBNAIL\n  METADATA_EXTRACT\n}\n\nenum JobStatus {\n  PENDING\n  RUNNING\n  COMPLETED\n  FAILED\n}\n\n// \u2500\u2500 Models \u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\n\nmodel Video {\n  id               String      @id @default(uuid())\n  filename         String\n  originalPath     String\n  processedPath    String?\n  originalMetadata Json?\n  title            String      @default("")\n  description      String      @default("")\n  status           VideoStatus @default(UPLOADING)\n  originalSize     BigInt      @default(0)\n  processedSize    BigInt      @default(0)\n  duration         Float?\n  width            Int?\n  height           Int?\n  createdAt        DateTime    @default(now())\n  updatedAt        DateTime    @updatedAt\n\n  comments   Comment[]\n  tags       Tag[]        @relation("VideoTags")\n  jobHistory JobHistory[]\n\n  @@index([status])\n  @@index([createdAt])\n  @@map("videos")\n}\n\nmodel Comment {\n  id        String   @id @default(uuid())\n  content   String\n  videoId   String\n  video     Video    @relation(fields: [videoId], references: [id], onDelete: Cascade)\n  createdAt DateTime @default(now())\n\n  @@index([videoId])\n  @@map("comments")\n}\n\nmodel Tag {\n  id     String  @id @default(uuid())\n  name   String  @unique\n  videos Video[] @relation("VideoTags")\n\n  @@map("tags")\n}\n\nmodel JobHistory {\n  id            String    @id @default(uuid())\n  videoId       String\n  video         Video     @relation(fields: [videoId], references: [id], onDelete: Cascade)\n  jobType       JobType\n  status        JobStatus @default(PENDING)\n  startedAt     DateTime  @default(now())\n  completedAt   DateTime?\n  originalSize  BigInt    @default(0)\n  processedSize BigInt    @default(0)\n  errorMessage  String?\n  metadata      Json?\n\n  @@index([videoId])\n  @@index([status])\n  @@map("job_history")\n}\n',
  "runtimeDataModel": {
    "models": {},
    "enums": {},
    "types": {}
  },
  "parameterizationSchema": {
    "strings": [],
    "graph": ""
  }
};
config.runtimeDataModel = JSON.parse('{"models":{"Video":{"fields":[{"name":"id","kind":"scalar","type":"String"},{"name":"filename","kind":"scalar","type":"String"},{"name":"originalPath","kind":"scalar","type":"String"},{"name":"processedPath","kind":"scalar","type":"String"},{"name":"originalMetadata","kind":"scalar","type":"Json"},{"name":"title","kind":"scalar","type":"String"},{"name":"description","kind":"scalar","type":"String"},{"name":"status","kind":"enum","type":"VideoStatus"},{"name":"originalSize","kind":"scalar","type":"BigInt"},{"name":"processedSize","kind":"scalar","type":"BigInt"},{"name":"duration","kind":"scalar","type":"Float"},{"name":"width","kind":"scalar","type":"Int"},{"name":"height","kind":"scalar","type":"Int"},{"name":"createdAt","kind":"scalar","type":"DateTime"},{"name":"updatedAt","kind":"scalar","type":"DateTime"},{"name":"comments","kind":"object","type":"Comment","relationName":"CommentToVideo"},{"name":"tags","kind":"object","type":"Tag","relationName":"VideoTags"},{"name":"jobHistory","kind":"object","type":"JobHistory","relationName":"JobHistoryToVideo"}],"dbName":"videos"},"Comment":{"fields":[{"name":"id","kind":"scalar","type":"String"},{"name":"content","kind":"scalar","type":"String"},{"name":"videoId","kind":"scalar","type":"String"},{"name":"video","kind":"object","type":"Video","relationName":"CommentToVideo"},{"name":"createdAt","kind":"scalar","type":"DateTime"}],"dbName":"comments"},"Tag":{"fields":[{"name":"id","kind":"scalar","type":"String"},{"name":"name","kind":"scalar","type":"String"},{"name":"videos","kind":"object","type":"Video","relationName":"VideoTags"}],"dbName":"tags"},"JobHistory":{"fields":[{"name":"id","kind":"scalar","type":"String"},{"name":"videoId","kind":"scalar","type":"String"},{"name":"video","kind":"object","type":"Video","relationName":"JobHistoryToVideo"},{"name":"jobType","kind":"enum","type":"JobType"},{"name":"status","kind":"enum","type":"JobStatus"},{"name":"startedAt","kind":"scalar","type":"DateTime"},{"name":"completedAt","kind":"scalar","type":"DateTime"},{"name":"originalSize","kind":"scalar","type":"BigInt"},{"name":"processedSize","kind":"scalar","type":"BigInt"},{"name":"errorMessage","kind":"scalar","type":"String"},{"name":"metadata","kind":"scalar","type":"Json"}],"dbName":"job_history"}},"enums":{},"types":{}}');
config.parameterizationSchema = {
  strings: JSON.parse('["where","orderBy","cursor","video","comments","videos","_count","tags","jobHistory","Video.findUnique","Video.findUniqueOrThrow","Video.findFirst","Video.findFirstOrThrow","Video.findMany","data","Video.createOne","Video.createMany","Video.createManyAndReturn","Video.updateOne","Video.updateMany","Video.updateManyAndReturn","create","update","Video.upsertOne","Video.deleteOne","Video.deleteMany","having","_avg","_sum","_min","_max","Video.groupBy","Video.aggregate","Comment.findUnique","Comment.findUniqueOrThrow","Comment.findFirst","Comment.findFirstOrThrow","Comment.findMany","Comment.createOne","Comment.createMany","Comment.createManyAndReturn","Comment.updateOne","Comment.updateMany","Comment.updateManyAndReturn","Comment.upsertOne","Comment.deleteOne","Comment.deleteMany","Comment.groupBy","Comment.aggregate","Tag.findUnique","Tag.findUniqueOrThrow","Tag.findFirst","Tag.findFirstOrThrow","Tag.findMany","Tag.createOne","Tag.createMany","Tag.createManyAndReturn","Tag.updateOne","Tag.updateMany","Tag.updateManyAndReturn","Tag.upsertOne","Tag.deleteOne","Tag.deleteMany","Tag.groupBy","Tag.aggregate","JobHistory.findUnique","JobHistory.findUniqueOrThrow","JobHistory.findFirst","JobHistory.findFirstOrThrow","JobHistory.findMany","JobHistory.createOne","JobHistory.createMany","JobHistory.createManyAndReturn","JobHistory.updateOne","JobHistory.updateMany","JobHistory.updateManyAndReturn","JobHistory.upsertOne","JobHistory.deleteOne","JobHistory.deleteMany","JobHistory.groupBy","JobHistory.aggregate","AND","OR","NOT","id","videoId","JobType","jobType","JobStatus","status","startedAt","completedAt","originalSize","processedSize","errorMessage","metadata","equals","string_contains","string_starts_with","string_ends_with","array_starts_with","array_ends_with","array_contains","lt","lte","gt","gte","not","in","notIn","contains","startsWith","endsWith","name","content","createdAt","filename","originalPath","processedPath","originalMetadata","title","description","VideoStatus","duration","width","height","updatedAt","every","some","none","is","isNot","connectOrCreate","upsert","set","disconnect","delete","connect","updateMany","deleteMany","createMany","increment","decrement","multiply","divide"]'),
  graph: "jAInQBUEAAChAQAgBwAAogEAIAgAAKMBACBRAACdAQAwUgAACwAQUwAAnQEAMFQBAAAAAVkAAJ4BeyJcBACZAQAhXQQAmQEAIXNAAJcBACF0AQCUAQAhdQEAlAEAIXYBAJoBACF3AACbAQAgeAEAlAEAIXkBAJQBACF7CACfAQAhfAIAoAEAIX0CAKABACF-QACXAQAhAQAAAAEAIAgDAACcAQAgUQAApgEAMFIAAAMAEFMAAKYBADBUAQCUAQAhVQEAlAEAIXIBAJQBACFzQACXAQAhAQMAAPwBACAIAwAAnAEAIFEAAKYBADBSAAADABBTAACmAQAwVAEAAAABVQEAlAEAIXIBAJQBACFzQACXAQAhAwAAAAMAIAEAAAQAMAIAAAUAIAYFAAClAQAgUQAApAEAMFIAAAcAEFMAAKQBADBUAQCUAQAhcQEAlAEAIQEFAACAAgAgBgUAAKUBACBRAACkAQAwUgAABwAQUwAApAEAMFQBAAAAAXEBAAAAAQMAAAAHACABAAAIADACAAAJACAVBAAAoQEAIAcAAKIBACAIAACjAQAgUQAAnQEAMFIAAAsAEFMAAJ0BADBUAQCUAQAhWQAAngF7IlwEAJkBACFdBACZAQAhc0AAlwEAIXQBAJQBACF1AQCUAQAhdgEAmgEAIXcAAJsBACB4AQCUAQAheQEAlAEAIXsIAJ8BACF8AgCgAQAhfQIAoAEAIX5AAJcBACEIBAAA_QEAIAcAAP4BACAIAAD_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_gEAIAgAAP8BACB2AACnAQAgdwAApwEAIHsAAKcBACB8AACnAQAgfQAApwEAIAAAAAARBwAA-wEAIAgAAOMBACBUAQAAAAFZAAAAewJcBAAAAAFdBAAAAAFzQAAAAAF0AQAAAAF1AQAAAAF2AQAAAAF3gAAAAAF4AQAAAAF5AQAAAAF7CAAAAAF8AgAAAAF9AgAAAAF-QAAAAAECAAAAAQAgFQAAgQIAIAMAAAALACAVAACBAgAgFgAAhQIAIBMAAAALACAHAADvAQAgCAAAyAEAIA4AAIUCACBUAQCtAQAhWQAAwwF7IlwEALIBACFdBACyAQAhc0AAsAEAIXQBAK0BACF1AQCtAQAhdgEAswEAIXeAAAAAAXgBAK0BACF5AQCtAQAhewgAxAEAIXwCAMUBACF9AgDFAQAhfkAAsAEAIREHAADvAQAgCAAAyAEAIFQBAK0BACFZAADDAXsiXAQAsgEAIV0EALIBACFzQACwAQAhdAEArQEAIXUBAK0BACF2AQCzAQAhd4AAAAABeAEArQEAIXkBAK0BACF7CADEAQAhfAIAxQEAIX0CAMUBACF-QACwAQAhA1QBAAAAAXIBAAAAAXNAAAAAAQlUAQAAAAFXAAAAVwJZAAAAWQJaQAAAAAFbQAAAAAFcBAAAAAFdBAAAAAFeAQAAAAFfgAAAAAERBAAA4gEAIAcAAPsBACBUAQAAAAFZAAAAewJcBAAAAAFdBAAAAAFzQAAAAAF0AQAAAAF1AQAAAAF2AQAAAAF3gAAAAAF4AQAAAAF5AQAAAAF7CAAAAAF8AgAAAAF9AgAAAAF-QAAAAAECAAAAAQAgFQAAiAIAIAMAAAALACAVAACIAgAgFgAAjAIAIBMAAAALACAEAADHAQAgBwAA7wEAIA4AAIwCACBUAQCtAQAhWQAAwwF7IlwEALIBACFdBACyAQAhc0AAsAEAIXQBAK0BACF1AQCtAQAhdgEAswEAIXeAAAAAAXgBAK0BACF5AQCtAQAhewgAxAEAIXwCAMUBACF9AgDFAQAhfkAAsAEAIREEAADHAQAgBwAA7wEAIFQBAK0BACFZAADDAXsiXAQAsgEAIV0EALIBACFzQACwAQAhdAEArQEAIXUBAK0BACF2AQCzAQAhd4AAAAABeAEArQEAIXkBAK0BACF7CADEAQAhfAIAxQEAIX0CAMUBACF-QACwAQAhBAQGAgYABgcKAwgSBQEDAAECBQ0BBgAEAQUOAAEDAAEDBBMABxQACBUAAAAABQYACxsADBwADR0ADh4ADwAAAAAABQYACxsADBwADR0ADh4ADwEDAAEBAwABAwYAFB0AFR4AFgAAAAMGABQdABUeABYAAAMGABsdABweAB0AAAADBgAbHQAcHgAdAQMAAQEDAAEFBgAiGwAjHAAkHQAlHgAmAAAAAAAFBgAiGwAjHAAkHQAlHgAmCQIBChYBCxcBDBgBDRkBDxsBEB0HER4IEiABEyIHFCMJFyQBGCUBGSYHHykKICoQISsCIiwCIy0CJC4CJS8CJjECJzMHKDQRKTYCKjgHKzkSLDoCLTsCLjwHLz8TMEAXMUEDMkIDM0MDNEQDNUUDNkcDN0kHOEoYOUwDOk4HO08ZPFADPVEDPlIHP1UaQFYeQVcFQlgFQ1kFRFoFRVsFRl0FR18HSGAfSWIFSmQHS2UgTGYFTWcFTmgHT2shUGwn"
};
async function decodeBase64AsWasm(wasmBase64) {
  const { Buffer: Buffer2 } = await import("buffer");
  const wasmArray = Buffer2.from(wasmBase64, "base64");
  return new WebAssembly.Module(wasmArray);
}
config.compilerWasm = {
  getRuntime: async () => await import("@prisma/client/runtime/query_compiler_fast_bg.postgresql.mjs"),
  getQueryCompilerWasmModule: async () => {
    const { wasm } = await import("@prisma/client/runtime/query_compiler_fast_bg.postgresql.wasm-base64.mjs");
    return await decodeBase64AsWasm(wasm);
  },
  importName: "./query_compiler_fast_bg.js"
};
function getPrismaClientClass() {
  return runtime.getPrismaClient(config);
}

// src/generated/prisma/internal/prismaNamespace.ts
import * as runtime2 from "@prisma/client/runtime/client";
var getExtensionContext = runtime2.Extensions.getExtensionContext;
var NullTypes2 = {
  DbNull: runtime2.NullTypes.DbNull,
  JsonNull: runtime2.NullTypes.JsonNull,
  AnyNull: runtime2.NullTypes.AnyNull
};
var TransactionIsolationLevel = runtime2.makeStrictEnum({
  ReadUncommitted: "ReadUncommitted",
  ReadCommitted: "ReadCommitted",
  RepeatableRead: "RepeatableRead",
  Serializable: "Serializable"
});
var defineExtension = runtime2.Extensions.defineExtension;

// src/generated/prisma/enums.ts
var enums_exports = {};
__export(enums_exports, {
  JobStatus: () => JobStatus,
  JobType: () => JobType,
  VideoStatus: () => VideoStatus
});
var VideoStatus = {
  UPLOADING: "UPLOADING",
  QUEUED: "QUEUED",
  PROCESSING: "PROCESSING",
  COMPLETED: "COMPLETED",
  FAILED: "FAILED"
};
var JobType = {
  TRANSCODE: "TRANSCODE",
  THUMBNAIL: "THUMBNAIL",
  METADATA_EXTRACT: "METADATA_EXTRACT"
};
var JobStatus = {
  PENDING: "PENDING",
  RUNNING: "RUNNING",
  COMPLETED: "COMPLETED",
  FAILED: "FAILED"
};

// src/generated/prisma/client.ts
var import_meta = {};
globalThis["__dirname"] = path.dirname(fileURLToPath(import_meta.url));
var PrismaClient = getPrismaClientClass();

// src/lib/prisma.ts
var pool = new Pool({ connectionString: process.env.DATABASE_URL });
var adapter = new PrismaPg(pool);
var globalForPrisma = globalThis;
var _a;
var prisma = (_a = globalForPrisma.prisma) != null ? _a : new PrismaClient({
  adapter,
  log: process.env.NODE_ENV === "development" ? ["query", "error", "warn"] : ["error"]
});
if (process.env.NODE_ENV !== "production") {
  globalForPrisma.prisma = prisma;
}

// src/lib/ffmpeg.ts
import { spawn } from "child_process";
async function extractMetadata(filePath) {
  return new Promise((resolve, reject) => {
    const args = [
      "-v",
      "quiet",
      "-print_format",
      "json",
      "-show_format",
      "-show_streams",
      filePath
    ];
    const ffprobe = spawn("ffprobe", args);
    let stdout = "";
    let stderr = "";
    ffprobe.stdout.on("data", (data) => {
      stdout += data.toString();
    });
    ffprobe.stderr.on("data", (data) => {
      stderr += data.toString();
    });
    ffprobe.on("close", (code) => {
      var _a2, _b, _c;
      if (code !== 0) {
        return reject(new Error(`ffprobe exited with code ${code}: ${stderr}`));
      }
      try {
        const parsed = JSON.parse(stdout);
        const videoStream = (_a2 = parsed.streams) == null ? void 0 : _a2.find(
          (s) => s.codec_type === "video"
        );
        resolve({
          duration: ((_b = parsed.format) == null ? void 0 : _b.duration) ? parseFloat(parsed.format.duration) : void 0,
          width: videoStream == null ? void 0 : videoStream.width,
          height: videoStream == null ? void 0 : videoStream.height,
          format: (_c = parsed.format) == null ? void 0 : _c.format_name,
          raw: parsed
        });
      } catch (err) {
        reject(new Error("Failed to parse ffprobe output"));
      }
    });
  });
}
async function transcodeToWebM(inputPath, outputPath, totalDurationSecs, onProgress) {
  return new Promise((resolve, reject) => {
    const args = [
      "-y",
      // Overwrite output files
      "-i",
      inputPath,
      "-c:v",
      "libvpx-vp9",
      "-crf",
      "30",
      "-b:v",
      "0",
      "-c:a",
      "libopus",
      "-f",
      "webm",
      outputPath
    ];
    const ffmpeg = spawn("ffmpeg", args);
    let stderr = "";
    ffmpeg.stderr.on("data", (data) => {
      const output = data.toString();
      stderr += output;
      const timeMatch = output.match(/time=(\d{2}):(\d{2}):(\d{2}\.\d{2})/);
      if (timeMatch && totalDurationSecs > 0) {
        const hours = parseInt(timeMatch[1], 10);
        const minutes = parseInt(timeMatch[2], 10);
        const seconds = parseFloat(timeMatch[3]);
        const currentSecs = hours * 3600 + minutes * 60 + seconds;
        const percent = Math.min(100, Math.round(currentSecs / totalDurationSecs * 100));
        onProgress(percent);
      }
    });
    ffmpeg.on("close", (code) => {
      if (code === 0) {
        onProgress(100);
        resolve();
      } else {
        reject(new Error(`ffmpeg exited with code ${code}. Stderr: ${stderr}`));
      }
    });
  });
}

// src/worker/index.ts
var connection = new Redis(process.env.REDIS_URL || "redis://localhost:6379", {
  maxRetriesPerRequest: null
});
var DATA_PATH = process.env.DATA_PATH || "/app/data";
async function processVideo(job) {
  const { videoId, filePath } = job.data;
  console.log(`[Worker] Started processing video ${videoId} at ${filePath}`);
  const filename = path2.basename(filePath);
  const processingPath = path2.join(DATA_PATH, "processing", filename);
  await rename(filePath, processingPath);
  await prisma.video.update({
    where: { id: videoId },
    data: { status: "PROCESSING" }
  });
  const jobHistory = await prisma.jobHistory.findFirst({
    where: { videoId, status: "PENDING", jobType: "TRANSCODE" },
    orderBy: { startedAt: "desc" }
  });
  if (jobHistory) {
    await prisma.jobHistory.update({
      where: { id: jobHistory.id },
      data: { status: "RUNNING" }
    });
  }
  try {
    console.log(`[Worker] Extracting metadata for ${videoId}`);
    const metadata = await extractMetadata(processingPath);
    await prisma.video.update({
      where: { id: videoId },
      data: {
        duration: metadata.duration,
        width: metadata.width,
        height: metadata.height,
        originalMetadata: metadata.raw
      }
    });
    if (!metadata.duration) {
      throw new Error("Could not determine video duration");
    }
    console.log(`[Worker] Transcoding to WebM for ${videoId}`);
    const outputFilename = `${path2.parse(filename).name}.webm`;
    const outputPath = path2.join(DATA_PATH, "processed", outputFilename);
    await transcodeToWebM(processingPath, outputPath, metadata.duration, async (percent) => {
      await job.updateProgress(percent);
    });
    console.log(`[Worker] Moving files to vault for ${videoId}`);
    const finalOriginalPath = path2.join(DATA_PATH, "vault", filename);
    const finalWebmPath = path2.join(DATA_PATH, "vault", outputFilename);
    await rename(processingPath, finalOriginalPath);
    await rename(outputPath, finalWebmPath);
    const processedStats = await stat(finalWebmPath);
    await prisma.video.update({
      where: { id: videoId },
      data: {
        status: "COMPLETED",
        originalPath: finalOriginalPath,
        processedPath: finalWebmPath,
        processedSize: processedStats.size
      }
    });
    if (jobHistory) {
      await prisma.jobHistory.update({
        where: { id: jobHistory.id },
        data: {
          status: "COMPLETED",
          completedAt: /* @__PURE__ */ new Date(),
          processedSize: processedStats.size
        }
      });
    }
    console.log(`[Worker] Finished processing video ${videoId}`);
  } catch (error) {
    console.error(`[Worker] Error processing video ${videoId}:`, error);
    await prisma.video.update({
      where: { id: videoId },
      data: { status: "FAILED" }
    });
    if (jobHistory) {
      await prisma.jobHistory.update({
        where: { id: jobHistory.id },
        data: {
          status: "FAILED",
          completedAt: /* @__PURE__ */ new Date(),
          errorMessage: error instanceof Error ? error.message : "Unknown error"
        }
      });
    }
    throw error;
  }
}
var worker = new Worker("video-jobs", processVideo, { connection });
worker.on("completed", (job) => {
  console.log(`[BullMQ] Job ${job.id} completed successfully`);
});
worker.on("failed", (job, err) => {
  console.log(`[BullMQ] Job ${job == null ? void 0 : job.id} failed:`, err);
});
console.log("[Worker] BullMQ Worker started successfully");
