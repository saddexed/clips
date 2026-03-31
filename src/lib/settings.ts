import { prisma } from "@/lib/prisma";

const SETTINGS_TABLE_SQL = `
CREATE TABLE IF NOT EXISTS app_settings (
  key TEXT PRIMARY KEY,
  value JSONB NOT NULL,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
)
`;

function normalizeTags(tags: string[]): string[] {
  return Array.from(
    new Set(
      tags
        .map((t) => t.trim().toLowerCase())
        .map((t) => t.replace(/_/g, " "))
        .filter(Boolean)
        .map((t) => t.replace(/\s+/g, " "))
        .map((t) => t.replace(/[^a-z0-9\s-_]/g, ""))
        .filter(Boolean)
    )
  ).slice(0, 50);
}

async function ensureSettingsTable() {
  await prisma.$executeRawUnsafe(SETTINGS_TABLE_SQL);
}

async function getSettingValue(key: string): Promise<unknown | undefined> {
  await ensureSettingsTable();

  const rows = await prisma.$queryRawUnsafe<Array<{ value: unknown }>>(
    `SELECT value FROM app_settings WHERE key = $1 LIMIT 1`,
    key
  );

  return rows[0]?.value;
}

async function setSettingValue(key: string, value: unknown) {
  await ensureSettingsTable();

  await prisma.$executeRawUnsafe(
    `
    INSERT INTO app_settings (key, value, updated_at)
    VALUES ($1, $2::jsonb, now())
    ON CONFLICT (key)
    DO UPDATE SET value = EXCLUDED.value, updated_at = now()
    `,
    key,
    JSON.stringify(value)
  );
}

export async function getDefaultTags(): Promise<string[]> {
  const rawValue = await getSettingValue("default_tags");

  if (!Array.isArray(rawValue)) {
    return [];
  }

  return normalizeTags(rawValue.filter((v): v is string => typeof v === "string"));
}

export async function setDefaultTags(tags: string[]): Promise<string[]> {
  const normalized = normalizeTags(tags);
  await setSettingValue("default_tags", normalized);

  return normalized;
}

export async function getDefaultCommentsEnabled(): Promise<boolean> {
  const rawValue = await getSettingValue("default_comments_enabled");
  return typeof rawValue === "boolean" ? rawValue : false;
}

export async function setDefaultCommentsEnabled(enabled: boolean): Promise<boolean> {
  await setSettingValue("default_comments_enabled", Boolean(enabled));
  return Boolean(enabled);
}

export async function getGlobalCommentsEnabled(): Promise<boolean> {
  const rawValue = await getSettingValue("global_comments_enabled");
  return typeof rawValue === "boolean" ? rawValue : true;
}

export async function setGlobalCommentsEnabled(enabled: boolean): Promise<boolean> {
  await setSettingValue("global_comments_enabled", Boolean(enabled));
  return Boolean(enabled);
}

export async function getDefaultVisibilityEnabled(): Promise<boolean> {
  const rawValue = await getSettingValue("default_visibility_enabled");
  return typeof rawValue === "boolean" ? rawValue : false;
}

export async function setDefaultVisibilityEnabled(enabled: boolean): Promise<boolean> {
  await setSettingValue("default_visibility_enabled", Boolean(enabled));
  return Boolean(enabled);
}

export async function getUploadDefaults() {
  const [tags, commentsEnabled, visibilityEnabled] = await Promise.all([
    getDefaultTags(),
    getDefaultCommentsEnabled(),
    getDefaultVisibilityEnabled(),
  ]);

  return {
    tags,
    commentsEnabled,
    visibilityEnabled,
  };
}
