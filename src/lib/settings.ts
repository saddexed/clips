import { database, getSetting, setSetting } from "@/lib/database";

export const DEFAULT_FFMPEG_PARAMETERS = "-c:v libvpx-vp9 -profile:v 2 -pix_fmt yuv420p10le -deadline good -cpu-used 3 -tile-columns 2 -tile-rows 1 -threads 4 -row-mt 1 -crf 30 -b:v 8M -maxrate 8M -bufsize 16M -c:a libopus -b:a 128k";

export type UploadDefaults = {
  tags: string[];
  visibilityEnabled: boolean;
  ffmpegParameters: string;
};

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

export async function saveUploadDefaults(input: { tags: string[]; visibilityEnabled: boolean; ffmpegParameters: string }): Promise<UploadDefaults> {
  const tags = normalizeTags(input.tags);
  const visibilityEnabled = Boolean(input.visibilityEnabled);
  const ffmpegParameters = input.ffmpegParameters.trim();
  database.transaction(() => {
    setSetting("default_tags", tags);
    setSetting("default_visibility_enabled", visibilityEnabled);
    setSetting("ffmpeg_parameters", ffmpegParameters);
  })();
  return { tags: await getDefaultTags(), visibilityEnabled: await getDefaultVisibilityEnabled(), ffmpegParameters: getFfmpegParameters() };
}

export async function resetUploadDefaults(): Promise<UploadDefaults> {
  database.transaction(() => {
    setSetting("default_tags", []);
    setSetting("default_visibility_enabled", false);
    setSetting("ffmpeg_parameters", DEFAULT_FFMPEG_PARAMETERS);
  })();
  return { tags: await getDefaultTags(), visibilityEnabled: await getDefaultVisibilityEnabled(), ffmpegParameters: getFfmpegParameters() };
}

export function getFfmpegParameters(): string {
  const value = getSetting("ffmpeg_parameters");
  return typeof value === "string" && value.trim() ? value : DEFAULT_FFMPEG_PARAMETERS;
}

export function setFfmpegParameters(value: string): string {
  setSetting("ffmpeg_parameters", value);
  return value;
}
