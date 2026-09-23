type MetadataValue = Record<string, unknown> | null | undefined;

function asRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

function rawMetadata(metadata: MetadataValue): Record<string, unknown> | null {
  const record = asRecord(metadata);
  return asRecord(record?.raw) || record;
}

function formatName(metadata: MetadataValue): string | null {
  const raw = rawMetadata(metadata);
  const format = asRecord(raw?.format);
  const name = format?.format_name ?? (asRecord(metadata)?.format as unknown);
  return typeof name === "string" ? name : null;
}

function videoCodec(metadata: MetadataValue): string | null {
  const raw = rawMetadata(metadata);
  const streams = Array.isArray(raw?.streams) ? raw.streams : [];
  const stream = streams
    .map(asRecord)
    .find((item) => item?.codec_type === "video");
  const codec = stream?.codec_name ?? (asRecord(metadata)?.videoCodec as unknown);
  return typeof codec === "string" && codec.trim() ? codec.toLowerCase() : null;
}

export function mediaContainer(metadata: MetadataValue): string | null {
  const format = formatName(metadata);
  const names = format?.toLowerCase().split(",").map((name) => name.trim()) || [];
  if (format) {
    if (names.includes("webm")) return "webm";
    if (names.includes("matroska")) return "mkv";
    if (names.some((name) => ["mov", "mp4", "m4a", "3gp", "3g2", "mj2"].includes(name))) {
      return "mp4";
    }
    const known = names.find((name) => name === "avi");
    if (known) return known;
  }
  const record = asRecord(metadata);
  const filename = record?.originalFilename;
  if (typeof filename === "string") {
    const extension = filename.split(".").pop()?.toLowerCase();
    if (extension === "mkv") return "mkv";
    if (extension === "webm") return "webm";
    if (extension === "mp4" || extension === "m4v") return "mp4";
    if (extension) return extension;
  }
  return names.find(Boolean) || null;
}

export function mediaTypeLabel(metadata: MetadataValue): string {
  const codec = videoCodec(metadata);
  const container = mediaContainer(metadata) || "unknown";
  return `${codec === "hevc" ? "x265" : codec || "unknown"}/${container}`;
}

export function isAdoptableWebm(metadata: MetadataValue): boolean {
  const codec = videoCodec(metadata);
  const format = formatName(metadata)?.toLowerCase().split(",").map((name) => name.trim());
  return format?.includes("webm") === true && (codec === "vp9" || codec === "av1");
}

export function metadataCodec(metadata: MetadataValue): string | null {
  return videoCodec(metadata);
}

export function mediaMimeType(
  metadata: MetadataValue,
  extension = "",
  mediaKind: "VIDEO" | "IMAGE" = "VIDEO",
): string {
  const normalizedExtension = extension.toLowerCase().replace(/^\./, "");
  if (mediaKind === "IMAGE") {
    if (normalizedExtension === "png") return "image/png";
    if (normalizedExtension === "gif") return "image/gif";
    if (normalizedExtension === "jpg" || normalizedExtension === "jpeg") {
      return "image/jpeg";
    }
    return "image/webp";
  }

  const container = mediaContainer(metadata);
  if (container === "mp4") return "video/mp4";
  if (container === "mkv") return "video/x-matroska";
  if (container === "avi") return "video/x-msvideo";
  if (normalizedExtension === "mov") return "video/quicktime";
  if (normalizedExtension === "avi") return "video/x-msvideo";
  if (normalizedExtension === "mkv") return "video/x-matroska";
  if (normalizedExtension === "mp4" || normalizedExtension === "m4v") {
    return "video/mp4";
  }
  return "video/webm";
}
