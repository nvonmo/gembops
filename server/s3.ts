import { S3Client, PutObjectCommand, GetObjectCommand, DeleteObjectCommand } from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import type { S3ClientConfig } from "@aws-sdk/client-s3";
import { NodeHttpHandler } from "@smithy/node-http-handler";

function getPositiveIntEnv(name: string, fallback: number): number {
  const raw = process.env[name];
  if (!raw) return fallback;
  const parsed = Number(raw);
  if (!Number.isFinite(parsed) || parsed <= 0) return fallback;
  return Math.trunc(parsed);
}

const S3_CONNECT_TIMEOUT_MS = getPositiveIntEnv("S3_CONNECT_TIMEOUT_MS", 15000);
const S3_REQUEST_TIMEOUT_MS = getPositiveIntEnv("S3_REQUEST_TIMEOUT_MS", 45000);
const S3_PUT_OBJECT_TIMEOUT_MS = getPositiveIntEnv("S3_PUT_OBJECT_TIMEOUT_MS", 30000);
const S3_MAX_ATTEMPTS = getPositiveIntEnv("S3_MAX_ATTEMPTS", 3);
const S3_UPLOAD_RETRIES = getPositiveIntEnv("S3_UPLOAD_RETRIES", 3);
const S3_RETRY_BASE_DELAY_MS = getPositiveIntEnv("S3_RETRY_BASE_DELAY_MS", 500);
const S3_UPLOAD_WARN_MS = getPositiveIntEnv("S3_UPLOAD_WARN_MS", 5000);

// S3 Configuration from environment variables
const s3Config: S3ClientConfig = {
  region: process.env.S3_REGION || "us-east-1",
  credentials: process.env.S3_ACCESS_KEY_ID && process.env.S3_SECRET_ACCESS_KEY
    ? {
        accessKeyId: process.env.S3_ACCESS_KEY_ID,
        secretAccessKey: process.env.S3_SECRET_ACCESS_KEY,
      }
    : undefined,
  endpoint: process.env.S3_ENDPOINT, // For S3-compatible services (e.g., DigitalOcean Spaces, Railway S3)
  forcePathStyle: process.env.S3_FORCE_PATH_STYLE === "true", // Required for some S3-compatible services
  maxAttempts: S3_MAX_ATTEMPTS,
  requestHandler: new NodeHttpHandler({
    connectionTimeout: S3_CONNECT_TIMEOUT_MS,
    requestTimeout: S3_REQUEST_TIMEOUT_MS,
  }),
};

export const s3Client = new S3Client(s3Config);
export const S3_BUCKET = (process.env.S3_BUCKET || "").trim();
export const S3_PUBLIC_URL = (process.env.S3_PUBLIC_URL || "").trim().replace(/\s+/g, ""); // Public URL base, no newlines/spaces

// Check if S3 is configured
export const isS3Configured = () => {
  return !!(
    S3_BUCKET &&
    (process.env.S3_ACCESS_KEY_ID || process.env.S3_ENDPOINT) // Either AWS credentials or endpoint-based (Railway S3)
  );
};

/**
 * Upload a file to S3
 */
export async function uploadToS3(
  key: string,
  body: Buffer,
  contentType: string
): Promise<string> {
  if (!isS3Configured()) {
    throw new Error("S3 is not configured. Set S3_BUCKET and S3_ACCESS_KEY_ID/S3_SECRET_ACCESS_KEY or S3_ENDPOINT");
  }

  let lastError: unknown = null;
  for (let attempt = 1; attempt <= S3_UPLOAD_RETRIES; attempt++) {
    const startedAt = Date.now();
    try {
      // Do not set ACL when bucket has "Object ownership: Bucket owner enforced" (ACLs disabled).
      // Public read is handled by the bucket policy instead.
      const command = new PutObjectCommand({
        Bucket: S3_BUCKET,
        Key: key,
        Body: body,
        ContentType: contentType,
        CacheControl: "public, max-age=31536000", // 1 year – images rarely change
      });
      await withAbortTimeout(
        (abortSignal) => s3Client.send(command, { abortSignal }),
        S3_PUT_OBJECT_TIMEOUT_MS,
        `S3 upload timeout after ${S3_PUT_OBJECT_TIMEOUT_MS}ms`
      );
      const elapsed = Date.now() - startedAt;
      if (elapsed >= S3_UPLOAD_WARN_MS) {
        console.warn("[S3] Slow upload:", { key, elapsedMs: elapsed, attempt });
      } else {
        console.log("[S3] Uploaded:", key, `(${elapsed}ms)`, `attempt=${attempt}`);
      }
      lastError = null;
      break;
    } catch (error) {
      lastError = error;
      const retryable = isRetryableS3Error(error);
      console.error("[S3] Upload failed:", {
        key,
        contentType,
        sizeBytes: body.length,
        attempt,
        maxAttempts: S3_UPLOAD_RETRIES,
        retryable,
        elapsedMs: Date.now() - startedAt,
        message: (error as Error)?.message || String(error),
      });
      if (!retryable || attempt >= S3_UPLOAD_RETRIES) {
        throw error;
      }
      await sleep(backoffDelayMs(attempt));
    }
  }
  if (lastError) throw lastError;

  // Return public URL (ensure no newlines)
  if (S3_PUBLIC_URL) {
    const base = S3_PUBLIC_URL.replace(/\s+/g, "").replace(/\/+$/, "");
    return `${base}/${key}`.replace(/\s+/g, "");
  }

  // Fallback: construct URL from bucket and region
  const region = s3Config.region || "us-east-1";
  return `https://${S3_BUCKET}.s3.${region}.amazonaws.com/${key}`;
}

