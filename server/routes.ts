import type { Express } from "express";
import { createServer, type Server } from "http";
import { storage } from "./storage";
import { setupAuth, isAuthenticated, isAdmin } from "./auth";
import { db } from "./db";
import { areas, categories, notifications, gembaWalks, gembaWalkAreas, gembaWalkParticipants, findings, type Finding } from "@shared/schema";
import { users } from "@shared/models/auth";
import { eq, desc, inArray, and, or, like, sql } from "drizzle-orm";
import bcrypt from "bcryptjs";
import multer from "multer";
import path from "path";
import fs from "fs";
import { addWeeks, addMonths, parseISO, format } from "date-fns";
import { s3Storage } from "./s3-storage.js";
import { GetObjectCommand } from "@aws-sdk/client-s3";
import { isS3Configured, getPublicUrlForKey, resolvePhotoUrl, uploadToS3, extractS3KeyFromUrl, s3Client, S3_BUCKET } from "./s3.js";
import { convertMovToMp4, isMovFile } from "./video-convert.js";

// Fallback to local storage if S3 is not configured
const uploadDir = path.join(process.cwd(), "uploads");
if (!fs.existsSync(uploadDir)) {
  fs.mkdirSync(uploadDir, { recursive: true });
}

// Use S3 storage if configured, otherwise use local disk storage
const upload = multer({
  storage: isS3Configured() ? s3Storage : multer.diskStorage({
    destination: (_req, _file, cb) => cb(null, uploadDir),
    filename: (_req, file, cb) => {
      const ext = path.extname(file.originalname);
      cb(null, `${Date.now()}-${Math.random().toString(36).slice(2)}${ext}`);
    },
  }),
  limits: { fileSize: 50 * 1024 * 1024 }, // 50MB para videos
  fileFilter: (_req, file, cb) => {
    if (file.mimetype.startsWith("image/") || file.mimetype.startsWith("video/")) {
      cb(null, true);
    } else {
      cb(new Error("Solo se permiten imagenes y videos"));
    }
  },
});

const fileFilterImagesVideos = (_req: any, file: Express.Multer.File, cb: multer.FileFilterCallback) => {
  if (file.mimetype.startsWith("image/") || file.mimetype.startsWith("video/")) {
    cb(null, true);
  } else {
    cb(new Error("Solo se permiten imagenes y videos"));
  }
};

const uploadMemory = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 50 * 1024 * 1024 },
  fileFilter: fileFilterImagesVideos,
});

