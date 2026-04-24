import path from "path";
import sharp from "sharp";

function clamp(n: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, n));
}

const MAX_EDGE = clamp(parseInt(process.env.IMAGE_UPLOAD_MAX_EDGE_PX || "1920", 10) || 1920, 640, 4096);
const JPEG_QUALITY = clamp(parseInt(process.env.IMAGE_UPLOAD_JPEG_QUALITY || "82", 10) || 82, 60, 95);
const MIN_BYTES = Math.max(0, parseInt(process.env.IMAGE_UPLOAD_OPTIMIZE_MIN_BYTES || "20480", 10) || 20480);

/**
 * Resize/compress raster images before S3 upload to speed up display and reduce transfer.
 * GIFs are left unchanged. On failure, returns the original buffer.
 */
export async function optimizeImageBufferForUpload(
  buffer: Buffer,
  mimetype: string,
  originalName: string
): Promise<{ buffer: Buffer; ext: string; contentType: string }> {
  const fallbackExt = path.extname(originalName).toLowerCase() || ".jpg";
  if (!mimetype.startsWith("image/") || mimetype === "image/gif") {
    return { buffer, ext: fallbackExt || ".jpg", contentType: mimetype };
  }

  try {
    const probe = sharp(buffer, { failOn: "none" });
    const meta = await probe.metadata();
    const needsResize = (meta.width != null && meta.width > MAX_EDGE) || (meta.height != null && meta.height > MAX_EDGE);
    const smallFile = buffer.length < MIN_BYTES && !needsResize;
    if (smallFile) {
      return { buffer, ext: fallbackExt, contentType: mimetype };
    }

    let pipeline = sharp(buffer, { failOn: "none" }).rotate();
    if (needsResize) {
      pipeline = pipeline.resize(MAX_EDGE, MAX_EDGE, { fit: "inside", withoutEnlargement: true });
    }

    if (mimetype === "image/png") {
      const out = await pipeline.png({ compressionLevel: 9, effort: 7 }).toBuffer();
      if (out.length > buffer.length * 1.05) {
        return { buffer, ext: fallbackExt, contentType: mimetype };
      }
      return { buffer: out, ext: ".png", contentType: "image/png" };
    }

    if (mimetype === "image/webp") {
      const out = await pipeline.webp({ quality: JPEG_QUALITY }).toBuffer();
      return { buffer: out, ext: ".webp", contentType: "image/webp" };
    }

    const out = await pipeline.jpeg({ quality: JPEG_QUALITY, mozjpeg: true }).toBuffer();
    const ext = /\.jpe?g$/i.test(fallbackExt) ? fallbackExt : ".jpg";
    return { buffer: out, ext: ext || ".jpg", contentType: "image/jpeg" };
  } catch (err) {
    console.warn("[image-optimize] skipped:", (err as Error)?.message || String(err));
    return { buffer, ext: fallbackExt, contentType: mimetype };
  }
}
