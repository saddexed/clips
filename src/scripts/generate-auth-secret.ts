import { existsSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { randomBytes } from "node:crypto";

const envPath = path.resolve(process.cwd(), ".env");
const force = process.argv.includes("--force");
const secret = randomBytes(32).toString("base64url");
const current = existsSync(envPath) ? readFileSync(envPath, "utf8") : "";
const authSecretPattern = /^\s*AUTH_SECRET\s*=\s*(.*?)\s*$/m;
const existing = current.match(authSecretPattern)?.[1]?.trim();

if (existing && !force) {
  console.error("AUTH_SECRET is already configured in .env. Use --force to replace it.");
  process.exit(1);
}

let next: string;
if (authSecretPattern.test(current)) {
  next = current.replace(authSecretPattern, `AUTH_SECRET=${secret}`);
} else {
  const separator = current.length > 0 && !current.endsWith("\n") ? "\n" : "";
  next = `${current}${separator}AUTH_SECRET=${secret}\n`;
}

writeFileSync(envPath, next, { encoding: "utf8", mode: 0o600 });
console.log(`Generated AUTH_SECRET in ${path.relative(process.cwd(), envPath) || ".env"}.`);
