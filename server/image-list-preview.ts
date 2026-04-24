import { createHash } from "node:crypto";
import sharp from "sharp";

function clamp(n: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, n));
}

const MAX_PX = clamp(parseInt(process.env.IMAGE_LIST_PREVIEW_MAX_PX || "384", 10) || 384, 160, 800);
const JPEG_Q = clamp(parseInt(process.env.IMAGE_LIST_PREVIEW_JPEG_QUALITY || "78", 10) || 78, 60, 92);
const MAX_INPUT_BYTES = Math.max(5, parseInt(process.env.IMAGE_LIST_PREVIEW_MAX_INPUT_BYTES || "20971520", 10) || 20_971_520);

export { MAX_INPUT_BYTES };

/**
 * ETag the browser can send for If-None-Match; stable for same S3 object and preview settings.
 */
export function makePreviewEtag(s3Etag: string, key: string): string {
  const raw = s3Etag + "|" + key + "|" + String(MAX_PX) + "|" + String(JPEG_Q);
  const h = createHash("sha1").update(raw, "utf8").digest("hex").slice(0, 20);
  return `"p${h}"`;
}

/** True when we should serve the original URL in the list (GIF/SVG) instead of a JPEG preview. */
export function skipListPreview(mimetype: string, key: string): boolean {
  const k = key.toLowerCase();
  if (mimetype === "image/gif" || k.endsWith(".gif")) return true;
  if (mimetype.includes("svg") || k.endsWith(".svg")) return true;
  if (mimetype.startsWith("video/")) return true;
  return false;
}

export function isListPreviewable(mimetype: string, key: string): boolean {
  if (skipListPreview(mimetype, key)) return false;
  if (!mimetype.startsWith("image/")) return false;
  const k = key.toLowerCase();
  if (/(\.jpe?g|\.png|\.webp|\.tiff?|\.bmp|\.heic|\.heif)$/i.test(k)) return true;
  if (mimetype === "image/jpeg" || mimetype === "image/pjpeg") return true;
  if (mimetype === "image/png" || mimetype === "image/webp") return true;
  if (mimetype === "image/tiff" || mimetype === "image/bmp") return true;
  return false;
}

/**
 * Resize raster images to a small max edge for list thumbnails; always JPEG output.
 */
export async function buildListPreviewJpeg(input: Buffer, mimetype: string, key: string): Promise<Buffer> {
  if (!isListPreviewable(mimetype, key) || input.length > MAX_INPUT_BYTES) {
    throw new Error("Preview not applicable");
  }
  return sharp(input, { failOn: "none" })
    .rotate()
    .resize(MAX_PX, MAX_PX, { fit: "inside", withoutEnlargement: true })
    .jpeg({ quality: JPEG_Q, mozjpeg: true })
    .toBuffer();
}
