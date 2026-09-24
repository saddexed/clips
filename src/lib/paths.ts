import path from "node:path";

const DEFAULT_DATA_PATH = "./data";
const LEGACY_DATA_PREFIX = /^[/\\]app[/\\]data(?:[/\\]|$)/i;

export function getDataPath(): string {
  const configured = process.env.DATA_PATH?.trim() || DEFAULT_DATA_PATH;
  return path.resolve(process.cwd(), configured);
}

function isWithinDataPath(candidate: string, root = getDataPath()): boolean {
  const relative = path.relative(root, candidate);
  return relative === "" || (!relative.startsWith("..") && !path.isAbsolute(relative));
}

function legacyRelativePath(value: string): string | null {
  if (!LEGACY_DATA_PREFIX.test(value)) return null;
  return value.replace(LEGACY_DATA_PREFIX, "").replace(/^[/\\]+/, "");
}

function normalizeRelativePath(value: string): string {
  const normalized = path.posix.normalize(value.replace(/\\/g, "/"));
  if (normalized === ".." || normalized.startsWith("../")) {
    throw new Error("Media paths must stay inside the configured data directory");
  }
  return normalized.replace(/^\.\//, "");
}

export function toStoredPath(filePath: string): string {
  const legacyPath = legacyRelativePath(filePath);
  if (legacyPath !== null) return normalizeRelativePath(legacyPath);

  const root = getDataPath();
  if (!path.isAbsolute(filePath) && path.isAbsolute(root)) {
    return normalizeRelativePath(filePath);
  }
  const absolute = path.isAbsolute(filePath)
    ? path.resolve(filePath)
    : path.resolve(root, filePath);
  if (!isWithinDataPath(absolute, root)) {
    throw new Error("Media paths must stay inside the configured data directory");
  }
  return path.relative(root, absolute).split(path.sep).join("/");
}

export function normalizeStoredPath(filePath: string | null | undefined): string | null {
  if (!filePath) return null;
  return toStoredPath(filePath);
}

export function resolveStoredPath(filePath: string | null | undefined): string | null {
  if (!filePath) return null;
  const legacyPath = legacyRelativePath(filePath);
  const relativePath = legacyPath ?? filePath.replace(/\\/g, "/");
  const root = getDataPath();
  const absolute = path.resolve(root, relativePath);
  if (!isWithinDataPath(absolute, root)) {
    throw new Error("Media paths must stay inside the configured data directory");
  }
  return absolute;
}

export type ArtifactKind = "original" | "converted";

function extension(value: string | null | undefined, fallback: string) {
  const match = value?.match(/\.([a-z0-9]+)$/i);
  return match ? `.${match[1].toLowerCase()}` : fallback;
}

/** Canonical active storage. The separate folders keep original and converted
 * artifacts addressable even when both use the same container extension. */
export function vaultArtifactPath(
  id: string,
  filename: string,
  kind: ArtifactKind,
  mediaType: "VIDEO" | "IMAGE" = "VIDEO",
) {
  const fallback = mediaType === "IMAGE" ? ".webp" : ".webm";
  const suffix = kind === "original" ? extension(filename, fallback) : fallback;
  return path.join(getDataPath(), "vault", kind, `${id}${suffix}`);
}
