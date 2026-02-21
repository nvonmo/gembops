import { S3Client, PutObjectCommand, GetObjectCommand, DeleteObjectCommand } from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import type { S3ClientConfig } from "@aws-sdk/client-s3";

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
};

export const s3Client = new S3Client(s3Config);
export const S3_BUCKET = process.env.S3_BUCKET || "";
export const S3_PUBLIC_URL = process.env.S3_PUBLIC_URL || ""; // Public URL base (e.g., https://bucket.region.digitaloceanspaces.com)

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

  // Do not set ACL when bucket has "Object ownership: Bucket owner enforced" (ACLs disabled).
  // Public read is handled by the bucket policy instead.
  const command = new PutObjectCommand({
    Bucket: S3_BUCKET,
    Key: key,
    Body: body,
    ContentType: contentType,
  });

  await s3Client.send(command);
  console.log("[S3] Uploaded:", key);

  // Return public URL
  if (S3_PUBLIC_URL) {
    return `${S3_PUBLIC_URL}/${key}`;
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
 * Return the public URL for an S3 key (e.g. "uploads/123.jpg").
 * Use when you have a relative path stored and need the full S3 URL for the client.
 */
export function getPublicUrlForKey(key: string): string {
  if (!key) return key;
  const k = key.startsWith("/") ? key.slice(1) : key;
  if (S3_PUBLIC_URL) {
    return S3_PUBLIC_URL.endsWith("/") ? `${S3_PUBLIC_URL}${k}` : `${S3_PUBLIC_URL}/${k}`;
  }
  const region = process.env.S3_REGION || "us-east-1";
  return `https://${S3_BUCKET}.s3.${region}.amazonaws.com/${k}`;
}

/**
 * If S3 is configured and url is a relative /uploads/ path, return full S3 URL; else return url as-is.
 */
export function resolvePhotoUrl(url: string | null): string | null {
  if (!url) return null;
  if (!isS3Configured()) return url;
  if (url.startsWith("http://") || url.startsWith("https://")) return url;
  const key = url.startsWith("/uploads/") ? url.slice(1) : url.startsWith("uploads/") ? url : null;
  if (key) return getPublicUrlForKey(key);
  return url;
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
