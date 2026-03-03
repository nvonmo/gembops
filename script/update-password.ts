/**
 * Script to update a user's password (e.g. when forgotten).
 * Usage:
 *   DATABASE_URL="postgresql://..." npx tsx script/update-password.ts <username> <newPassword>
 * Or with .env:
 *   npx tsx script/update-password.ts Nicole miNuevaContraseña
 */
import "dotenv/config";
import { db } from "../server/db";
import { users } from "@shared/models/auth";
import { eq, sql } from "drizzle-orm";
import bcrypt from "bcryptjs";

async function updatePassword() {
  const username = process.argv[2];
  const newPassword = process.argv[3];

  if (!username || !newPassword) {
    console.log("Uso: npx tsx script/update-password.ts <usuario> <nuevaContraseña>");
    console.log("Ejemplo: npx tsx script/update-password.ts Nicole miNuevaContraseña123");
    process.exit(1);
  }

  if (newPassword.length < 4) {
    console.error("La contraseña debe tener al menos 4 caracteres.");
    process.exit(1);
  }

  if (!process.env.DATABASE_URL) {
    console.error("Falta DATABASE_URL. Ponla en .env o ejecuta:");
    console.error('  DATABASE_URL="postgresql://user:pass@host:port/db" npx tsx script/update-password.ts Nicole nuevaPass');
    process.exit(1);
  }

  try {
    // Select only id to avoid requiring optional columns like department_id
    let [user] = await db.select({ id: users.id }).from(users).where(eq(users.username, username));
    if (!user) {
      const byUsername = await db.select({ id: users.id }).from(users).where(sql`LOWER(${users.username}) = LOWER(${username})`);
      user = byUsername[0];
    }
    if (!user) {
      const byFirstName = await db.select({ id: users.id }).from(users).where(sql`${users.firstName} ILIKE ${username}`);
      user = byFirstName[0];
    }
    if (!user) {
      console.error(`No existe ningún usuario con nombre de usuario o primer nombre "${username}".`);
      console.error("Comprueba el nombre (username o first_name en la tabla users).");
      process.exit(1);
    }

    const hashedPassword = await bcrypt.hash(newPassword, 10);
    await db
      .update(users)
      .set({ password: hashedPassword, updatedAt: new Date() })
      .where(eq(users.id, user.id));

    console.log(`Contraseña actualizada para el usuario "${username}".`);
    console.log("Ya puedes iniciar sesión con la nueva contraseña.");
    process.exit(0);
  } catch (error) {
    console.error("Error al actualizar contraseña:", error);
    process.exit(1);
  }
}

updatePassword();
