import type { Express } from "express";
import { createServer, type Server } from "http";
import { storage } from "./storage";
import { setupAuth, isAuthenticated } from "./auth";
import multer from "multer";
import path from "path";
import fs from "fs";

const uploadDir = path.join(process.cwd(), "uploads");
if (!fs.existsSync(uploadDir)) {
  fs.mkdirSync(uploadDir, { recursive: true });
}

const upload = multer({
  storage: multer.diskStorage({
    destination: (_req, _file, cb) => cb(null, uploadDir),
    filename: (_req, file, cb) => {
      const ext = path.extname(file.originalname);
      cb(null, `${Date.now()}-${Math.random().toString(36).slice(2)}${ext}`);
    },
  }),
  limits: { fileSize: 5 * 1024 * 1024 },
  fileFilter: (_req, file, cb) => {
    if (file.mimetype.startsWith("image/")) {
      cb(null, true);
    } else {
      cb(new Error("Solo se permiten imagenes"));
    }
  },
});

export async function registerRoutes(
  httpServer: Server,
  app: Express
): Promise<Server> {
  setupAuth(app);

  app.use("/uploads", (req, res, next) => {
    const filePath = path.join(uploadDir, path.basename(req.path));
    res.sendFile(filePath);
  });

  app.get("/api/gemba-walks", isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.session.userId;
      const walks = await storage.getGembaWalks(userId);
      res.json(walks);
    } catch (error) {
      console.error("Error fetching gemba walks:", error);
      res.status(500).json({ message: "Error al obtener recorridos" });
    }
  });

  app.post("/api/gemba-walks", isAuthenticated, async (req: any, res) => {
    try {
      const { date, area } = req.body;
      if (!date || !area) {
        return res.status(400).json({ message: "Fecha y area son requeridos" });
      }
      const userId = req.session.userId;
      const walk = await storage.createGembaWalk({ date, area, createdBy: userId });
      res.json(walk);
    } catch (error) {
      console.error("Error creating gemba walk:", error);
      res.status(500).json({ message: "Error al crear recorrido" });
    }
  });

  app.delete("/api/gemba-walks/:id", isAuthenticated, async (req: any, res) => {
    try {
      const id = parseInt(req.params.id);
      await storage.deleteGembaWalk(id);
      res.json({ success: true });
    } catch (error) {
      console.error("Error deleting gemba walk:", error);
      res.status(500).json({ message: "Error al eliminar recorrido" });
    }
  });

  app.get("/api/findings", isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.session.userId;
      const allFindings = await storage.getFindingsByUser(userId);
      res.json(allFindings);
    } catch (error) {
      console.error("Error fetching findings:", error);
      res.status(500).json({ message: "Error al obtener hallazgos" });
    }
  });

  app.post("/api/findings", isAuthenticated, upload.single("photo"), async (req: any, res) => {
    try {
      const { gembaWalkId, category, description, responsible, dueDate, status } = req.body;
      if (!gembaWalkId || !category || !description || !responsible || !dueDate) {
        return res.status(400).json({ message: "Todos los campos son requeridos" });
      }
      const photoUrl = req.file ? `/uploads/${req.file.filename}` : null;
      const finding = await storage.createFinding({
        gembaWalkId: parseInt(gembaWalkId),
        category,
        description,
        responsible,
        dueDate,
        status: status || "open",
        photoUrl,
      });
      res.json(finding);
    } catch (error) {
      console.error("Error creating finding:", error);
      res.status(500).json({ message: "Error al crear hallazgo" });
    }
  });

  app.patch("/api/findings/:id", isAuthenticated, async (req: any, res) => {
    try {
      const id = parseInt(req.params.id);
      const { status, closeComment } = req.body;
      const updateData: any = {};
      if (status) updateData.status = status;
      if (closeComment !== undefined) updateData.closeComment = closeComment;
      const finding = await storage.updateFinding(id, updateData);
      res.json(finding);
    } catch (error) {
      console.error("Error updating finding:", error);
      res.status(500).json({ message: "Error al actualizar hallazgo" });
    }
  });

  app.get("/api/reports/pdf", isAuthenticated, async (req: any, res) => {
    try {
      const month = req.query.month as string;
      const userId = req.session.userId;
      const gembaId = req.query.gembaId as string;
      let findingsList;
      if (gembaId) {
        findingsList = await storage.getFindingsByGembaWalk(parseInt(gembaId));
      } else if (month && month !== "all") {
        const [year, mon] = month.split("-").map(Number);
        findingsList = await storage.getFindingsByUserAndMonth(userId, year, mon);
      } else {
        findingsList = await storage.getFindingsByUser(userId);
      }

      const walks = await storage.getGembaWalks(userId);
      const walkMap = new Map(walks.map((w) => [w.id, w]));

      const statusLabels: Record<string, string> = {
        open: "Abierto",
        in_progress: "En progreso",
        closed: "Cerrado",
      };

      let html = `<!DOCTYPE html><html><head><meta charset="utf-8"><title>Reporte Gemba Walk</title>
        <style>
          body { font-family: Arial, sans-serif; margin: 20px; font-size: 12px; }
          h1 { color: #1e40af; font-size: 18px; }
          h2 { font-size: 14px; margin-top: 20px; }
          table { width: 100%; border-collapse: collapse; margin-top: 10px; }
          th, td { border: 1px solid #ddd; padding: 6px 8px; text-align: left; }
          th { background: #f3f4f6; font-weight: 600; }
          .overdue { color: #dc2626; font-weight: 600; }
          .closed { color: #16a34a; }
          @media print { body { margin: 0; } }
        </style>
      </head><body>
        <h1>Reporte Gemba Walk</h1>
        <p>Generado: ${new Date().toLocaleDateString("es-MX")}${month && month !== "all" ? ` | Mes: ${month}` : ""}</p>
        <table>
          <thead>
            <tr><th>#</th><th>Area</th><th>Categoria</th><th>Descripcion</th><th>Responsable</th><th>Fecha compromiso</th><th>Estatus</th></tr>
          </thead>
          <tbody>`;

      findingsList.forEach((f, i) => {
        const walk = walkMap.get(f.gembaWalkId);
        const isOverdue = f.status !== "closed" && new Date(f.dueDate) < new Date();
        const statusClass = f.status === "closed" ? "closed" : isOverdue ? "overdue" : "";
        html += `<tr>
          <td>${i + 1}</td>
          <td>${walk?.area || "-"}</td>
          <td>${f.category}</td>
          <td>${f.description}</td>
          <td>${f.responsible}</td>
          <td class="${statusClass}">${f.dueDate}${isOverdue ? " (VENCIDO)" : ""}</td>
          <td class="${statusClass}">${statusLabels[f.status] || f.status}</td>
        </tr>`;
      });

      html += `</tbody></table></body></html>`;

      res.setHeader("Content-Type", "text/html; charset=utf-8");
      res.setHeader("Content-Disposition", `inline; filename="reporte-gemba-${month || "all"}.html"`);
      res.send(html);
    } catch (error) {
      console.error("Error generating PDF:", error);
      res.status(500).json({ message: "Error al generar reporte" });
    }
  });

  app.get("/api/reports/excel", isAuthenticated, async (req: any, res) => {
    try {
      const month = req.query.month as string;
      const userId = req.session.userId;
      const gembaId = req.query.gembaId as string;
      let findingsList;
      if (gembaId) {
        findingsList = await storage.getFindingsByGembaWalk(parseInt(gembaId));
      } else if (month && month !== "all") {
        const [year, mon] = month.split("-").map(Number);
        findingsList = await storage.getFindingsByUserAndMonth(userId, year, mon);
      } else {
        findingsList = await storage.getFindingsByUser(userId);
      }

      const walks = await storage.getGembaWalks(userId);
      const walkMap = new Map(walks.map((w) => [w.id, w]));

      const statusLabels: Record<string, string> = {
        open: "Abierto",
        in_progress: "En progreso",
        closed: "Cerrado",
      };

      const header = "Area\tCategoria\tDescripcion\tResponsable\tFecha compromiso\tEstatus\tComentario cierre\n";
      const rows = findingsList.map((f) => {
        const walk = walkMap.get(f.gembaWalkId);
        return [
          walk?.area || "-",
          f.category,
          f.description.replace(/\t/g, " "),
          f.responsible,
          f.dueDate,
          statusLabels[f.status] || f.status,
          f.closeComment || "",
        ].join("\t");
      });

      const tsv = header + rows.join("\n");

      res.setHeader("Content-Type", "text/tab-separated-values; charset=utf-8");
      res.setHeader("Content-Disposition", `attachment; filename="reporte-gemba-${month || "all"}.tsv"`);
      res.send("\uFEFF" + tsv);
    } catch (error) {
      console.error("Error generating Excel:", error);
      res.status(500).json({ message: "Error al generar reporte" });
    }
  });

  return httpServer;
}
