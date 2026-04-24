import express, { type Express } from "express";
import fs from "fs";
import path from "path";

export function serveStatic(app: Express) {
  const distPath = path.resolve(__dirname, "public");
  if (!fs.existsSync(distPath)) {
    throw new Error(
      `Could not find the build directory: ${distPath}, make sure to build the client first`,
    );
  }

  app.use(express.static(distPath));

  // For unknown API routes, return JSON (avoid serving SPA HTML to API clients).
  app.use("/api/{*path}", (_req, res) => {
    res.status(404).json({ message: "API route not found" });
  });

  // Fall through to index.html for client-side routes.
  app.use("/{*path}", (_req, res) => {
    res.sendFile(path.resolve(distPath, "index.html"));
  });
}
