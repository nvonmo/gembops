/**
 * Restablece la contraseña de un usuario en la base de datos (ej. producción en Railway).
 * Uso: DATABASE_URL="postgresql://..." npx tsx script/reset-password-railway.ts [email] [nueva_contraseña]
 * Ejemplo: DATABASE_URL="postgresql://..." npx tsx script/reset-password-railway.ts nicole.vonmohr@atramat.com 1234
 */
import "dotenv/config";
import bcrypt from "bcryptjs";
import pg from "pg";

const email = process.argv[2] || "nicole.vonmohr@atramat.com";
const newPassword = process.argv[3] || "1234";

async function main() {
  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) {
    console.error("❌ Define DATABASE_URL (ej. la URL de Railway Postgres).");
    process.exit(1);
  }

  const pool = new pg.Pool({ connectionString });
  try {
    const hash = await bcrypt.hash(newPassword, 10);
    const r = await pool.query(
      `UPDATE users SET password = $1, updated_at = NOW() WHERE LOWER(email) = LOWER($2) RETURNING id, username, email, first_name`,
      [hash, email]
    );
    if (r.rowCount === 0) {
      const byName = await pool.query(
        `UPDATE users SET password = $1, updated_at = NOW() WHERE LOWER(first_name) = 'nicole' RETURNING id, username, email, first_name`,
        [hash]
      );
      if (byName.rowCount === 0) {
        console.error("❌ No se encontró usuario con email", email, "ni con nombre Nicole.");
        process.exit(1);
      }
      console.log("✅ Contraseña actualizada (por nombre):", byName.rows[0]);
    } else {
      console.log("✅ Contraseña actualizada:", r.rows[0]);
    }
    console.log("\n📋 Usa estas credenciales para entrar en productivo:");
    console.log("   Contraseña nueva:", newPassword);
    console.log("\n⚠️  Cambia la contraseña desde la app después de entrar.");
  } finally {
    await pool.end();
  }
}

main();
