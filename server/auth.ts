import type { Express, RequestHandler } from "express";
import session from "express-session";
import connectPg from "connect-pg-simple";
import bcrypt from "bcryptjs";
import { db } from "./db";
import { users } from "@shared/models/auth";
import { eq } from "drizzle-orm";
import { loginSchema, registerSchema } from "@shared/models/auth";

declare module "express-session" {
  interface SessionData {
    userId: string;
  }
}

export function setupAuth(app: Express) {
  const isProduction = process.env.NODE_ENV === "production";
  const secret = process.env.SESSION_SECRET || (isProduction ? "" : "gemba-walk-secret-key");
  if (isProduction && !process.env.SESSION_SECRET) {
    console.error("[Auth] SESSION_SECRET is required in production. Set it in .env or environment.");
    process.exit(1);
  }

  const sessionTtl = 7 * 24 * 60 * 60 * 1000;
  const pgStore = connectPg(session);
  const sessionStore = new pgStore({
    conString: process.env.DATABASE_URL,
    createTableIfMissing: true,
    ttl: sessionTtl,
    tableName: "sessions",
  });

  app.use(
    session({
      secret,
      store: sessionStore,
      resave: false,
      saveUninitialized: false,
      cookie: {
        httpOnly: true,
        secure: isProduction,
        maxAge: sessionTtl,
        sameSite: "lax",
      },
    })
  );

  // Registration is now admin-only, moved to routes.ts
  app.post("/api/auth/register", async (req, res) => {
    return res.status(403).json({ message: "El registro público está deshabilitado. Contacta a un administrador." });
  });

  app.post("/api/auth/login", async (req, res) => {
    try {
      const parsed = loginSchema.safeParse(req.body);
      if (!parsed.success) {
        return res.status(400).json({ message: parsed.error.errors[0].message });
      }

      const { username, password } = parsed.data;
      const [user] = await db.select().from(users).where(eq(users.username, username));
      if (!user) {
        return res.status(401).json({ message: "Usuario o contraseña incorrectos" });
      }

      const valid = await bcrypt.compare(password, user.password);
      if (!valid) {
        return res.status(401).json({ message: "Usuario o contraseña incorrectos" });
      }

      req.session.userId = user.id;
      const { password: _, ...safeUser } = user;
      res.json(safeUser);
    } catch (error) {
      console.error("Error logging in:", error);
      res.status(500).json({ message: "Error al iniciar sesion" });
    }
  });

  app.get("/api/auth/user", async (req, res) => {
    if (!req.session.userId) {
      return res.status(401).json({ message: "No autenticado" });
    }
    try {
      const [user] = await db.select().from(users).where(eq(users.id, req.session.userId));
      if (!user) {
        return res.status(401).json({ message: "No autenticado" });
      }
      const { password: _, ...safeUser } = user;
      res.json(safeUser);
    } catch (error) {
      console.error("Error fetching user:", error);
      res.status(500).json({ message: "Error al obtener usuario" });
    }
  });

  app.post("/api/auth/logout", (req, res) => {
    req.session.destroy((err) => {
      if (err) {
        return res.status(500).json({ message: "Error al cerrar sesion" });
      }
      res.json({ success: true });
    });
  });
}

export const isAuthenticated: RequestHandler = (req, res, next) => {
  if (!req.session.userId) {
    return res.status(401).json({ message: "No autenticado" });
  }
  next();
};

export const isAdmin: RequestHandler = async (req: any, res, next) => {
  if (!req.session.userId) {
    return res.status(401).json({ message: "No autenticado" });
  }
  try {
    const [user] = await db.select().from(users).where(eq(users.id, req.session.userId));
    console.log("[isAdmin] User check:", { userId: req.session.userId, userRole: user?.role, isAdmin: user?.role === "admin" });
    if (!user || user.role !== "admin") {
      return res.status(403).json({ message: "No tienes permisos de administrador" });
    }
    next();
  } catch (error) {
    console.error("Error checking admin:", error);
    res.status(500).json({ message: "Error al verificar permisos" });
  }
};
