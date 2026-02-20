import "dotenv/config";
import { db } from "../server/db";
import { users } from "@shared/models/auth";
import { eq } from "drizzle-orm";
import bcrypt from "bcryptjs";

async function createAdmin() {
  const username = process.argv[2] || "admin";
  const password = process.argv[3] || "admin123";
  const firstName = process.argv[4] || "Administrador";

  try {
    // Check if user already exists
    const [existing] = await db.select().from(users).where(eq(users.username, username));
    
    if (existing) {
      // Update existing user to admin
      const hashedPassword = await bcrypt.hash(password, 10);
      await db
        .update(users)
        .set({ 
          role: "admin",
          password: hashedPassword,
          firstName: firstName || existing.firstName,
        })
        .where(eq(users.id, existing.id));
      console.log(`✅ Usuario "${username}" actualizado a administrador`);
      console.log(`   Contraseña actualizada`);
    } else {
      // Create new admin user
      const hashedPassword = await bcrypt.hash(password, 10);
      const [newUser] = await db
        .insert(users)
        .values({
          username,
          password: hashedPassword,
          firstName,
          role: "admin",
        })
        .returning();
      console.log(`✅ Usuario administrador "${username}" creado exitosamente`);
      console.log(`   ID: ${newUser.id}`);
    }
    
    console.log(`\n📋 Credenciales:`);
    console.log(`   Usuario: ${username}`);
    console.log(`   Contraseña: ${password}`);
    console.log(`\n⚠️  Recuerda cambiar la contraseña después del primer inicio de sesión`);
    
    process.exit(0);
  } catch (error) {
    console.error("❌ Error al crear administrador:", error);
    process.exit(1);
  }
}

createAdmin();
