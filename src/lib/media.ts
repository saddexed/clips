type MetadataValue = Record<string, unknown> | null | undefined;

export type NormalizedMediaMetadata = {
  filename: string;
  id: string;
  hash: string;
  contentType: string;
  video_codec?: string;
  audio_codec?: string;
  resolution?: string;
  frame_rate?: number;
  duration?: number;
  size: number;
  bit_rate?: number;
  created_at: string;
  uploaded_at: string;
};

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
  if (typeof name === "string") return name;
  const contentType = asRecord(metadata)?.contentType;
  if (typeof contentType === "string") return contentType.split("/").pop() || null;
  const codecLabel = asRecord(metadata)?.video_codec;
  if (typeof codecLabel === "string") return codecLabel.split("/")[1] || null;
  return null;
}

function videoCodec(metadata: MetadataValue): string | null {
  const raw = rawMetadata(metadata);
  const streams = Array.isArray(raw?.streams) ? raw.streams : [];
  const stream = streams
    .map(asRecord)
    .find((item) => item?.codec_type === "video");
  const normalizedCodec = asRecord(metadata)?.video_codec;
  const codec =
    stream?.codec_name ??
    (asRecord(metadata)?.videoCodec as unknown) ??
    (typeof normalizedCodec === "string" ? normalizedCodec.split("/")[0] : null);
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
  const filename = record?.originalFilename ?? record?.filename;
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
  const normalized = asRecord(metadata)?.video_codec;
  if (typeof normalized === "string" && normalized.includes("/")) {
    return normalized;
  }
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
  const declaredType = asRecord(metadata)?.contentType;
  if (typeof declaredType === "string" && declaredType.includes("/")) {
    return declaredType;
  }
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

function numeric(value: unknown): number | undefined {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string" && value.trim() && Number.isFinite(Number(value))) {
    return Number(value);
  }
  return undefined;
}

function frameRate(value: unknown): number | undefined {
  if (typeof value === "number") return numeric(value);
  if (typeof value !== "string" || !value.trim()) return undefined;
  const [numerator, denominator] = value.split("/").map(Number);
  if (Number.isFinite(numerator) && Number.isFinite(denominator) && denominator) {
    return numerator / denominator;
  }
  return numeric(value);
}

function streamFor(raw: Record<string, unknown> | null, type: string) {
  const streams = Array.isArray(raw?.streams) ? raw.streams : [];
  return streams
    .map(asRecord)
    .find((stream) => stream?.codec_type === type) || null;
}

export function normalizeMediaMetadata(input: {
  id: string;
  filename: string;
  hash: string;
  contentType: string;
  size: number;
  createdAt: Date | string;
  uploadedAt: Date | string;
  raw?: unknown;
  format?: string;
  width?: number;
  height?: number;
  duration?: number;
  videoCodec?: string;
  audioCodec?: string;
  bitRate?: number;
}): NormalizedMediaMetadata {
  const raw = asRecord(input.raw);
  const format = asRecord(raw?.format);
  const video = streamFor(raw, "video");
  const audio = streamFor(raw, "audio");
  const container = mediaContainer(raw) || mediaContainer({ filename: input.filename });
  const rawVideoCodec =
    input.videoCodec || (typeof video?.codec_name === "string" ? video.codec_name : undefined);
  const normalizedVideoCodec = rawVideoCodec
    ? `${rawVideoCodec.toLowerCase() === "hevc" ? "x265" : rawVideoCodec.toLowerCase()}/${container || "unknown"}`
    : undefined;
  const rawAudioCodec =
    input.audioCodec || (typeof audio?.codec_name === "string" ? audio.codec_name : undefined);
  const normalizedAudioCodec = rawAudioCodec
    ? `${rawAudioCodec.toLowerCase()}/${audio?.codec_type === "audio" ? "m4a" : container || "unknown"}`
    : undefined;
  const width = input.width ?? numeric(video?.width);
  const height = input.height ?? numeric(video?.height);
  const duration = input.duration ?? numeric(format?.duration);
  const bitRate = input.bitRate ?? numeric(format?.bit_rate);
  const rate = frameRate(video?.avg_frame_rate ?? video?.r_frame_rate);
  const metadata: NormalizedMediaMetadata = {
    filename: input.filename,
    id: input.id,
    hash: input.hash,
    contentType: input.contentType,
    size: input.size,
    created_at: new Date(input.createdAt).toISOString(),
    uploaded_at: new Date(input.uploadedAt).toISOString(),
  };
  if (normalizedVideoCodec) metadata.video_codec = normalizedVideoCodec;
  if (normalizedAudioCodec) metadata.audio_codec = normalizedAudioCodec;
  if (width && height) metadata.resolution = `${width}x${height}`;
  if (rate !== undefined) metadata.frame_rate = rate;
  if (duration !== undefined) metadata.duration = duration;
  if (bitRate !== undefined) metadata.bit_rate = bitRate;
  return metadata;
}
