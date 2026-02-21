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
    console.log("[Ensure Schema] Checking database schema...");
    
    const usersResult = await pool.query(`
      SELECT EXISTS (
        SELECT FROM information_schema.tables 
        WHERE table_schema = 'public' 
        AND table_name = 'users'
      );
    `);
    const usersTableExists = usersResult.rows[0].exists;
    
    if (!usersTableExists) {
      console.log("[Ensure Schema] ⚠️  Database schema not found. Running db:push...");
      await runDbPush(pool);
      return;
    }

    // Check if findings table has photo_urls column (added for multiple photos per finding)
    const columnResult = await pool.query(`
      SELECT EXISTS (
        SELECT FROM information_schema.columns 
        WHERE table_schema = 'public' 
        AND table_name = 'findings' 
        AND column_name = 'photo_urls'
      );
    `);
    const photoUrlsColumnExists = columnResult.rows[0].exists;
    
    if (!photoUrlsColumnExists) {
      console.log("[Ensure Schema] ⚠️  Column findings.photo_urls missing. Adding column...");
      try {
        await pool.query(`ALTER TABLE findings ADD COLUMN IF NOT EXISTS photo_urls text;`);
        console.log("[Ensure Schema] ✅ Column photo_urls added successfully");
      } catch (alterErr: any) {
        console.warn("[Ensure Schema] ALTER TABLE failed:", alterErr.message, "- trying db:push...");
        await runDbPush(pool);
        return;
      }
      await pool.end();
      return;
    }
    
    console.log("[Ensure Schema] ✅ Database schema is up to date");
    await pool.end();
  } catch (error: any) {
    console.error("[Ensure Schema] ❌ Error checking schema:", error.message);
    await pool.end();
  }
}

async function runDbPush(pool: pg.Pool) {
  try {
    execSync("npm run db:push", { 
      stdio: "inherit", 
      env: { ...process.env },
      cwd: process.cwd()
    });
    console.log("[Ensure Schema] ✅ db:push completed successfully");
  } catch (error: any) {
    console.error("[Ensure Schema] ❌ db:push failed:", error.message);
    console.error("[Ensure Schema] Run 'npm run db:push' manually against your DATABASE_URL");
  } finally {
    await pool.end();
  }
}

ensureSchema().catch((err) => {
  console.error("[Ensure Schema] Fatal:", err);
  process.exit(1);
});
