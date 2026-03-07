import "dotenv/config";
import express, { type Request, Response, NextFunction } from "express";
import { serveStatic } from "./static";
import { setupSecurity } from "./security";
import { createServer } from "http";

const app = express();
const httpServer = createServer(app);

// Required when behind a reverse proxy (e.g. Railway, Nginx) so cookies and protocol are correct
if (process.env.NODE_ENV === "production") {
  app.set("trust proxy", 1);
}

setupSecurity(app);

declare module "http" {
  interface IncomingMessage {
    rawBody: unknown;
  }
}

app.use(
  express.json({
    verify: (req, _res, buf) => {
      req.rawBody = buf;
    },
  }),
);

app.use(express.urlencoded({ extended: false }));

export function log(message: string, source = "express") {
  const formattedTime = new Date().toLocaleTimeString("en-US", {
    hour: "numeric",
    minute: "2-digit",
    second: "2-digit",
    hour12: true,
  });

  console.log(`${formattedTime} [${source}] ${message}`);
}

app.use((req, res, next) => {
  const start = Date.now();
  const path = req.path;
  let capturedJsonResponse: Record<string, any> | undefined = undefined;

  const originalResJson = res.json;
  res.json = function (bodyJson, ...args) {
    capturedJsonResponse = bodyJson;
    return originalResJson.apply(res, [bodyJson, ...args]);
  };

  res.on("finish", () => {
    const duration = Date.now() - start;
    if (path.startsWith("/api")) {
      let logLine = `${req.method} ${path} ${res.statusCode} in ${duration}ms`;
      if (capturedJsonResponse) {
        logLine += ` :: ${JSON.stringify(capturedJsonResponse)}`;
      }

      log(logLine);
    }
  });

  next();
});

(async () => {
  if (!process.env.DATABASE_URL) {
    console.error("[FATAL] DATABASE_URL is not set. Set it in Railway (or .env) and redeploy.");
    process.exit(1);
  }
  // Ensure optional DB columns exist and run table renames (e.g. after deploy without running db:push)
  try {
    const { pool } = await import("./db");
    // Rename old table names so they are easier to find in Railway (walk_areas, participants)
    // Only attempt rename if the old table exists (avoids errors when DB already uses new names)
    for (const [oldName, newName] of [
      ["gemba_walk_areas", "walk_areas"],
      ["gemba_walk_participants", "participants"],
    ] as const) {
      try {
        const existsResult = await pool.query(
          `SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = $1`,
          [oldName]
        );
        if (existsResult.rowCount === 0) {
          // Old table does not exist (already renamed or fresh DB) — skip
          continue;
        }
        await pool.query(
          `ALTER TABLE "${oldName}" RENAME TO "${newName}"`
        );
        console.log(`[migrate] Renamed table ${oldName} → ${newName}`);
      } catch (renameErr: any) {
        const code = renameErr?.code;
        if (code === "42P01") {
          // Old table does not exist — skip (can happen under load)
        } else if (code === "42P07") {
          // New table already exists (e.g. after db:push): copy data from old, then drop old
          try {
            await pool.query(
              `INSERT INTO "${newName}" SELECT * FROM "${oldName}" ON CONFLICT (id) DO NOTHING`
            );
            await pool.query(`DROP TABLE "${oldName}"`);
            console.log(`[migrate] Migrated data ${oldName} → ${newName} and dropped ${oldName}`);
          } catch (copyErr: any) {
            console.warn(`[migrate] Copy ${oldName} → ${newName}:`, copyErr?.message || copyErr);
          }
        } else {
          console.warn(`[migrate] Rename ${oldName} → ${newName}:`, renameErr?.message || renameErr);
        }
      }
    }
    // Participants: confirmed_at column
    await pool.query(
      "ALTER TABLE participants ADD COLUMN IF NOT EXISTS confirmed_at TIMESTAMP WITH TIME ZONE"
    );

    // Departments table (for assigning users and findings)
    await pool.query(`
      CREATE TABLE IF NOT EXISTS departments (
        id SERIAL PRIMARY KEY,
        name TEXT NOT NULL UNIQUE,
        is_active BOOLEAN NOT NULL DEFAULT TRUE,
        created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
        updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
      )
    `);

    // Users: optional department_id
    await pool.query(
      "ALTER TABLE users ADD COLUMN IF NOT EXISTS department_id INTEGER"
    );

    // Findings: optional department_id and allow responsible_id to be null
    await pool.query(
      "ALTER TABLE findings ADD COLUMN IF NOT EXISTS department_id INTEGER"
    );
    await pool.query(
      "ALTER TABLE findings ALTER COLUMN responsible_id DROP NOT NULL"
    );

    // Findings: fecha de cierre (when the finding was closed)
    await pool.query(
      "ALTER TABLE findings ADD COLUMN IF NOT EXISTS closed_at TIMESTAMP WITH TIME ZONE"
    );

    // Findings: quien cerró el hallazgo (trazabilidad)
    await pool.query(
      "ALTER TABLE findings ADD COLUMN IF NOT EXISTS closed_by_user_id VARCHAR(255)"
    );

    // Findings: alerta riesgo mayor si se repite (solo admin/líder puede marcar)
    await pool.query(
      "ALTER TABLE findings ADD COLUMN IF NOT EXISTS risk_if_repeats BOOLEAN NOT NULL DEFAULT false"
    );

    // Categories: text explaining what the category includes
    await pool.query(
      "ALTER TABLE categories ADD COLUMN IF NOT EXISTS includes_description TEXT"
    );
  } catch (e) {
    console.error("[migrate] Could not run migrations:", e);
  }
  const { registerRoutes } = await import("./routes");
  await registerRoutes(httpServer, app);

  app.use((err: any, _req: Request, res: Response, next: NextFunction) => {
    const status = err.status || err.statusCode || 500;
    const message = err.message || "Internal Server Error";

    console.error("Internal Server Error:", err);

    if (res.headersSent) {
      return next(err);
    }

    return res.status(status).json({ message });
  });

  // importantly only setup vite in development and after
  // setting up all the other routes so the catch-all route
  // doesn't interfere with the other routes
  if (process.env.NODE_ENV === "production") {
    serveStatic(app);
  } else {
    const { setupVite } = await import("./vite");
    await setupVite(httpServer, app);
  }

  // ALWAYS serve the app on the port specified in the environment variable PORT
  // Other ports are firewalled. Default to 5000 if not specified.
  // this serves both the API and the client.
  // It is the only port that is not firewalled.
  const port = parseInt(process.env.PORT || "5000", 10);
  httpServer.listen(
    port,
    "0.0.0.0",
    () => {
      log(`serving on port ${port}`);
    },
  );
})();
