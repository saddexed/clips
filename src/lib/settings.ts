import { getSetting, setSetting } from "@/lib/database";

export const DEFAULT_FFMPEG_PARAMETERS = "-c:v libvpx-vp9 -profile:v 2 -pix_fmt yuv420p10le -deadline good -cpu-used 3 -tile-columns 2 -tile-rows 1 -threads 4 -row-mt 1 -crf 30 -b:v 8M -maxrate 8M -bufsize 16M -c:a libopus -b:a 128k";

function normalizeTags(tags: string[]): string[] {
  return Array.from(
    new Set(
      tags
        .map((tag) => tag.trim().toLowerCase())
        .map((tag) => tag.replace(/_/g, " "))
        .filter(Boolean)
        .map((tag) => tag.replace(/\s+/g, " "))
        .map((tag) => tag.replace(/[^a-z0-9\s-_]/g, ""))
        .filter(Boolean),
    ),
  ).slice(0, 50);
}

export async function getDefaultTags(): Promise<string[]> {
  const value = getSetting("default_tags");
  return Array.isArray(value)
    ? normalizeTags(
        value.filter((item): item is string => typeof item === "string"),
      )
    : [];
}

export async function setDefaultTags(tags: string[]): Promise<string[]> {
  const normalized = normalizeTags(tags);
  setSetting("default_tags", normalized);
  return normalized;
}

export async function getDefaultVisibilityEnabled(): Promise<boolean> {
  return getSetting("default_visibility_enabled") === true;
}

export async function setDefaultVisibilityEnabled(
  enabled: boolean,
): Promise<boolean> {
  setSetting("default_visibility_enabled", Boolean(enabled));
  return Boolean(enabled);
}

export async function getUploadDefaults() {
  const [tags, visibilityEnabled] = await Promise.all([
    getDefaultTags(),
    getDefaultVisibilityEnabled(),
  ]);
  return { tags, visibilityEnabled };
}

export function getFfmpegParameters(): string {
  const value = getSetting("ffmpeg_parameters");
  return typeof value === "string" && value.trim() ? value : DEFAULT_FFMPEG_PARAMETERS;
}

export function setFfmpegParameters(value: string): string {
  setSetting("ffmpeg_parameters", value);
  return value;
}
