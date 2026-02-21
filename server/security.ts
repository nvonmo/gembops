import type { Express } from "express";
import helmet from "helmet";
import rateLimit from "express-rate-limit";

const isProduction = process.env.NODE_ENV === "production";

/**
 * Apply security middleware: Helmet (headers) and rate limiting.
 * In production, ensure SESSION_SECRET is set and cookie.secure is true (see auth.ts).
 */
export function setupSecurity(app: Express) {
  // Trust first proxy when behind reverse proxy (e.g. Nginx, load balancer)
  if (isProduction) {
    app.set("trust proxy", 1);
  }

  // S3 origin for img-src (must be exact origin; read at startup)
  let s3ImgSrc: string[] = [];
  try {
    const raw = process.env.S3_PUBLIC_URL?.trim().replace(/\s+/g, "");
    if (raw) {
      const origin = new URL(raw).origin;
      if (origin.startsWith("https://")) s3ImgSrc = [origin];
    }
    if (s3ImgSrc.length === 0 && process.env.S3_BUCKET && process.env.S3_REGION) {
      const bucket = process.env.S3_BUCKET.trim();
      const region = process.env.S3_REGION.trim().replace(/\s+/g, "");
      if (bucket && region) s3ImgSrc = [`https://${bucket}.s3.${region}.amazonaws.com`];
    }
  } catch (_) {}

  // Security headers (XSS, clickjacking, MIME sniffing, etc.)
  app.use(
    helmet({
      contentSecurityPolicy: isProduction
        ? {
            directives: {
              defaultSrc: ["'self'"],
              scriptSrc: ["'self'", "https://static.cloudflareinsights.com"],
              scriptSrcElem: ["'self'", "https://static.cloudflareinsights.com"],
              styleSrc: ["'self'", "'unsafe-inline'", "https://fonts.googleapis.com"],
              styleSrcElem: ["'self'", "'unsafe-inline'", "https://fonts.googleapis.com"],
              imgSrc: ["'self'", "data:", "blob:", ...s3ImgSrc],
              connectSrc: ["'self'"],
              fontSrc: ["'self'", "https://fonts.gstatic.com"],
              frameAncestors: ["'self'"],
            },
          }
        : false,
      crossOriginEmbedderPolicy: false,
    })
  );

  // General API rate limit: 300 requests per 15 minutes per IP (enough for normal use)
  const generalLimiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    max: 300,
    standardHeaders: true,
    legacyHeaders: false,
    message: { message: "Demasiadas solicitudes, intenta de nuevo más tarde." },
  });
  app.use("/api/", generalLimiter);

  // Stricter limit for auth endpoints (brute-force protection)
  const authLimiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    max: 10,
    standardHeaders: true,
    legacyHeaders: false,
    message: { message: "Demasiados intentos de inicio de sesión. Espera 15 minutos." },
  });
  app.use("/api/auth/login", authLimiter);
}
