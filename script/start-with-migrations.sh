#!/bin/bash
set -e

echo "[Start] Checking database schema..."

# Check if users table exists
if psql "$DATABASE_URL" -tAc "SELECT EXISTS (SELECT FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'users');" | grep -q t; then
  echo "[Start] ✅ Database schema exists"
else
  echo "[Start] ⚠️  Database schema not found. Running migrations..."
  npm run db:push || {
    echo "[Start] ❌ Failed to run migrations. Please run 'npm run db:push' manually"
    exit 1
  }
  echo "[Start] ✅ Migrations completed"
fi

echo "[Start] Starting server..."
exec npm start
