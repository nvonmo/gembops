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

  // Temporary endpoint to create first admin when DB is empty (only works if no users exist)
  app.post("/api/auth/create-first-admin", async (req, res) => {
    try {
      // Check if any users exist
      const allUsers = await db.select().from(users);
      if (allUsers.length > 0) {
        return res.status(403).json({ 
          message: "Ya existen usuarios en el sistema. Usa el panel de administración para crear más usuarios." 
        });
      }

      const { username, password, firstName } = req.body;
      
      if (!username || !password) {
        return res.status(400).json({ message: "Usuario y contraseña son requeridos" });
      }

      if (username.length < 3) {
        return res.status(400).json({ message: "El usuario debe tener al menos 3 caracteres" });
      }

      if (password.length < 4) {
        return res.status(400).json({ message: "La contraseña debe tener al menos 4 caracteres" });
      }

      const hashedPassword = await bcrypt.hash(password, 10);
      const [newUser] = await db
        .insert(users)
        .values({
          username,
          password: hashedPassword,
          firstName: firstName || "Administrador",
          role: "admin",
        })
        .returning();

      const { password: _, ...safeUser } = newUser;
      console.log(`✅ Primer administrador creado: ${username}`);
      res.json({ 
        message: "Administrador creado exitosamente",
        user: safeUser 
      });
    } catch (error) {
      console.error("Error creating first admin:", error);
      res.status(500).json({ message: "Error al crear administrador" });
    }
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
    const isAdminRole = user?.role != null && String(user.role).toLowerCase() === "admin";
    if (!user || !isAdminRole) {
      return res.status(403).json({ message: "No tienes permisos de administrador" });
    }
    next();
  } catch (error) {
    console.error("Error checking admin:", error);
    res.status(500).json({ message: "Error al verificar permisos" });
  }
};
