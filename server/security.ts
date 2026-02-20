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

  // Security headers (XSS, clickjacking, MIME sniffing, etc.)
  app.use(
    helmet({
      contentSecurityPolicy: isProduction
        ? {
            directives: {
              defaultSrc: ["'self'"],
              scriptSrc: ["'self'"],
              styleSrc: ["'self'", "'unsafe-inline'"],
              imgSrc: ["'self'", "data:", "blob:"],
              connectSrc: ["'self'"],
              fontSrc: ["'self'"],
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
