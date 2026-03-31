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
        .filter(Boolean)
        .map((t) => t.replace(/\s+/g, "-"))
        .map((t) => t.replace(/[^a-z0-9-_]/g, ""))
        .filter(Boolean)
    )
  ).slice(0, 50);
}

async function ensureSettingsTable() {
  await prisma.$executeRawUnsafe(SETTINGS_TABLE_SQL);
}

export async function getDefaultTags(): Promise<string[]> {
  await ensureSettingsTable();

  const rows = await prisma.$queryRawUnsafe<Array<{ value: unknown }>>(
    `SELECT value FROM app_settings WHERE key = 'default_tags' LIMIT 1`
  );

  const rawValue = rows[0]?.value;

  if (!Array.isArray(rawValue)) {
    return [];
  }

  return normalizeTags(rawValue.filter((v): v is string => typeof v === "string"));
}

export async function setDefaultTags(tags: string[]): Promise<string[]> {
  await ensureSettingsTable();

  const normalized = normalizeTags(tags);
  const jsonValue = JSON.stringify(normalized);

  await prisma.$executeRawUnsafe(
    `
    INSERT INTO app_settings (key, value, updated_at)
    VALUES ('default_tags', $1::jsonb, now())
    ON CONFLICT (key)
    DO UPDATE SET value = EXCLUDED.value, updated_at = now()
    `,
    jsonValue
  );

  return normalized;
}
