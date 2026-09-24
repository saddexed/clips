import { spawn } from "node:child_process";
import { getFfmpegParameters } from "./settings";
import { parseFfmpegParameters } from "./ffmpeg-parameters";

export type VideoMetadata = {
  duration?: number;
  width?: number;
  height?: number;
  format?: string;
  container?: string;
  creation_time?: string;
  videoCodec?: string;
  audioBitrate?: number;
  raw: any;
};

let activeFfmpegProcess: ReturnType<typeof spawn> | null = null;

export function killActiveFfmpegProcess(): boolean {
  if (!activeFfmpegProcess || activeFfmpegProcess.killed) {
    return false;
  }

  return activeFfmpegProcess.kill("SIGKILL");
}

/**
 * Extracts metadata from a video file using ffprobe.
 */
export async function extractMetadata(
  filePath: string,
): Promise<VideoMetadata> {
  return new Promise((resolve, reject) => {
    const args = [
      "-v",
      "quiet",
      "-print_format",
      "json",
      "-show_format",
      "-show_streams",
      filePath,
    ];

    const ffprobe = spawn("ffprobe", args);

    ffprobe.once("error", reject);

    let stdout = "";
    let stderr = "";

    ffprobe.stdout.on("data", (data) => {
      stdout += data.toString();
    });

    ffprobe.stderr.on("data", (data) => {
      stderr += data.toString();
    });

    ffprobe.on("close", (code) => {
      if (code !== 0) {
        return reject(new Error(`ffprobe exited with code ${code}: ${stderr}`));
      }

      try {
        const parsed = JSON.parse(stdout);
        const videoStream = parsed.streams?.find(
          (s: any) => s.codec_type === "video",
        );
        const audioStream = parsed.streams?.find(
          (s: any) => s.codec_type === "audio",
        );

        const parsedAudioBitrate = audioStream?.bit_rate
          ? parseInt(audioStream.bit_rate, 10)
          : parsed.format?.bit_rate
            ? parseInt(parsed.format.bit_rate, 10)
            : undefined;

        const possibleDates: (string | undefined)[] = [
          parsed.format?.tags?.creation_time,
          videoStream?.tags?.creation_time,
          ...(parsed.streams?.map((s: any) => s.tags?.creation_time) || []),
        ];

        let oldestCreationTime: string | undefined;
        let oldestTimeMs = Infinity;

        for (const d of possibleDates) {
          if (!d) continue;
          const timeMs = new Date(d).getTime();
          // Filter out invalid dates and pick the oldest one
          if (!isNaN(timeMs) && timeMs > 0 && timeMs < oldestTimeMs) {
            oldestTimeMs = timeMs;
            oldestCreationTime = d;
          }
        }

        const formatName =
          typeof parsed.format?.format_name === "string"
            ? parsed.format.format_name
            : undefined;

        resolve({
          duration: parsed.format?.duration
            ? parseFloat(parsed.format.duration)
            : undefined,
          width: videoStream?.width,
          height: videoStream?.height,
          format: formatName,
          container: formatName
            ?.split(",")
            .map((name: string) => name.trim().toLowerCase())
            .find((name: string) => name === "webm") ||
            formatName?.split(",")[0]?.trim().toLowerCase(),
          creation_time: oldestCreationTime,
          videoCodec: videoStream?.codec_name,
          audioBitrate: Number.isFinite(parsedAudioBitrate)
            ? parsedAudioBitrate
            : undefined,
          raw: parsed,
        });
      } catch (err) {
        reject(new Error("Failed to parse ffprobe output"));
      }
    });
  });
}

/**
 * Transcodes a video file to WebM (VP9/Opus) using ffmpeg.
 * Fires the onProgress callback periodically with the current percentage (0-100).
 */
export async function transcodeToWebM(
  inputPath: string,
  outputPath: string,
  totalDurationSecs: number,
  onProgress: (percent: number) => void,
  sourceAudioBitrate?: number,
): Promise<void> {
  return new Promise((resolve, reject) => {
    const args = [
      "-y", // Overwrite output files
      "-i",
      inputPath,
      ...parseFfmpegParameters(getFfmpegParameters()),
      "-f",
      "webm",
      outputPath,
    ];

    const ffmpeg = spawn("ffmpeg", args);
    activeFfmpegProcess = ffmpeg;
    let stderr = "";

    // ffmpeg logs progress to stderr
    ffmpeg.stderr.on("data", (data) => {
      const output = data.toString();
      stderr += output;

      // Parse time=00:00:05.23 from stderr to calculate progress
      const timeMatch = output.match(/time=(\d{2}):(\d{2}):(\d{2}\.\d{2})/);
      if (timeMatch && totalDurationSecs > 0) {
        const hours = parseInt(timeMatch[1], 10);
        const minutes = parseInt(timeMatch[2], 10);
        const seconds = parseFloat(timeMatch[3]);
        const currentSecs = hours * 3600 + minutes * 60 + seconds;

        const percent = Math.min(
          100,
          Math.round((currentSecs / totalDurationSecs) * 100),
        );
        onProgress(percent);
      }
    });

    ffmpeg.on("close", (code) => {
      if (activeFfmpegProcess === ffmpeg) {
        activeFfmpegProcess = null;
      }

      if (code === 0) {
        onProgress(100);
        resolve();
      } else {
        reject(new Error(`ffmpeg exited with code ${code}. Stderr: ${stderr}`));
      }
    });

    ffmpeg.on("error", (err) => {
      if (activeFfmpegProcess === ffmpeg) {
        activeFfmpegProcess = null;
      }
      reject(err);
    });
  });
}

/**
 * Extracts a single physical thumbnail frame at the very first frame (0-second mark).
 */
export async function extractThumbnail(
  inputPath: string,
  outputPath: string,
): Promise<void> {
  return new Promise((resolve, reject) => {
    const args = [
      "-y",
      "-i",
      inputPath,
      "-ss",
      "00:00:00.000",
      "-vframes",
      "1",
      "-c:v",
      "libwebp",
      "-q:v",
      "90",
      "-compression_level",
      "6",
      "-loglevel",
      "error",
      outputPath,
    ];

    const ffmpeg = spawn("ffmpeg", args);
    let stderr = "";

    ffmpeg.stderr.on("data", (data) => {
      stderr += data.toString();
    });

    ffmpeg.on("close", (code) => {
      if (code === 0) {
        resolve();
      } else {
        reject(
          new Error(
            `Thumbnail extraction failed with code ${code}. Stderr: ${stderr}`,
          ),
        );
      }
    });
  });
}
