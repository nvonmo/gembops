import { type Express } from "express";
import { createServer as createViteServer, createLogger } from "vite";
import { type Server } from "http";
import viteConfig from "../vite.config";
import fs from "fs";
import path from "path";
import { nanoid } from "nanoid";

const viteLogger = createLogger();

export async function setupVite(server: Server, app: Express) {
  const serverOptions = {
    middlewareMode: true,
    hmr: { server, path: "/vite-hmr" },
    allowedHosts: true as const,
  };

  const vite = await createViteServer({
    ...viteConfig,
    configFile: false,
    customLogger: {
      ...viteLogger,
      error: (msg, options) => {
        viteLogger.error(msg, options);
        process.exit(1);
      },
    },
    server: serverOptions,
    appType: "custom",
  });

  // IMPORTANT: API routes must be registered BEFORE vite middlewares
  // This ensures API routes are handled first and vite doesn't intercept them
  
  app.use(vite.middlewares);

  // Only serve HTML for non-API routes - this should never catch /api/* routes
  app.use("/{*path}", async (req, res, next) => {
    // Skip API routes - they should be handled by registerRoutes
    if (req.path.startsWith("/api/")) {
      console.error("[Vite] CRITICAL ERROR: API route intercepted by Vite catch-all:", req.path);
      console.error("[Vite] This should NEVER happen - API routes must be registered before Vite middleware");
      // Don't call next() with error - instead return 404 JSON to prevent HTML response
      if (!res.headersSent) {
        res.setHeader("Content-Type", "application/json");
        return res.status(404).json({ 
          error: "API route not found",
          path: req.path,
          message: "This route was intercepted by Vite middleware. Check route registration order."
        });
      }
      return;
    }
    
    const url = req.originalUrl;

    try {
      const clientTemplate = path.resolve(
        import.meta.dirname,
        "..",
        "client",
        "index.html",
      );

      // always reload the index.html file from disk incase it changes
      let template = await fs.promises.readFile(clientTemplate, "utf-8");
      template = template.replace(
        `src="/src/main.tsx"`,
        `src="/src/main.tsx?v=${nanoid()}"`,
      );
      const page = await vite.transformIndexHtml(url, template);
      res.status(200).set({ "Content-Type": "text/html" }).end(page);
    } catch (e) {
      vite.ssrFixStacktrace(e as Error);
      next(e);
    }
  });
}
