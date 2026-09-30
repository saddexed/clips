// Decimal megabytes leave room below Cloudflare's 100 MB request-body limit.
export const CHUNK_SIZE = 90_000_000;
export const MAX_UPLOAD_BYTES = 500 * 1024 * 1024;
