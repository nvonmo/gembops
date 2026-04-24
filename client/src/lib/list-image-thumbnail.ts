/**
 * Small list thumbnails: server resizes to ~384px JPEG so the browser does not download
 * full S3 files for 48–80px UI. Use the original URL in modals / full-size views.
 */
export function listImageThumbnailSrc(absoluteImageUrl: string): string {
  const t = (absoluteImageUrl || "").trim();
  if (!t) return t;
  if (t.startsWith("/api/image-preview")) return t;
  if (!/^https?:\/\//i.test(t)) return t;
  if (/(?:\.(?:mp4|webm|ogg|mov|avi|gif|svg))(?:\?|#|$)/i.test(t)) return t;
  if (t.includes("video") && /\/.*video/i.test(t)) return t;
  return `/api/image-preview?url=${encodeURIComponent(t)}`;
}
