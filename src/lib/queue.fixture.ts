import assert from "node:assert/strict";
import { createVideo } from "./database";
import { hashBytes } from "./hash";
import {
  claimNextJob, completeQueueJob, enqueueVideoJob, getQueueJob, getQueueStats,
  isJobPaused, releasePausedJob, setJobPaused, setQueuePaused,
} from "./queue";

function enqueue() {
  const videoId = crypto.randomUUID();
  const now = new Date();
  createVideo({
    id: videoId, filename: `${videoId}.mp4`, title: videoId, status: "QUEUED",
    originalSha256: hashBytes(new TextEncoder().encode(videoId)),
    createdAt: now, uploadedAt: now, isHidden: false,
  });
  return enqueueVideoJob({ videoId, filePath: `.uploads/${videoId}.mp4` });
}

if (process.argv[2] === "individual") {
  const first = enqueue();
  const second = enqueue();
  const third = enqueue();
  assert.equal(setJobPaused(first.id, true)?.paused, true);
  assert.equal(claimNextJob()?.id, second.id);
  assert.equal(setJobPaused(second.id, true)?.paused, true);
  assert.equal(isJobPaused(second.id), true);
  releasePausedJob(second.id);
  assert.equal(getQueueJob(second.id)?.status, "wait");
  assert.equal(getQueueJob(second.id)?.attempts, 0);
  assert.equal(claimNextJob()?.id, third.id);
  completeQueueJob(third.id);
  assert.equal(setJobPaused(first.id, false)?.paused, false);
  assert.equal(setJobPaused(second.id, false)?.paused, false);
  assert.equal(claimNextJob()?.id, first.id);
  completeQueueJob(first.id);
  assert.equal(claimNextJob()?.id, second.id);
  completeQueueJob(second.id);
} else if (process.argv[2] === "global") {
  setQueuePaused(true);
  const first = enqueue();
  const second = enqueue();
  assert.equal(getQueueStats().counts.paused, 2);
  assert.equal(getQueueStats().counts.wait, 0);
  assert.equal(claimNextJob(), null);
  assert.equal(setJobPaused(second.id, false)?.pauseMode, "run");
  assert.equal(claimNextJob()?.id, second.id);
  setQueuePaused(true);
  assert.equal(isJobPaused(second.id), true);
  releasePausedJob(second.id);
  assert.equal(claimNextJob(), null);
  assert.equal(setJobPaused(first.id, true)?.pauseMode, "paused");
  setQueuePaused(false);
  assert.equal(getQueueJob(first.id)?.paused, true);
  assert.equal(claimNextJob()?.id, second.id);
  completeQueueJob(second.id);
  assert.equal(setJobPaused(first.id, false)?.paused, false);
  assert.equal(claimNextJob()?.id, first.id);
  completeQueueJob(first.id);
} else {
  throw new Error("Unknown queue test scenario");
}
