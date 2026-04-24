/**
 * Small list thumbnails: server resizes to a max-edge JPEG (default ~384px) so the browser
 * does not download full S3 files. Use the original URL in modals / full-size views.
 *
 * Optional `maxEdgePx` (160–800): use LIST_IMAGE_CARD_FEED_MAX_PX for large card heroes.
 * Server: GET /api/image-preview?url=...&max=720
 */
export const LIST_IMAGE_CARD_FEED_MAX_PX = 720;

function clampPreviewEdge(n: number): number {
  return Math.min(800, Math.max(160, Math.round(n)));
}

export function listImageThumbnailSrc(absoluteImageUrl: string, maxEdgePx?: number): string {
  const t = (absoluteImageUrl || "").trim();
  if (!t) return t;
  if (t.startsWith("/api/image-preview")) return t;
  if (!/^https?:\/\//i.test(t)) return t;
  if (/(?:\.(?:mp4|webm|ogg|mov|avi|gif|svg))(?:\?|#|$)/i.test(t)) return t;
  if (t.includes("video") && /\/.*video/i.test(t)) return t;
  const base = `/api/image-preview?url=${encodeURIComponent(t)}`;
  if (maxEdgePx == null) return base;
  return `${base}&max=${clampPreviewEdge(maxEdgePx)}`;
}
