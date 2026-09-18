import { getSetting, setSetting } from "@/lib/database";

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
