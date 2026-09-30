import assert from "node:assert/strict";
import { getDefaultTags, getDefaultVisibilityEnabled, getFfmpegParameters, resetUploadDefaults, saveUploadDefaults } from "./settings";

const saved = await saveUploadDefaults({
  tags: [" Gameplay ", "boss_fight"],
  visibilityEnabled: true,
  ffmpegParameters: "-c:v libvpx-vp9 -crf 30",
});
assert.deepEqual(saved.tags, ["gameplay", "boss fight"]);
assert.equal(saved.visibilityEnabled, true);
assert.equal(saved.ffmpegParameters, "-c:v libvpx-vp9 -crf 30");
assert.deepEqual(await getDefaultTags(), ["gameplay", "boss fight"]);
assert.equal(await getDefaultVisibilityEnabled(), true);
assert.equal(getFfmpegParameters(), "-c:v libvpx-vp9 -crf 30");

const reset = await resetUploadDefaults();
assert.deepEqual(reset.tags, []);
assert.equal(reset.visibilityEnabled, false);
assert.equal(reset.ffmpegParameters.length > 0, true);
assert.deepEqual(await getDefaultTags(), []);
assert.equal(await getDefaultVisibilityEnabled(), false);
assert.equal(getFfmpegParameters(), reset.ffmpegParameters);
