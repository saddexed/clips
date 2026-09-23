import { existsSync } from "node:fs";
import { rm } from "node:fs/promises";
import path from "node:path";
import "../src/lib/database";
import { database, getSetting } from "../src/lib/database";

const root = process.cwd();
const candidates = [
  "prisma",
  "docker-compose.yml",
  "docker-compose.yaml",
  "docker-compose.postgres.yml",
  "docker-compose.postgres.yaml",
  "Dockerfile.postgres",
].map((entry) => path.join(root, entry));

const existing = candidates.filter(existsSync);
const hasSqliteSchema = Boolean(
  database
    .query<{ name: string }, []>(
      "SELECT name FROM sqlite_master WHERE type = 'table' AND name = 'videos'",
    )
    .get(),
);

if (!hasSqliteSchema || getSetting("legacy_infrastructure_migrated") !== true) {
  throw new Error("Refusing to remove legacy infrastructure before SQLite migration");
}

if (existing.length === 0) {
  console.log("No PostgreSQL, Prisma, or Docker migration files were found.");
  process.exit(0);
}

if (!process.argv.includes("--confirm")) {
  console.log("Legacy infrastructure detected:");
  for (const entry of existing) console.log(`- ${path.relative(root, entry)}`);
  console.log("Re-run with --confirm to remove only these known legacy files.");
  process.exit(0);
}

for (const entry of existing) {
  await rm(entry, { recursive: true, force: true });
  console.log(`Removed ${path.relative(root, entry)}`);
}
