import { describe, expect, test } from "bun:test";
import { DEFAULT_FFMPEG_PARAMETERS } from "./settings";
import { parseFfmpegParameters } from "./ffmpeg-parameters";

describe("ffmpeg parameter validation", () => {
  test("accepts shipped defaults and an optional executable", () => {
    expect(parseFfmpegParameters(DEFAULT_FFMPEG_PARAMETERS)).toContain("-c:v");
    expect(parseFfmpegParameters(`ffmpeg ${DEFAULT_FFMPEG_PARAMETERS}`)).toContain("libvpx-vp9");
  });

  test("rejects managed arguments, shell control, and malformed pairs", () => {
    expect(() => parseFfmpegParameters("-i input.mkv")).toThrow();
    expect(() => parseFfmpegParameters("-c:v libvpx-vp9 -y")).toThrow();
    expect(() => parseFfmpegParameters("-c:v libvpx-vp9; whoami")).toThrow();
    expect(() => parseFfmpegParameters("-c:v")).toThrow();
  });
});
