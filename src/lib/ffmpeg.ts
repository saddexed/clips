import { spawn } from "node:child_process";

export type VideoMetadata = {
  duration?: number;
  width?: number;
  height?: number;
  format?: string;
  raw: any;
};

/**
 * Extracts metadata from a video file using ffprobe.
 */
export async function extractMetadata(filePath: string): Promise<VideoMetadata> {
  return new Promise((resolve, reject) => {
    const args = [
      "-v", "quiet",
      "-print_format", "json",
      "-show_format",
      "-show_streams",
      filePath,
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
      if (code !== 0) {
        return reject(new Error(`ffprobe exited with code ${code}: ${stderr}`));
      }

      try {
        const parsed = JSON.parse(stdout);
        const videoStream = parsed.streams?.find(
          (s: any) => s.codec_type === "video"
        );

        resolve({
          duration: parsed.format?.duration ? parseFloat(parsed.format.duration) : undefined,
          width: videoStream?.width,
          height: videoStream?.height,
          format: parsed.format?.format_name,
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
  onProgress: (percent: number) => void
): Promise<void> {
  return new Promise((resolve, reject) => {
    const args = [
      "-y", // Overwrite output files
      "-i", inputPath,
      "-c:v", "libvpx-vp9",
      "-crf", "30",
      "-b:v", "0",
      "-c:a", "libopus",
      "-f", "webm",
      outputPath,
    ];

    const ffmpeg = spawn("ffmpeg", args);
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
        
        const percent = Math.min(100, Math.round((currentSecs / totalDurationSecs) * 100));
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


/**
 * Extracts a single physical thumbnail frame at the 1-second mark.
 */
export async function extractThumbnail(inputPath: string, outputPath: string): Promise<void> {
  return new Promise((resolve, reject) => {
    const args = [
      "-y",
      "-i", inputPath,
      "-ss", "00:00:01.000",
      "-vframes", "1",
      outputPath
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
        reject(new Error(`Thumbnail extraction failed with code ${code}. Stderr: ${stderr}`));
      }
    });
  });
}