/**
 * Get a signed URL for a private file (if needed)
 */
export async function getSignedUrlForFile(key: string, expiresIn = 3600): Promise<string> {
  const command = new GetObjectCommand({
    Bucket: S3_BUCKET,
    Key: key,
  });

  return await getSignedUrl(s3Client, command, { expiresIn });
}

/**
 * Delete a file from S3
 */
export async function deleteFromS3(key: string): Promise<void> {
  if (!isS3Configured()) {
    console.warn("[S3] S3 not configured, skipping delete");
    return;
  }

  const command = new DeleteObjectCommand({
    Bucket: S3_BUCKET,
    Key: key,
  });

  await s3Client.send(command);
}

/**
 * Remove newlines and extra spaces from a URL (fixes env vars pasted with line breaks).
 */
function sanitizeUrl(url: string): string {
  return url.replace(/\s+/g, "").trim();
}

/**
 * Return the public URL for an S3 key (e.g. "uploads/123.jpg").
 * Use when you have a relative path stored and need the full S3 URL for the client.
 */
export function getPublicUrlForKey(key: string): string {
  if (!key) return key;
  const k = key.replace(/\s+/g, "").trim().replace(/^\/+/, "");
  if (S3_PUBLIC_URL) {
    const base = S3_PUBLIC_URL.replace(/\/+$/, "");
    return sanitizeUrl(`${base}/${k}`);
  }
  const region = (process.env.S3_REGION || "us-east-1").trim();
  return `https://${S3_BUCKET}.s3.${region}.amazonaws.com/${k}`;
}

/**
 * If S3 is configured and url is a relative /uploads/ path, return full S3 URL; else return url as-is.
 * Always sanitizes the result so no newlines break the image src.
 *
 * Images should be loaded in the browser from this direct HTTPS URL (browser cache + S3 Cache-Control).
 * Use GET /api/media only for cross-origin video playback (CORS), not for static images.
 */
export function resolvePhotoUrl(url: string | null): string | null {
  if (!url) return null;
  const u = sanitizeUrl(url);
  if (!u) return null;
  if (!isS3Configured()) return u;
  if (u.startsWith("http://") || u.startsWith("https://")) return u;
  const key = u.startsWith("/uploads/") ? u.slice(1) : u.startsWith("uploads/") ? u : null;
  if (key) return getPublicUrlForKey(key);
  return u;
}

/**
 * Extract S3 key from URL (for deletion)
 */
export function extractS3KeyFromUrl(url: string): string | null {
  if (!url) return null;
  
  // If it's already a key (starts with uploads/), return as is
  if (url.startsWith("uploads/")) {
    return url;
  }

  // Extract key from S3 URL
  try {
    const urlObj = new URL(url);
    // Remove leading slash
    return urlObj.pathname.slice(1);
  } catch {
    // If it's not a valid URL, assume it's already a key
    return url.startsWith("/uploads/") ? url.slice(1) : url;
  }
}

function backoffDelayMs(attempt: number): number {
  const jitter = Math.floor(Math.random() * 200);
  return S3_RETRY_BASE_DELAY_MS * Math.pow(2, Math.max(0, attempt - 1)) + jitter;
}

async function sleep(ms: number): Promise<void> {
  await new Promise((resolve) => setTimeout(resolve, ms));
}

async function withAbortTimeout<T>(
  operation: (abortSignal: AbortSignal) => Promise<T>,
  timeoutMs: number,
  timeoutMessage: string
): Promise<T> {
  const controller = new AbortController();
  let timeoutId: ReturnType<typeof setTimeout> | null = null;
  const timeoutPromise = new Promise<never>((_, reject) => {
    timeoutId = setTimeout(() => {
      controller.abort();
      reject(new Error(timeoutMessage));
    }, timeoutMs);
  });
  try {
    return await Promise.race([operation(controller.signal), timeoutPromise]);
  } finally {
    if (timeoutId) clearTimeout(timeoutId);
  }
}

export function isS3TimeoutLikeError(error: unknown): boolean {
  const msg = ((error as Error)?.message || String(error) || "").toLowerCase();
  const name = ((error as Error)?.name || "").toLowerCase();
  return (
    name.includes("timeout") ||
    name.includes("abort") ||
    msg.includes("timeout") ||
    msg.includes("socket did not establish a connection") ||
    msg.includes("etimedout") ||
    msg.includes("econnreset") ||
    msg.includes("eai_again") ||
    msg.includes("abort")
  );
}

function isRetryableS3Error(error: unknown): boolean {
  const msg = ((error as Error)?.message || String(error) || "").toLowerCase();
  if (isS3TimeoutLikeError(error)) return true;
  return (
    msg.includes("network") ||
    msg.includes("requesttimeout") ||
    msg.includes("slowdown") ||
    msg.includes("throttl")
  );
}
