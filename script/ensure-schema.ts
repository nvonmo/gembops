import "dotenv/config";
import { execSync } from "child_process";
import pg from "pg";

const { Pool } = pg;

if (!process.env.DATABASE_URL) {
  console.error("[Ensure Schema] DATABASE_URL is not set");
  process.exit(1);
}

async function ensureSchema() {
  const pool = new Pool({ connectionString: process.env.DATABASE_URL });
  
  try {
    console.log("[Ensure Schema] Checking if users table exists...");
    
    const result = await pool.query(`
      SELECT EXISTS (
        SELECT FROM information_schema.tables 
        WHERE table_schema = 'public' 
        AND table_name = 'users'
      );
    `);
    
    const usersTableExists = result.rows[0].exists;
    
    if (usersTableExists) {
      console.log("[Ensure Schema] ✅ Database schema already exists");
      await pool.end();
      return;
    }

    console.log("[Ensure Schema] ⚠️  Database schema not found. Running migrations...");
    
    try {
      // Run drizzle-kit push to create tables
      execSync("npm run db:push", { 
        stdio: "inherit", 
        env: { ...process.env },
        cwd: process.cwd()
      });
      console.log("[Ensure Schema] ✅ Migrations completed successfully");
    } catch (error: any) {
      console.error("[Ensure Schema] ❌ Failed to run migrations:", error.message);
      // Don't exit - let the server start anyway, it will show a clearer error
      console.error("[Ensure Schema] You may need to run 'npm run db:push' manually");
    }
    
    await pool.end();
  } catch (error: any) {
    console.error("[Ensure Schema] ❌ Error checking schema:", error.message);
    await pool.end();
    // Don't exit - let the server start and show a clearer error
  }
}

ensureSchema();