export async function registerRoutes(
  httpServer: Server,
  app: Express
): Promise<Server> {
  console.log("[Routes] Starting route registration...");
  setupAuth(app);

  // Serve local uploads only if S3 is not configured
  if (!isS3Configured()) {
    app.use("/uploads", (req, res, next) => {
      const filePath = path.join(uploadDir, path.basename(req.path));
      if (fs.existsSync(filePath)) {
        res.sendFile(filePath);
      } else {
        res.status(404).json({ message: "File not found" });
      }
    });
  }

  // Proxy S3 media (video/images) to avoid CORS so <video> can play in the app
  app.get("/api/media", isAuthenticated, async (req: any, res) => {
    try {
      const rawUrl = req.query.url;
      if (!rawUrl || typeof rawUrl !== "string") {
        return res.status(400).json({ message: "Missing url" });
      }
      const key = extractS3KeyFromUrl(decodeURIComponent(rawUrl));
      if (!key || !key.startsWith("uploads/")) {
        return res.status(400).json({ message: "Invalid media URL" });
      }
      if (!isS3Configured() || !S3_BUCKET) {
        return res.status(503).json({ message: "S3 not configured" });
      }
      const range = req.headers.range as string | undefined;
      const command = new GetObjectCommand({
        Bucket: S3_BUCKET,
        Key: key,
        ...(range ? { Range: range } : {}),
      });
      const response = await s3Client.send(command);
      const body = response.Body;
      if (!body) {
        return res.status(404).json({ message: "Not found" });
      }
      const contentType = response.ContentType ?? (key.match(/\.mp4$/i) ? "video/mp4" : "application/octet-stream");
      res.setHeader("Content-Type", contentType);
      res.setHeader("Accept-Ranges", "bytes");
      res.setHeader("Cache-Control", "public, max-age=3600");
      const contentLength = response.ContentLength;
      if (contentLength != null) res.setHeader("Content-Length", String(contentLength));
      if (range && response.ContentRange && contentLength != null) {
        res.status(206);
        res.setHeader("Content-Range", response.ContentRange);
      }
      body.pipe(res);
    } catch (err) {
      console.error("[Media] Error streaming from S3:", err);
      if (!res.headersSent) res.status(500).json({ message: "Error loading media" });
    }
  });

  app.get("/api/gemba-walks", isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.session.userId;
      const walks = await storage.getGembaWalks(userId);
      
      // Get additional areas and participants for each walk
      const walksWithDetails = await Promise.all(walks.map(async (walk) => {
        const walkAreas = await db.select().from(gembaWalkAreas).where(eq(gembaWalkAreas.gembaWalkId, walk.id));
        const walkParticipants = await db.select().from(gembaWalkParticipants).where(eq(gembaWalkParticipants.gembaWalkId, walk.id));
        
        // Get leader info if exists
        let leader = null;
        if (walk.leaderId) {
          const [leaderUser] = await db.select().from(users).where(eq(users.id, walk.leaderId));
          leader = leaderUser;
        }
        
        // Get participants info
        const participantIds = walkParticipants.map(p => p.userId);
        const participantUsers = participantIds.length > 0
          ? await db.select().from(users).where(inArray(users.id, participantIds))
          : [];
        
        return {
          ...walk,
          areas: [walk.area, ...walkAreas.map(a => a.areaName)],
          leader,
          participants: participantUsers,
        };
      }));
      
      res.json(walksWithDetails);
    } catch (error) {
      console.error("Error fetching gemba walks:", error);
      res.status(500).json({ message: "Error al obtener recorridos" });
    }
  });

  app.post("/api/gemba-walks", isAuthenticated, isAdmin, async (req: any, res) => {
    try {
      const { 
        date, 
        areas: areasList, 
        leaderId, 
        participantIds,
        isRecurring,
        recurrencePattern,
        recurrenceEndDate
      } = req.body;
      if (!date || !areasList || !Array.isArray(areasList) || areasList.length === 0) {
        return res.status(400).json({ message: "Fecha y al menos un área son requeridos" });
      }
      if (isRecurring && !recurrencePattern) {
        return res.status(400).json({ message: "Debes seleccionar una frecuencia para Gemba Walks recurrentes" });
      }
      const userId = req.session.userId;
      
      // Create Gemba Walk with first area for backward compatibility
      const walk = await storage.createGembaWalk({ 
        date, 
        area: areasList[0], 
        leaderId: leaderId || null,
        createdBy: userId,
        isRecurring: isRecurring || false,
        recurrencePattern: recurrencePattern || null,
        recurrenceEndDate: recurrenceEndDate || null,
        parentWalkId: null,
      });
      
      // Insert additional areas if more than one
      if (areasList.length > 1) {
        await db.insert(gembaWalkAreas).values(
          areasList.slice(1).map(areaName => ({
            gembaWalkId: walk.id,
            areaName,
          }))
        );
      }
      
      // Insert participants if provided
      if (participantIds && Array.isArray(participantIds) && participantIds.length > 0) {
        await db.insert(gembaWalkParticipants).values(
          participantIds.map((participantId: string) => ({
            gembaWalkId: walk.id,
            userId: participantId,
          }))
        );
      }
      
      // Fetch complete walk with relations
      const [completeWalk] = await db.select().from(gembaWalks).where(eq(gembaWalks.id, walk.id));
      const walkAreas = await db.select().from(gembaWalkAreas).where(eq(gembaWalkAreas.gembaWalkId, walk.id));
      const walkParticipants = await db.select().from(gembaWalkParticipants).where(eq(gembaWalkParticipants.gembaWalkId, walk.id));
      
      // Send notifications to leader and participants
      const allAreas = [walk.area, ...walkAreas.map(a => a.areaName)];
      const areasText = allAreas.join(", ");
      
      // Notify leader if assigned
      if (leaderId) {
        await db.insert(notifications).values({
          userId: leaderId,
          type: "gemba_walk_assigned",
          title: "Gemba Walk asignado como líder",
          message: `Has sido asignado como líder de un Gemba Walk programado para el ${date}. Áreas: ${areasText}`,
          relatedGembaWalkId: walk.id,
          isActionRequired: false,
          isActionCompleted: false,
        });
      }
      
      // Notify participants
      if (participantIds && Array.isArray(participantIds) && participantIds.length > 0) {
        await db.insert(notifications).values(
          participantIds.map((participantId: string) => ({
            userId: participantId,
            type: "gemba_walk_assigned",
            title: "Gemba Walk asignado",
            message: `Has sido asignado como participante de un Gemba Walk programado para el ${date}. Áreas: ${areasText}`,
            relatedGembaWalkId: walk.id,
            isActionRequired: false,
            isActionCompleted: false,
          }))
        );
      }
      
      // Create recurring events if applicable
      let createdRecurringCount = 0;
      if (isRecurring && recurrencePattern) {
        const startDate = parseISO(date);
        const endDate = recurrenceEndDate ? parseISO(recurrenceEndDate) : null;
        const maxEvents = 12; // Limit to 12 future events to avoid too many
        let currentDate = startDate;
        let eventCount = 0;
        
        while (eventCount < maxEvents) {
          // Calculate next date based on pattern
          if (recurrencePattern === "weekly") {
            currentDate = addWeeks(currentDate, 1);
          } else if (recurrencePattern === "monthly") {
            currentDate = addMonths(currentDate, 1);
          }
          
          // Check if we've reached the end date
          if (endDate && currentDate > endDate) {
            break;
          }
          
          // Create the recurring walk
          const recurringWalk = await storage.createGembaWalk({
            date: format(currentDate, "yyyy-MM-dd"),
            area: areasList[0],
            leaderId: leaderId || null,
            createdBy: userId,
            isRecurring: false, // Individual events are not recurring
            recurrencePattern: null,
            recurrenceEndDate: null,
            parentWalkId: walk.id, // Link to parent
          });
          
          // Insert additional areas
          if (areasList.length > 1) {
            await db.insert(gembaWalkAreas).values(
              areasList.slice(1).map(areaName => ({
                gembaWalkId: recurringWalk.id,
                areaName,
              }))
            );
          }
          
          // Insert participants
          if (participantIds && Array.isArray(participantIds) && participantIds.length > 0) {
            await db.insert(gembaWalkParticipants).values(
              participantIds.map((participantId: string) => ({
                gembaWalkId: recurringWalk.id,
                userId: participantId,
              }))
            );
            
            // Notify participants of recurring events
            await db.insert(notifications).values(
              participantIds.map((participantId: string) => ({
                userId: participantId,
                type: "gemba_walk_assigned",
                title: "Gemba Walk recurrente asignado",
                message: `Has sido asignado como participante de un Gemba Walk recurrente programado para el ${format(currentDate, "yyyy-MM-dd")}. Áreas: ${areasText}`,
                relatedGembaWalkId: recurringWalk.id,
                isActionRequired: false,
                isActionCompleted: false,
              }))
            );
          }
          
          // Notify leader of recurring events
          if (leaderId) {
            await db.insert(notifications).values({
              userId: leaderId,
              type: "gemba_walk_assigned",
              title: "Gemba Walk recurrente asignado como líder",
              message: `Has sido asignado como líder de un Gemba Walk recurrente programado para el ${format(currentDate, "yyyy-MM-dd")}. Áreas: ${areasText}`,
              relatedGembaWalkId: recurringWalk.id,
              isActionRequired: false,
              isActionCompleted: false,
            });
          }
          
          createdRecurringCount++;
          eventCount++;
        }
      }
      
      res.json({
        ...completeWalk,
        areas: allAreas,
        participantIds: walkParticipants.map(p => p.userId),
        createdRecurringCount: isRecurring ? createdRecurringCount : 0,
      });
    } catch (error) {
      console.error("Error creating gemba walk:", error);
      res.status(500).json({ message: "Error al crear recorrido" });
    }
  });

  app.get("/api/gemba-walks/:id", isAuthenticated, async (req: any, res) => {
    try {
      const id = parseInt(req.params.id);
      if (isNaN(id)) {
        return res.status(400).json({ message: "ID inválido" });
      }
      
      const userId = req.session.userId;
      
      // Get the walk
      const walk = await storage.getGembaWalk(id);
      if (!walk) {
        return res.status(404).json({ message: "Gemba Walk no encontrado" });
      }
      
      // Check if user has access (creator, leader, or participant)
      const userWalks = await storage.getGembaWalks(userId);
      const hasAccess = userWalks.some(w => w.id === id);
      
      if (!hasAccess) {
        return res.status(403).json({ message: "No tienes acceso a este Gemba Walk" });
      }
      
      // Get additional areas and participants
      const walkAreas = await db.select().from(gembaWalkAreas).where(eq(gembaWalkAreas.gembaWalkId, walk.id));
      const walkParticipants = await db.select().from(gembaWalkParticipants).where(eq(gembaWalkParticipants.gembaWalkId, walk.id));
      
      // Get leader info if exists
      let leader = null;
      if (walk.leaderId) {
        const [leaderUser] = await db.select({
          id: users.id,
          username: users.username,
          firstName: users.firstName,
          lastName: users.lastName,
        }).from(users).where(eq(users.id, walk.leaderId));
        leader = leaderUser;
      }
      
      // Get participants info
      const participantIds = walkParticipants.map(p => p.userId);
      const participantUsers = participantIds.length > 0
        ? await db.select({
          id: users.id,
          username: users.username,
          firstName: users.firstName,
          lastName: users.lastName,
        }).from(users).where(inArray(users.id, participantIds))
        : [];
      
      // Get all findings for this walk
      const findings = await storage.getFindingsByGembaWalk(id);
      
      // Get responsible users for findings
      const responsibleIds = [...new Set(findings.map(f => f.responsibleId).filter(Boolean))];
      const responsibleUsers = responsibleIds.length > 0
        ? await db.select({
          id: users.id,
          username: users.username,
          firstName: users.firstName,
          lastName: users.lastName,
        }).from(users).where(inArray(users.id, responsibleIds))
        : [];
      const userMap = new Map(responsibleUsers.map(u => [u.id, u]));
      
      // Add responsible user info to findings
      const findingsWithUsers = findings.map(f => ({
        ...f,
        responsibleUser: userMap.get(f.responsibleId) || null,
      }));
      
      // Calculate statistics
      const stats = {
        total: findingsWithUsers.length,
        open: findingsWithUsers.filter(f => f.status === "open").length,
        closed: findingsWithUsers.filter(f => f.status === "closed").length,
        overdue: findingsWithUsers.filter(f => 
          f.status !== "closed" && f.dueDate && new Date(f.dueDate) < new Date()
        ).length,
      };
      
      res.json({
        ...walk,
        areas: [walk.area, ...walkAreas.map(a => a.areaName)],
        leader,
        participants: participantUsers,
        findings: findingsWithUsers,
        stats,
      });
    } catch (error) {
      console.error("Error fetching gemba walk details:", error);
      res.status(500).json({ message: "Error al obtener detalles del Gemba Walk" });
    }
  });

  app.delete("/api/gemba-walks/:id", isAuthenticated, isAdmin, async (req: any, res) => {
    try {
      const id = parseInt(req.params.id);
      // Delete related data first (cascade should handle it, but being explicit)
      await db.delete(gembaWalkAreas).where(eq(gembaWalkAreas.gembaWalkId, id));
      await db.delete(gembaWalkParticipants).where(eq(gembaWalkParticipants.gembaWalkId, id));
      await storage.deleteGembaWalk(id);
      res.json({ success: true });
    } catch (error) {
      console.error("Error deleting gemba walk:", error);
      res.status(500).json({ message: "Error al eliminar recorrido" });
    }
  });

  app.get("/api/analytics", isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.session.userId;
      console.log("[Analytics] userId:", userId);
      
      // Get all findings (created by user or where user is responsible)
      const findingsFromCreatedWalks = await storage.getFindingsByUser(userId);
      const findingsAsResponsible = await db
        .select({
          id: findings.id,
          gembaWalkId: findings.gembaWalkId,
          category: findings.category,
          description: findings.description,
          responsibleId: findings.responsibleId,
          dueDate: findings.dueDate,
          status: findings.status,
          photoUrl: findings.photoUrl,
          closeComment: findings.closeComment,
          closeEvidenceUrl: findings.closeEvidenceUrl,
          createdAt: findings.createdAt,
        })
        .from(findings)
        .where(eq(findings.responsibleId, userId))
        .orderBy(desc(findings.createdAt));
      
      const allFindingsMap = new Map<number, Finding>();
      findingsFromCreatedWalks.forEach(f => allFindingsMap.set(f.id, f));
      findingsAsResponsible.forEach(f => allFindingsMap.set(f.id, f));
      const allFindings = Array.from(allFindingsMap.values());
      
      // Get all Gemba Walks referenced (optimized: only select needed fields)
      const walkIds = [...new Set(allFindings.map(f => f.gembaWalkId))];
      const allWalks = walkIds.length > 0
        ? await db.select({
          id: gembaWalks.id,
          area: gembaWalks.area,
          date: gembaWalks.date,
        }).from(gembaWalks).where(inArray(gembaWalks.id, walkIds))
        : [];
      const walkMap = new Map(allWalks.map((w) => [w.id, w]));
      
      // Also get areas from gembaWalkAreas table
      const walkAreasData = walkIds.length > 0
        ? await db.select().from(gembaWalkAreas).where(inArray(gembaWalkAreas.gembaWalkId, walkIds))
        : [];
      const walkAreasMap = new Map<number, string[]>();
      walkAreasData.forEach(wa => {
        const existing = walkAreasMap.get(wa.gembaWalkId) || [];
        walkAreasMap.set(wa.gembaWalkId, [...existing, wa.areaName]);
      });
      
      // Get users (optimized: exclude password)
      const responsibleIds = [...new Set(allFindings.map(f => f.responsibleId).filter(Boolean))];
      const responsibleUsers = responsibleIds.length > 0 
        ? await db.select({
          id: users.id,
          username: users.username,
          firstName: users.firstName,
          lastName: users.lastName,
        }).from(users).where(inArray(users.id, responsibleIds))
        : [];
      const userMap = new Map(responsibleUsers.map(u => [u.id, u]));
      
      const now = new Date();
      const sixMonthsAgo = new Date(now.getFullYear(), now.getMonth() - 6, 1);
      
      // 1. Hallazgos por mes (últimos 6 meses)
      const findingsByMonth = new Map<string, { open: number; closed: number }>();
      for (let i = 5; i >= 0; i--) {
        const date = new Date(now.getFullYear(), now.getMonth() - i, 1);
        const monthKey = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}`;
        findingsByMonth.set(monthKey, { open: 0, closed: 0 });
      }
      
      allFindings.forEach(f => {
        const findingDate = new Date(f.createdAt);
        if (findingDate >= sixMonthsAgo) {
          const monthKey = `${findingDate.getFullYear()}-${String(findingDate.getMonth() + 1).padStart(2, "0")}`;
          const current = findingsByMonth.get(monthKey) || { open: 0, closed: 0 };
          if (f.status === "closed") {
            current.closed++;
          } else {
            current.open++;
          }
          findingsByMonth.set(monthKey, current);
        }
      });
      
      // 2. Hallazgos por categoría
      const findingsByCategory = new Map<string, number>();
      allFindings.forEach(f => {
        findingsByCategory.set(f.category, (findingsByCategory.get(f.category) || 0) + 1);
      });
      
      // 3. Hallazgos por área
      const findingsByArea = new Map<string, number>();
      allFindings.forEach(f => {
        const walk = walkMap.get(f.gembaWalkId);
        if (walk) {
          // Include main area and additional areas
          const allAreas = [walk.area, ...(walkAreasMap.get(walk.id) || [])];
          allAreas.forEach(area => {
            if (area) {
              findingsByArea.set(area, (findingsByArea.get(area) || 0) + 1);
            }
          });
        }
      });
      
      // 4. Top responsables
      const findingsByResponsible = new Map<string, number>();
      allFindings.forEach(f => {
        const user = userMap.get(f.responsibleId);
        const name = user 
          ? [user.firstName, user.lastName].filter(Boolean).join(" ") || user.username
          : f.responsibleId;
        findingsByResponsible.set(name, (findingsByResponsible.get(name) || 0) + 1);
      });
      
      // 5. Tasa de cierre y tiempo promedio
      const closedFindings = allFindings.filter(f => f.status === "closed" && f.createdAt && f.dueDate);
      const avgResolutionDays = closedFindings.length > 0
        ? closedFindings.reduce((sum, f) => {
            const created = new Date(f.createdAt);
            const closed = f.dueDate ? new Date(f.dueDate) : created;
            const days = Math.ceil((closed.getTime() - created.getTime()) / (1000 * 60 * 60 * 24));
            return sum + days;
          }, 0) / closedFindings.length
        : 0;
      
      const totalFindings = allFindings.length;
      const closedCount = allFindings.filter(f => f.status === "closed").length;
      const closureRate = totalFindings > 0 ? (closedCount / totalFindings) * 100 : 0;
      
      // 6. Cumplimiento (cerrados a tiempo)
      const closedOnTime = allFindings.filter(f => {
        if (f.status !== "closed" || !f.dueDate) return false;
        const closedDate = f.closeComment ? new Date(f.createdAt) : new Date(); // Approximate
        return new Date(f.dueDate) >= closedDate;
      }).length;
      const complianceRate = closedCount > 0 ? (closedOnTime / closedCount) * 100 : 0;
      
      // 7. Hallazgos vencidos
      const overdueCount = allFindings.filter(f => {
        return f.status !== "closed" && f.dueDate && new Date(f.dueDate) < now;
      }).length;
      
      const response = {
        findingsByMonth: Array.from(findingsByMonth.entries()).map(([month, data]) => ({
          month,
          open: data.open,
          closed: data.closed,
        })),
        findingsByCategory: Array.from(findingsByCategory.entries())
          .map(([category, count]) => ({ category, count }))
          .sort((a, b) => b.count - a.count),
        findingsByArea: Array.from(findingsByArea.entries())
          .map(([area, count]) => ({ area, count }))
          .sort((a, b) => b.count - a.count)
          .slice(0, 10),
        topResponsibles: Array.from(findingsByResponsible.entries())
          .map(([name, count]) => ({ name, count }))
          .sort((a, b) => b.count - a.count)
          .slice(0, 10),
        metrics: {
          totalFindings,
          openFindings: totalFindings - closedCount,
          closedFindings: closedCount,
          overdueCount,
          closureRate: Math.round(closureRate * 10) / 10,
          avgResolutionDays: Math.round(avgResolutionDays * 10) / 10,
          complianceRate: Math.round(complianceRate * 10) / 10,
        },
      };
      
      console.log("[Analytics] Total findings:", totalFindings, "Response:", JSON.stringify(response, null, 2));
      res.json(response);
    } catch (error) {
      console.error("Error fetching analytics:", error);
      res.status(500).json({ message: "Error al obtener analytics" });
    }
  });

  console.log("[Routes] Registering GET /api/findings");
  app.get("/api/findings", isAuthenticated, async (req: any, res) => {
    // Ensure we're sending JSON, not HTML - set header FIRST
    res.setHeader("Content-Type", "application/json");
    console.log("[Findings API] Route handler called - Path:", req.path, "Method:", req.method);
    
    try {
      const userId = req.session.userId;
      console.log("[Findings API] User:", userId, "Query params:", req.query);
      
      if (!userId) {
        return res.status(401).json({ message: "No autenticado" });
      }
      
      // Query parameters for filtering and searching
      const search = req.query.search as string || "";
      const status = req.query.status as string || "";
      const category = req.query.category as string || "";
      const responsibleId = req.query.responsibleId as string || "";
      const area = req.query.area as string || "";
      const sortBy = req.query.sortBy as string || "createdAt";
      const sortOrder = req.query.sortOrder as string || "desc";
      
      // Pagination parameters
      const page = parseInt(req.query.page as string) || 1;
      const limit = parseInt(req.query.limit as string) || 20;
      const offset = (page - 1) * limit;
      
      // Consultation: all authenticated users can see all findings (creation is restricted to leaders)
      const allFindingsRows = await db
        .select({
          id: findings.id,
          gembaWalkId: findings.gembaWalkId,
          area: findings.area,
          category: findings.category,
          description: findings.description,
          responsibleId: findings.responsibleId,
          dueDate: findings.dueDate,
          status: findings.status,
          photoUrl: findings.photoUrl,
          photoUrls: findings.photoUrls,
          closeComment: findings.closeComment,
          closeEvidenceUrl: findings.closeEvidenceUrl,
          createdAt: findings.createdAt,
        })
        .from(findings)
        .orderBy(desc(findings.createdAt));
      
      let allFindings = allFindingsRows as Finding[];
      
      // Get all Gemba Walks referenced (optimized: only select needed fields)
      const walkIds = [...new Set(allFindings.map(f => f.gembaWalkId))];
      const allWalks = walkIds.length > 0
        ? await db.select({
          id: gembaWalks.id,
          area: gembaWalks.area,
          date: gembaWalks.date,
          leaderId: gembaWalks.leaderId,
        }).from(gembaWalks).where(inArray(gembaWalks.id, walkIds))
        : [];
      const walkMap = new Map(allWalks.map((w) => [w.id, w]));
      
      // Get additional areas for each walk
      const walkAreasData = walkIds.length > 0
        ? await db.select().from(gembaWalkAreas).where(inArray(gembaWalkAreas.gembaWalkId, walkIds))
        : [];
      const walkAreasMap = new Map<number, string[]>();
      walkAreasData.forEach(wa => {
        const existing = walkAreasMap.get(wa.gembaWalkId) || [];
        walkAreasMap.set(wa.gembaWalkId, [...existing, wa.areaName]);
      });
      
      // Helper function to get all areas for a walk
      const getAllAreasForWalk = (walkId: number): string[] => {
        const walk = walkMap.get(walkId);
        if (!walk) return [];
        const additionalAreas = walkAreasMap.get(walkId) || [];
        return [walk.area, ...additionalAreas].filter(Boolean);
      };
      
      // Get user info for responsible users (optimized: exclude password)
      const responsibleIds = [...new Set(allFindings.map(f => f.responsibleId).filter(Boolean))];
      const responsibleUsers = responsibleIds.length > 0 
        ? await db.select({
          id: users.id,
          username: users.username,
          firstName: users.firstName,
          lastName: users.lastName,
        }).from(users).where(inArray(users.id, responsibleIds))
        : [];
      const userMap = new Map(responsibleUsers.map(u => [u.id, u]));
      
      // Apply filters
      if (status) {
        allFindings = allFindings.filter(f => f.status === status);
      }
      
      if (category) {
        allFindings = allFindings.filter(f => f.category === category);
      }
      
      if (responsibleId) {
        allFindings = allFindings.filter(f => f.responsibleId === responsibleId);
      }
      
      if (area) {
        allFindings = allFindings.filter(f => {
          // First check if finding has a specific area assigned
          if (f.area && f.area === area) {
            return true;
          }
          // Otherwise check walk areas
          const allAreas = getAllAreasForWalk(f.gembaWalkId);
          return allAreas.includes(area);
        });
      }
      
      // Apply search
      if (search) {
        const searchLower = search.toLowerCase();
        allFindings = allFindings.filter(f => {
          const allAreas = getAllAreasForWalk(f.gembaWalkId);
          const responsibleUser = userMap.get(f.responsibleId);
          const responsibleName = responsibleUser 
            ? [responsibleUser.firstName, responsibleUser.lastName].filter(Boolean).join(" ") || responsibleUser.username
            : "";
          
          // Check if search matches any area
          const areaMatch = allAreas.some(a => a.toLowerCase().includes(searchLower));
          
          return (
            f.description.toLowerCase().includes(searchLower) ||
            f.category.toLowerCase().includes(searchLower) ||
            areaMatch ||
            responsibleName.toLowerCase().includes(searchLower)
          );
        });
      }
      
      // Apply sorting
      allFindings.sort((a, b) => {
        let aValue: any;
        let bValue: any;
        
        switch (sortBy) {
          case "description":
            aValue = a.description.toLowerCase();
            bValue = b.description.toLowerCase();
            break;
          case "category":
            aValue = a.category.toLowerCase();
            bValue = b.category.toLowerCase();
            break;
          case "status":
            aValue = a.status;
            bValue = b.status;
            break;
          case "dueDate":
            aValue = a.dueDate ? new Date(a.dueDate).getTime() : 0;
            bValue = b.dueDate ? new Date(b.dueDate).getTime() : 0;
            break;
          case "createdAt":
          default:
            aValue = a.createdAt ? new Date(a.createdAt).getTime() : 0;
            bValue = b.createdAt ? new Date(b.createdAt).getTime() : 0;
            break;
        }
        
        if (sortOrder === "asc") {
          return aValue > bValue ? 1 : aValue < bValue ? -1 : 0;
        } else {
          return aValue < bValue ? 1 : aValue > bValue ? -1 : 0;
        }
      });
      
      // Add responsible user info and areas to findings; resolve S3 URLs for photos
      const findingsWithUsers = allFindings.map((f: any) => {
        const photoUrlsRaw = f.photoUrls ? (typeof f.photoUrls === "string" ? JSON.parse(f.photoUrls) : f.photoUrls) : [];
        const photoUrlsResolved = Array.isArray(photoUrlsRaw) ? photoUrlsRaw.map((u: string) => resolvePhotoUrl(u)) : [];
        const firstPhoto = photoUrlsResolved.length > 0 ? photoUrlsResolved[0] : resolvePhotoUrl(f.photoUrl);
        return {
          ...f,
          photoUrl: firstPhoto,
          photoUrls: photoUrlsResolved.length > 0 ? photoUrlsResolved : (f.photoUrl ? [resolvePhotoUrl(f.photoUrl)] : []),
          closeEvidenceUrl: resolvePhotoUrl(f.closeEvidenceUrl),
          responsibleUser: userMap.get(f.responsibleId) || null,
          areas: getAllAreasForWalk(f.gembaWalkId),
        };
      });
      
      // Calculate pagination metadata
      const total = findingsWithUsers.length;
      const totalPages = Math.ceil(total / limit);
      const paginatedFindings = findingsWithUsers.slice(offset, offset + limit);
      
      // Return paginated results with metadata
      const response = {
        findings: paginatedFindings,
        pagination: {
          page,
          limit,
          total,
          totalPages,
          hasMore: page < totalPages,
        },
      };
      console.log("[Findings API] Response:", {
        totalFindings: allFindings.length,
        paginatedCount: paginatedFindings.length,
        page,
        totalPages,
      });
      res.json(response);
    } catch (error: any) {
      console.error("[Findings API] Error:", error);
      console.error("[Findings API] Error stack:", error.stack);
      // Ensure we send JSON even on error - headers might not be set if error occurs early
      if (!res.headersSent) {
        res.setHeader("Content-Type", "application/json");
        const errorMessage = error?.message || String(error) || "Error desconocido";
        console.error("[Findings API] Sending error response:", errorMessage);
        return res.status(500).json({ message: "Error al obtener hallazgos: " + errorMessage });
      } else {
        console.error("[Findings API] Headers already sent, cannot send JSON error");
      }
    }
  });

  app.get("/api/findings/:id", isAuthenticated, async (req: any, res) => {
    try {
      const id = parseInt(req.params.id);
      if (isNaN(id)) {
        return res.status(400).json({ message: "ID de hallazgo inválido" });
      }
      const [f] = await db
        .select({
          id: findings.id,
          gembaWalkId: findings.gembaWalkId,
          area: findings.area,
          category: findings.category,
          description: findings.description,
          responsibleId: findings.responsibleId,
          dueDate: findings.dueDate,
          status: findings.status,
          photoUrl: findings.photoUrl,
          photoUrls: findings.photoUrls,
          closeComment: findings.closeComment,
          closeEvidenceUrl: findings.closeEvidenceUrl,
          createdAt: findings.createdAt,
        })
        .from(findings)
        .where(eq(findings.id, id));
      if (!f) {
        return res.status(404).json({ message: "Hallazgo no encontrado" });
      }
      const walkIds = [f.gembaWalkId];
      const allWalks = await db.select({
        id: gembaWalks.id,
        area: gembaWalks.area,
        date: gembaWalks.date,
        leaderId: gembaWalks.leaderId,
      }).from(gembaWalks).where(inArray(gembaWalks.id, walkIds));
      const walkMap = new Map(allWalks.map((w) => [w.id, w]));
      const walkAreasData = await db.select().from(gembaWalkAreas).where(inArray(gembaWalkAreas.gembaWalkId, walkIds));
      const walkAreasMap = new Map<number, string[]>();
      walkAreasData.forEach(wa => {
        const existing = walkAreasMap.get(wa.gembaWalkId) || [];
        walkAreasMap.set(wa.gembaWalkId, [...existing, wa.areaName]);
      });
      const getAllAreasForWalk = (walkId: number): string[] => {
        const walk = walkMap.get(walkId);
        if (!walk) return [];
        const additionalAreas = walkAreasMap.get(walkId) || [];
        return [walk.area, ...additionalAreas].filter(Boolean);
      };
      const [responsibleUser] = await db.select({
        id: users.id,
        username: users.username,
        firstName: users.firstName,
        lastName: users.lastName,
      }).from(users).where(eq(users.id, f.responsibleId));
      const photoUrlsRaw = f.photoUrls ? (typeof f.photoUrls === "string" ? JSON.parse(f.photoUrls) : f.photoUrls) : [];
      const photoUrlsResolved = Array.isArray(photoUrlsRaw)
        ? photoUrlsRaw.map((u: string) => resolvePhotoUrl(u)).filter((u): u is string => u != null && u !== "")
        : [];
      const fallbackPhoto = resolvePhotoUrl(f.photoUrl);
      const photoUrlsFinal = photoUrlsResolved.length > 0 ? photoUrlsResolved : (fallbackPhoto ? [fallbackPhoto] : []);
      const firstPhoto = photoUrlsFinal[0] ?? fallbackPhoto ?? null;
      const findingWithDetails = {
        ...f,
        photoUrl: firstPhoto,
        photoUrls: photoUrlsFinal,
        closeEvidenceUrl: resolvePhotoUrl(f.closeEvidenceUrl),
        responsibleUser: responsibleUser || null,
        areas: getAllAreasForWalk(f.gembaWalkId),
      };
      res.json(findingWithDetails);
    } catch (error: any) {
      console.error("Error fetching finding by id:", error);
      if (!res.headersSent) {
        res.status(500).json({ message: "Error al obtener hallazgo" });
      }
    }
  });

  app.post("/api/findings", isAuthenticated, uploadMemory.array("photos", 10), async (req: any, res) => {
    try {
      const { gembaWalkId, area, category, description, responsibleId, status } = req.body;
      const userId = req.session.userId;
      
      if (!gembaWalkId || !category || !description || !responsibleId) {
        return res.status(400).json({ message: "Gemba Walk, categoría, descripción y responsable son requeridos" });
      }
      
      // Get the Gemba Walk and verify user is the leader
      const [walk] = await db.select().from(gembaWalks).where(eq(gembaWalks.id, parseInt(gembaWalkId)));
      if (!walk) {
        return res.status(404).json({ message: "Gemba Walk no encontrado" });
      }
      
      // Verify that only the leader can create findings
      if (!walk.leaderId || walk.leaderId !== userId) {
        return res.status(403).json({ 
          message: "Solo el líder del Gemba Walk puede crear hallazgos" 
        });
      }
      
      // Verify responsible user exists
      const [responsibleUser] = await db.select().from(users).where(eq(users.id, responsibleId));
      if (!responsibleUser) {
        return res.status(400).json({ message: "Usuario responsable no encontrado" });
      }

      const files = (req.files || []) as Express.Multer.File[];
      const photoUrls: string[] = [];
      for (const file of files) {
        let buffer = (file as any).buffer as Buffer;
        let ext = path.extname(file.originalname).toLowerCase();
        let contentType = file.mimetype;
        if (buffer && isMovFile(file.originalname, file.mimetype)) {
          const converted = await convertMovToMp4(buffer);
          if (converted) {
            buffer = converted;
            ext = ".mp4";
            contentType = "video/mp4";
          }
        }
        if (isS3Configured()) {
          const key = `uploads/${Date.now()}-${Math.random().toString(36).slice(2)}${ext}`;
          const url = await uploadToS3(key, buffer, contentType);
          photoUrls.push(resolvePhotoUrl(url));
        } else {
          const filename = `${Date.now()}-${Math.random().toString(36).slice(2)}${ext}`;
          const destPath = path.join(uploadDir, filename);
          await fs.promises.writeFile(destPath, buffer);
          photoUrls.push(`/uploads/${filename}`);
        }
      }
      const photoUrl = photoUrls.length > 0 ? photoUrls[0] : null;
      const finding = await storage.createFinding({
        gembaWalkId: parseInt(gembaWalkId),
        area: area || null,
        category,
        description,
        responsibleId,
        dueDate: null,
        status: status || "open",
        photoUrl,
        photoUrls: photoUrls.length > 0 ? JSON.stringify(photoUrls) : null,
      });

      const walkArea = walk?.area || "desconocida";

      // Create notification for the responsible user
      await db.insert(notifications).values({
        userId: responsibleId,
        type: "finding_assigned",
        title: "Nuevo hallazgo asignado",
        message: `Se te ha asignado un nuevo hallazgo en el área ${walkArea}. Categoría: ${category}. Por favor establece la fecha de compromiso.`,
        relatedFindingId: finding.id,
        isActionRequired: true,
        isActionCompleted: false,
      });

      const photoUrlsParsed = finding.photoUrls ? (typeof finding.photoUrls === "string" ? JSON.parse(finding.photoUrls) : finding.photoUrls) : [];
      res.json({
        ...finding,
        photoUrl: resolvePhotoUrl(finding.photoUrl),
        photoUrls: Array.isArray(photoUrlsParsed) ? photoUrlsParsed.map((u: string) => resolvePhotoUrl(u)) : (finding.photoUrl ? [resolvePhotoUrl(finding.photoUrl)] : []),
        closeEvidenceUrl: resolvePhotoUrl(finding.closeEvidenceUrl),
      });
    } catch (error) {
      console.error("Error creating finding:", error);
      res.status(500).json({ message: "Error al crear hallazgo" });
    }
  });

  app.patch("/api/findings/:id", isAuthenticated, upload.single("closeEvidence"), async (req: any, res) => {
    try {
      const id = parseInt(req.params.id);
      const { status, closeComment, dueDate } = req.body;
      
      // Get the finding to verify permissions
      const [finding] = await db.select().from(findings).where(eq(findings.id, id));
      if (!finding) {
        return res.status(404).json({ message: "Hallazgo no encontrado" });
      }

      // Verify user can update this finding (must be the responsible user or the creator)
      const userId = req.session.userId;
      const [walk] = await db.select().from(gembaWalks).where(eq(gembaWalks.id, finding.gembaWalkId));
      const isResponsible = finding.responsibleId === userId;
      const isCreator = walk?.createdBy === userId;
      const canUpdate = isResponsible || isCreator;
      
      if (!canUpdate) {
        return res.status(403).json({ message: "No tienes permisos para actualizar este hallazgo" });
      }

      const updateData: any = {};
      
      // Status updates
      if (status) {
        // Only responsible user can close the finding
        if (status === "closed" && !isResponsible) {
          return res.status(403).json({ message: "Solo el responsable puede cerrar el hallazgo" });
        }
        updateData.status = status;
      }
      
      if (closeComment !== undefined) updateData.closeComment = closeComment;
      
      // Close evidence photo (only when closing)
      if (req.file && status === "closed") {
        updateData.closeEvidenceUrl = isS3Configured() && (req.file as any).location
          ? (req.file as any).location
          : `/uploads/${req.file.filename}`;
      }
      
      if (dueDate !== undefined) {
        // Only responsible user can set due date
        if (!isResponsible) {
          return res.status(403).json({ message: "Solo el responsable puede establecer la fecha de compromiso" });
        }
        updateData.dueDate = dueDate || null;
        
        // If setting due date for first time, mark notification action as completed
        if (!finding.dueDate && dueDate) {
          await db
            .update(notifications)
            .set({ isActionCompleted: true })
            .where(eq(notifications.relatedFindingId, id))
            .where(eq(notifications.type, "finding_assigned"));
        }
      }
      
      // If closing, mark related notifications as completed
      if (status === "closed" && finding.status !== "closed") {
        await db
          .update(notifications)
          .set({ isActionCompleted: true })
          .where(eq(notifications.relatedFindingId, id));
      }
      
      const updatedFinding = await storage.updateFinding(id, updateData);
      const photoUrlsRaw = updatedFinding?.photoUrls ? (typeof updatedFinding.photoUrls === "string" ? JSON.parse(updatedFinding.photoUrls) : updatedFinding.photoUrls) : [];
      const photoUrlsResolved = Array.isArray(photoUrlsRaw) ? photoUrlsRaw.map((u: string) => resolvePhotoUrl(u)) : (updatedFinding?.photoUrl ? [resolvePhotoUrl(updatedFinding.photoUrl)] : []);
      res.json({
        ...updatedFinding,
        photoUrl: resolvePhotoUrl(updatedFinding?.photoUrl ?? null),
        photoUrls: photoUrlsResolved,
        closeEvidenceUrl: resolvePhotoUrl(updatedFinding?.closeEvidenceUrl ?? null),
      });
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
      let findingsList: Finding[];
      
      console.log("[PDF Report] userId:", userId, "month:", month, "gembaId:", gembaId);
      
      if (gembaId) {
        findingsList = await storage.getFindingsByGembaWalk(parseInt(gembaId));
      } else {
        // Get findings from Gemba Walks created by user
        let findingsFromCreatedWalks: Finding[];
        if (month && month !== "all" && month !== "") {
          const [year, mon] = month.split("-").map(Number);
          // Get all findings first, then filter by month based on createdAt or dueDate
          const allCreatedFindings = await storage.getFindingsByUser(userId);
          const start = new Date(year, mon - 1, 1);
          const end = new Date(year, mon, 1);
          findingsFromCreatedWalks = allCreatedFindings.filter(f => {
            if (!f.createdAt) return false;
            const findingDate = f.dueDate ? new Date(f.dueDate) : new Date(f.createdAt);
            return findingDate >= start && findingDate < end;
          });
        } else {
          findingsFromCreatedWalks = await storage.getFindingsByUser(userId);
        }
        
        console.log("[PDF Report] findingsFromCreatedWalks:", findingsFromCreatedWalks.length);
        
        // Also get findings where user is responsible
        let findingsAsResponsible = await db
          .select()
          .from(findings)
          .where(eq(findings.responsibleId, userId))
          .orderBy(desc(findings.createdAt));
        
        console.log("[PDF Report] findingsAsResponsible (before filter):", findingsAsResponsible.length);
        
        // Filter by month if specified (use createdAt or dueDate)
        if (month && month !== "all" && month !== "") {
          const [year, mon] = month.split("-").map(Number);
          const start = new Date(year, mon - 1, 1);
          const end = new Date(year, mon, 1);
          findingsAsResponsible = findingsAsResponsible.filter(f => {
            if (!f.createdAt) return false;
            const findingDate = f.dueDate ? new Date(f.dueDate) : new Date(f.createdAt);
            return findingDate >= start && findingDate < end;
          });
        }
        
        console.log("[PDF Report] findingsAsResponsible (after filter):", findingsAsResponsible.length);
        
        // Combine and deduplicate by ID
        const allFindingsMap = new Map<number, Finding>();
        findingsFromCreatedWalks.forEach(f => allFindingsMap.set(f.id, f));
        findingsAsResponsible.forEach(f => allFindingsMap.set(f.id, f));
        findingsList = Array.from(allFindingsMap.values());
        
        console.log("[PDF Report] Total findingsList:", findingsList.length);
      }

      // Get all Gemba Walks referenced by findings (not just created by user)
      const walkIds = [...new Set(findingsList.map(f => f.gembaWalkId))];
      const allWalks = walkIds.length > 0
        ? await db.select().from(gembaWalks).where(inArray(gembaWalks.id, walkIds))
        : [];
      const walkMap = new Map(allWalks.map((w) => [w.id, w]));

      // Get responsible user info
      const responsibleIds = [...new Set(findingsList.map(f => f.responsibleId).filter(Boolean))];
      const responsibleUsers = responsibleIds.length > 0 
        ? await db.select().from(users).where(inArray(users.id, responsibleIds))
        : [];
      const userMap = new Map(responsibleUsers.map(u => [u.id, u]));

      // Get creators of Gemba Walks
      const creatorIds = [...new Set(allWalks.map(w => w.createdBy).filter(Boolean))];
      const creators = creatorIds.length > 0
        ? await db.select().from(users).where(inArray(users.id, creatorIds))
        : [];
      const creatorMap = new Map(creators.map(u => [u.id, u]));

      const statusLabels: Record<string, string> = {
        open: "Abierto",
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
            <tr><th>#</th><th>Fecha Gemba Walk</th><th>Levantado por</th><th>Area</th><th>Categoria</th><th>Descripcion</th><th>Responsable</th><th>Fecha compromiso</th><th>Estatus</th></tr>
          </thead>
          <tbody>`;

      findingsList.forEach((f, i) => {
        const walk = walkMap.get(f.gembaWalkId);
        const responsibleUser = userMap.get(f.responsibleId);
        const responsibleName = responsibleUser 
          ? [responsibleUser.firstName, responsibleUser.lastName].filter(Boolean).join(" ") || responsibleUser.username
          : f.responsibleId || "Sin asignar";
        const creatorUser = walk ? creatorMap.get(walk.createdBy) : null;
        const creatorName = creatorUser
          ? [creatorUser.firstName, creatorUser.lastName].filter(Boolean).join(" ") || creatorUser.username
          : walk?.createdBy || "Sin asignar";
        const isOverdue = f.status !== "closed" && f.dueDate && new Date(f.dueDate) < new Date();
        const statusClass = f.status === "closed" ? "closed" : isOverdue ? "overdue" : "";
        html += `<tr>
          <td>${i + 1}</td>
          <td>${walk?.date || "-"}</td>
          <td>${creatorName}</td>
          <td>${walk?.area || "-"}</td>
          <td>${f.category}</td>
          <td>${f.description}</td>
          <td>${responsibleName}</td>
          <td class="${statusClass}">${f.dueDate || "Sin fecha"}${isOverdue ? " (VENCIDO)" : ""}</td>
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
      let findingsList: Finding[];
      
      console.log("[Excel Report] userId:", userId, "month:", month, "gembaId:", gembaId);
      
      if (gembaId) {
        findingsList = await storage.getFindingsByGembaWalk(parseInt(gembaId));
      } else {
        // Get findings from Gemba Walks created by user
        let findingsFromCreatedWalks: Finding[];
        if (month && month !== "all" && month !== "") {
          const [year, mon] = month.split("-").map(Number);
          // Get all findings first, then filter by month based on createdAt or dueDate
          const allCreatedFindings = await storage.getFindingsByUser(userId);
          const start = new Date(year, mon - 1, 1);
          const end = new Date(year, mon, 1);
          findingsFromCreatedWalks = allCreatedFindings.filter(f => {
            if (!f.createdAt) return false;
            const findingDate = f.dueDate ? new Date(f.dueDate) : new Date(f.createdAt);
            return findingDate >= start && findingDate < end;
          });
        } else {
          findingsFromCreatedWalks = await storage.getFindingsByUser(userId);
        }
        
        console.log("[Excel Report] findingsFromCreatedWalks:", findingsFromCreatedWalks.length);
        
        // Also get findings where user is responsible
        let findingsAsResponsible = await db
          .select()
          .from(findings)
          .where(eq(findings.responsibleId, userId))
          .orderBy(desc(findings.createdAt));
        
        console.log("[Excel Report] findingsAsResponsible (before filter):", findingsAsResponsible.length);
        
        // Filter by month if specified (use createdAt or dueDate)
        if (month && month !== "all" && month !== "") {
          const [year, mon] = month.split("-").map(Number);
          const start = new Date(year, mon - 1, 1);
          const end = new Date(year, mon, 1);
          findingsAsResponsible = findingsAsResponsible.filter(f => {
            if (!f.createdAt) return false;
            const findingDate = f.dueDate ? new Date(f.dueDate) : new Date(f.createdAt);
            return findingDate >= start && findingDate < end;
          });
        }
        
        console.log("[Excel Report] findingsAsResponsible (after filter):", findingsAsResponsible.length);
        
        // Combine and deduplicate by ID
        const allFindingsMap = new Map<number, Finding>();
        findingsFromCreatedWalks.forEach(f => allFindingsMap.set(f.id, f));
        findingsAsResponsible.forEach(f => allFindingsMap.set(f.id, f));
        findingsList = Array.from(allFindingsMap.values());
        
        console.log("[Excel Report] Total findingsList:", findingsList.length);
      }

      // Get all Gemba Walks referenced by findings (not just created by user)
      const walkIds = [...new Set(findingsList.map(f => f.gembaWalkId))];
      const allWalks = walkIds.length > 0
        ? await db.select().from(gembaWalks).where(inArray(gembaWalks.id, walkIds))
        : [];
      const walkMap = new Map(allWalks.map((w) => [w.id, w]));

      // Get responsible user info
      const responsibleIds = [...new Set(findingsList.map(f => f.responsibleId).filter(Boolean))];
      const responsibleUsers = responsibleIds.length > 0 
        ? await db.select().from(users).where(inArray(users.id, responsibleIds))
        : [];
      const userMap = new Map(responsibleUsers.map(u => [u.id, u]));

      // Get creators of Gemba Walks
      const creatorIds = [...new Set(allWalks.map(w => w.createdBy).filter(Boolean))];
      const creators = creatorIds.length > 0
        ? await db.select().from(users).where(inArray(users.id, creatorIds))
        : [];
      const creatorMap = new Map(creators.map(u => [u.id, u]));

      const statusLabels: Record<string, string> = {
        open: "Abierto",
        closed: "Cerrado",
      };

      const header = "Fecha Gemba Walk\tLevantado por\tArea\tCategoria\tDescripcion\tResponsable\tFecha compromiso\tEstatus\tComentario cierre\n";
      const rows = findingsList.map((f) => {
        const walk = walkMap.get(f.gembaWalkId);
        const responsibleUser = userMap.get(f.responsibleId);
        const responsibleName = responsibleUser 
          ? [responsibleUser.firstName, responsibleUser.lastName].filter(Boolean).join(" ") || responsibleUser.username
          : f.responsibleId || "Sin asignar";
        const creatorUser = walk ? creatorMap.get(walk.createdBy) : null;
        const creatorName = creatorUser
          ? [creatorUser.firstName, creatorUser.lastName].filter(Boolean).join(" ") || creatorUser.username
          : walk?.createdBy || "Sin asignar";
        return [
          walk?.date || "-",
          creatorName,
          walk?.area || "-",
          f.category,
          f.description.replace(/\t/g, " "),
          responsibleName,
          f.dueDate || "Sin fecha",
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

  // Areas endpoints
  app.get("/api/areas", isAuthenticated, async (req: any, res) => {
    try {
      // Get user role to determine if they should see all areas
      const [user] = await db.select().from(users).where(eq(users.id, req.session.userId));
      const isAdminUser = user?.role === "admin";
      
      if (isAdminUser) {
        // Admins see all areas (active and inactive)
        const allAreas = await db.select().from(areas).orderBy(areas.name);
        res.json(allAreas);
      } else {
        // Regular users only see active areas
        const activeAreas = await db.select().from(areas).where(eq(areas.isActive, true)).orderBy(areas.name);
        res.json(activeAreas);
      }
    } catch (error) {
      console.error("Error fetching areas:", error);
      res.status(500).json({ message: "Error al obtener areas" });
    }
  });

  app.post("/api/areas", isAuthenticated, isAdmin, async (req: any, res) => {
    try {
      const { name } = req.body;
      if (!name || typeof name !== "string" || name.trim().length === 0) {
        return res.status(400).json({ message: "El nombre del area es requerido" });
      }
      const trimmedName = name.trim();
      const [existing] = await db.select().from(areas).where(eq(areas.name, trimmedName));
      if (existing) {
        return res.status(400).json({ message: "Ese area ya existe" });
      }
      const [newArea] = await db.insert(areas).values({ name: trimmedName }).returning();
      console.log("[Create Area] Success:", newArea);
      res.json(newArea);
    } catch (error: any) {
      console.error("Error creating area:", error);
      // Check for unique constraint violation
      if (error.code === "23505" || error.message?.includes("unique")) {
        return res.status(400).json({ message: "Ese area ya existe" });
      }
      res.status(500).json({ message: "Error al crear area: " + (error.message || "Error desconocido") });
    }
  });

  app.patch("/api/areas/:id", isAuthenticated, isAdmin, async (req: any, res) => {
    try {
      const id = parseInt(req.params.id);
      const { name, isActive } = req.body;
      const updateData: any = {};
      if (name !== undefined) {
        if (typeof name !== "string" || name.trim().length === 0) {
          return res.status(400).json({ message: "El nombre del area es requerido" });
        }
        const trimmedName = name.trim();
        const [existing] = await db.select().from(areas).where(eq(areas.name, trimmedName));
        if (existing && existing.id !== id) {
          return res.status(400).json({ message: "Ese area ya existe" });
        }
        updateData.name = trimmedName;
      }
      if (isActive !== undefined) {
        updateData.isActive = Boolean(isActive);
      }
      if (Object.keys(updateData).length === 0) {
        return res.status(400).json({ message: "No hay datos para actualizar" });
      }
      updateData.updatedAt = new Date();
      const [updatedArea] = await db
        .update(areas)
        .set(updateData)
        .where(eq(areas.id, id))
        .returning();
      if (!updatedArea) {
        return res.status(404).json({ message: "Area no encontrada" });
      }
      res.json(updatedArea);
    } catch (error) {
      console.error("Error updating area:", error);
      res.status(500).json({ message: "Error al actualizar area" });
    }
  });

  app.delete("/api/areas/:id", isAuthenticated, isAdmin, async (req: any, res) => {
    try {
      const id = parseInt(req.params.id);
      const [deletedArea] = await db
        .update(areas)
        .set({ isActive: false, updatedAt: new Date() })
        .where(eq(areas.id, id))
        .returning();
      if (!deletedArea) {
        return res.status(404).json({ message: "Area no encontrada" });
      }
      res.json({ success: true });
    } catch (error) {
      console.error("Error deleting area:", error);
      res.status(500).json({ message: "Error al eliminar area" });
    }
  });

  // Categories endpoints
  app.get("/api/categories", isAuthenticated, async (req: any, res) => {
    try {
      const activeCategories = await db.select().from(categories).where(eq(categories.isActive, true)).orderBy(categories.name);
      res.json(activeCategories);
    } catch (error) {
      console.error("Error fetching categories:", error);
      res.status(500).json({ message: "Error al obtener categorias" });
    }
  });

  app.get("/api/categories/all", isAuthenticated, isAdmin, async (req: any, res) => {
    try {
      const allCategories = await db.select().from(categories).orderBy(categories.name);
      res.json(allCategories);
    } catch (error) {
      console.error("Error fetching all categories:", error);
      res.status(500).json({ message: "Error al obtener categorias" });
    }
  });

  app.post("/api/categories", isAuthenticated, isAdmin, async (req: any, res) => {
    try {
      const { name } = req.body;
      if (!name || typeof name !== "string" || name.trim().length === 0) {
        return res.status(400).json({ message: "El nombre de la categoria es requerido" });
      }
      const trimmedName = name.trim();
      const [existing] = await db.select().from(categories).where(eq(categories.name, trimmedName));
      if (existing) {
        return res.status(400).json({ message: "Esa categoria ya existe" });
      }
      const [newCategory] = await db.insert(categories).values({ name: trimmedName }).returning();
      console.log("[Create Category] Success:", newCategory);
      res.json(newCategory);
    } catch (error: any) {
      console.error("Error creating category:", error);
      if (error.code === "23505" || error.message?.includes("unique")) {
        return res.status(400).json({ message: "Esa categoria ya existe" });
      }
      res.status(500).json({ message: "Error al crear categoria: " + (error.message || "Error desconocido") });
    }
  });

  app.patch("/api/categories/:id", isAuthenticated, isAdmin, async (req: any, res) => {
    try {
      const id = parseInt(req.params.id);
      const { name, isActive } = req.body;
      
      if (isNaN(id)) {
        return res.status(400).json({ message: "ID inválido" });
      }
      
      const updateData: any = {};
      if (name !== undefined) {
        if (typeof name !== "string" || name.trim().length === 0) {
          return res.status(400).json({ message: "El nombre de la categoria es requerido" });
        }
        updateData.name = name.trim();
      }
      if (isActive !== undefined) {
        updateData.isActive = isActive;
      }
      updateData.updatedAt = new Date();
      
      const [updated] = await db.update(categories).set(updateData).where(eq(categories.id, id)).returning();
      if (!updated) {
        return res.status(404).json({ message: "Categoria no encontrada" });
      }
      res.json(updated);
    } catch (error: any) {
      console.error("Error updating category:", error);
      if (error.code === "23505" || error.message?.includes("unique")) {
        return res.status(400).json({ message: "Esa categoria ya existe" });
      }
      res.status(500).json({ message: "Error al actualizar categoria" });
    }
  });

  app.delete("/api/categories/:id", isAuthenticated, isAdmin, async (req: any, res) => {
    try {
      const id = parseInt(req.params.id);
      if (isNaN(id)) {
        return res.status(400).json({ message: "ID inválido" });
      }
      
      // Soft delete: set isActive to false
      const [updated] = await db.update(categories).set({ isActive: false, updatedAt: new Date() }).where(eq(categories.id, id)).returning();
      if (!updated) {
        return res.status(404).json({ message: "Categoria no encontrada" });
      }
      res.json({ message: "Categoria desactivada exitosamente" });
    } catch (error) {
      console.error("Error deleting category:", error);
      res.status(500).json({ message: "Error al eliminar categoria" });
    }
  });

  // Users endpoints
  // IMPORTANT: /api/users/list must be defined BEFORE /api/users to avoid route conflicts
  // Public endpoint to get users list (for selecting responsible users)
  app.get("/api/users/list", isAuthenticated, async (req: any, res) => {
    try {
      const allUsers = await db.select({
        id: users.id,
        username: users.username,
        firstName: users.firstName,
        lastName: users.lastName,
      }).from(users).orderBy(users.username);
      console.log(`[users/list] Returning ${allUsers.length} users`);
      res.json(allUsers);
    } catch (error) {
      console.error("Error fetching users list:", error);
      res.status(500).json({ message: "Error al obtener usuarios" });
    }
  });

  // Users management endpoints (admin only)
  // This must come AFTER /api/users/list
  app.get("/api/users", isAuthenticated, isAdmin, async (req: any, res) => {
    try {
      const allUsers = await db.select({
        id: users.id,
        username: users.username,
        email: users.email,
        firstName: users.firstName,
        lastName: users.lastName,
        role: users.role,
        createdAt: users.createdAt,
        updatedAt: users.updatedAt,
      }).from(users).orderBy(users.username);
      res.json(allUsers);
    } catch (error) {
      console.error("Error fetching users:", error);
      res.status(500).json({ message: "Error al obtener usuarios" });
    }
  });

  app.post("/api/users", isAuthenticated, isAdmin, async (req: any, res) => {
    try {
      const { username, password, firstName, lastName, email, role } = req.body;
      
      if (!username || !password) {
        return res.status(400).json({ message: "Usuario y contraseña son requeridos" });
      }

      if (username.length < 3) {
        return res.status(400).json({ message: "El usuario debe tener al menos 3 caracteres" });
      }

      if (password.length < 4) {
        return res.status(400).json({ message: "La contraseña debe tener al menos 4 caracteres" });
      }

      const [existing] = await db.select().from(users).where(eq(users.username, username));
      if (existing) {
        return res.status(400).json({ message: "Ese usuario ya existe" });
      }

      const hashedPassword = await bcrypt.hash(password, 10);
      const [newUser] = await db
        .insert(users)
        .values({
          username,
          password: hashedPassword,
          firstName: firstName || null,
          lastName: lastName || null,
          email: email || null,
          role: role || "user",
        })
        .returning();

      const { password: _, ...safeUser } = newUser;
      res.json(safeUser);
    } catch (error) {
      console.error("Error creating user:", error);
      res.status(500).json({ message: "Error al crear usuario" });
    }
  });

  app.patch("/api/users/:id", isAuthenticated, isAdmin, async (req: any, res) => {
    try {
      const id = req.params.id;
      const { username, firstName, lastName, email, role, password } = req.body;
      
      const [existing] = await db.select().from(users).where(eq(users.id, id));
      if (!existing) {
        return res.status(404).json({ message: "Usuario no encontrado" });
      }

      const updateData: any = {};
      
      if (username !== undefined && username !== existing.username) {
        if (username.length < 3) {
          return res.status(400).json({ message: "El usuario debe tener al menos 3 caracteres" });
        }
        const [usernameExists] = await db.select().from(users).where(eq(users.username, username));
        if (usernameExists && usernameExists.id !== id) {
          return res.status(400).json({ message: "Ese usuario ya existe" });
        }
        updateData.username = username;
      }

      if (firstName !== undefined) updateData.firstName = firstName || null;
      if (lastName !== undefined) updateData.lastName = lastName || null;
      if (email !== undefined) updateData.email = email || null;
      if (role !== undefined) {
        if (role !== "admin" && role !== "user") {
          return res.status(400).json({ message: "El rol debe ser 'admin' o 'user'" });
        }
        updateData.role = role;
      }
      if (password !== undefined && password.length > 0) {
        if (password.length < 4) {
          return res.status(400).json({ message: "La contraseña debe tener al menos 4 caracteres" });
        }
        updateData.password = await bcrypt.hash(password, 10);
      }

      if (Object.keys(updateData).length === 0) {
        return res.status(400).json({ message: "No hay datos para actualizar" });
      }

      updateData.updatedAt = new Date();
      const [updatedUser] = await db
        .update(users)
        .set(updateData)
        .where(eq(users.id, id))
        .returning();

      const { password: _, ...safeUser } = updatedUser;
      res.json(safeUser);
    } catch (error) {
      console.error("Error updating user:", error);
      res.status(500).json({ message: "Error al actualizar usuario" });
    }
  });

  app.delete("/api/users/:id", isAuthenticated, isAdmin, async (req: any, res) => {
    try {
      const id = req.params.id;
      
      // Prevent deleting yourself
      if (id === req.session.userId) {
        return res.status(400).json({ message: "No puedes eliminar tu propia cuenta" });
      }

      const [user] = await db.select().from(users).where(eq(users.id, id));
      if (!user) {
        return res.status(404).json({ message: "Usuario no encontrado" });
      }

      await db.delete(users).where(eq(users.id, id));
      res.json({ success: true });
    } catch (error) {
      console.error("Error deleting user:", error);
      res.status(500).json({ message: "Error al eliminar usuario" });
    }
  });

  // Notifications endpoints
  app.get("/api/notifications", isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.session.userId;
      const userNotifications = await db
        .select()
        .from(notifications)
        .where(eq(notifications.userId, userId))
        .orderBy(desc(notifications.createdAt));
      res.json(userNotifications);
    } catch (error) {
      console.error("Error fetching notifications:", error);
      res.status(500).json({ message: "Error al obtener notificaciones" });
    }
  });

  app.get("/api/notifications/unread-count", isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.session.userId;
      const unreadNotifications = await db
        .select()
        .from(notifications)
        .where(and(eq(notifications.userId, userId), eq(notifications.isRead, false)));
      res.json({ count: unreadNotifications.length });
    } catch (error) {
      console.error("Error fetching unread count:", error);
      res.status(500).json({ message: "Error al obtener contador" });
    }
  });

  // Tareas pendientes: solo isActionRequired y no completadas (para badge)
  app.get("/api/notifications/pending-count", isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.session.userId;
      const pending = await db
        .select()
        .from(notifications)
        .where(and(
          eq(notifications.userId, userId),
          eq(notifications.isActionRequired, true),
          eq(notifications.isActionCompleted, false)
        ));
      res.json({ count: pending.length });
    } catch (error) {
      console.error("Error fetching pending count:", error);
      res.status(500).json({ message: "Error al obtener contador" });
    }
  });

  app.patch("/api/notifications/:id/read", isAuthenticated, async (req: any, res) => {
    try {
      const id = parseInt(req.params.id);
      const userId = req.session.userId;
      
      // Verify notification belongs to user
      const [notification] = await db
        .select()
        .from(notifications)
        .where(and(eq(notifications.id, id), eq(notifications.userId, userId)));
      
      if (!notification) {
        return res.status(404).json({ message: "Notificacion no encontrada" });
      }

      const [updated] = await db
        .update(notifications)
        .set({ isRead: true })
        .where(eq(notifications.id, id))
        .returning();
      
      res.json(updated);
    } catch (error) {
      console.error("Error marking notification as read:", error);
      res.status(500).json({ message: "Error al actualizar notificacion" });
    }
  });

  app.patch("/api/notifications/:id/action-completed", isAuthenticated, async (req: any, res) => {
    try {
      const id = parseInt(req.params.id);
      const userId = req.session.userId;
      
      // Verify notification belongs to user
      const [notification] = await db
        .select()
        .from(notifications)
        .where(and(eq(notifications.id, id), eq(notifications.userId, userId)));
      
      if (!notification) {
        return res.status(404).json({ message: "Notificacion no encontrada" });
      }

      const [updated] = await db
        .update(notifications)
        .set({ isActionCompleted: true })
        .where(eq(notifications.id, id))
        .returning();
      
      res.json(updated);
    } catch (error) {
      console.error("Error marking action as completed:", error);
      res.status(500).json({ message: "Error al actualizar notificacion" });
    }
  });

  app.patch("/api/notifications/read-all", isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.session.userId;
      await db
        .update(notifications)
        .set({ isRead: true })
        .where(and(eq(notifications.userId, userId), eq(notifications.isRead, false)));
      res.json({ success: true });
    } catch (error) {
      console.error("Error marking all as read:", error);
      res.status(500).json({ message: "Error al actualizar notificaciones" });
    }
  });

  console.log("[Routes] Route registration completed successfully");
  return httpServer;
}
