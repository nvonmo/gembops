# Gemba Walk App

## Overview
Simple web application for Gemba Walk management. Users can create walk reports, capture findings, assign responsibilities, track follow-ups, and generate reports. Built with simplicity in mind - minimal clicks, dropdown-based inputs.

## Architecture
- **Frontend**: React + Vite + TailwindCSS + shadcn/ui + wouter routing + TanStack Query
- **Backend**: Express.js with PostgreSQL (Drizzle ORM)
- **Auth**: Replit Auth (OpenID Connect)
- **File uploads**: Multer for optional finding photos (stored in /uploads)

## Key Files
- `shared/schema.ts` - Data models: gembaWalks, findings (+ auth re-exports)
- `shared/models/auth.ts` - Auth tables (users, sessions)
- `server/routes.ts` - All API endpoints (CRUD, reports, file upload)
- `server/storage.ts` - DatabaseStorage class with user-scoped queries
- `server/db.ts` - Drizzle/pg connection
- `client/src/App.tsx` - Root with auth-aware routing
- `client/src/pages/landing.tsx` - Public landing page
- `client/src/pages/dashboard.tsx` - Main dashboard with 3 tabs
- `client/src/components/new-gemba-tab.tsx` - Create Gemba Walk
- `client/src/components/findings-tab.tsx` - List/add findings
- `client/src/components/follow-up-tab.tsx` - Follow-up view + reports

## API Endpoints
- `GET/POST /api/gemba-walks` - List/create walks (user-scoped)
- `DELETE /api/gemba-walks/:id` - Delete walk + findings
- `GET/POST /api/findings` - List/create findings (user-scoped, multipart for photos)
- `PATCH /api/findings/:id` - Update status/close comment
- `GET /api/reports/pdf?month=&gembaId=` - HTML report (printable as PDF)
- `GET /api/reports/excel?month=&gembaId=` - TSV report (opens in Excel)

## Data Model
- **GembaWalk**: id, date, area, createdBy, createdAt
- **Finding**: id, gembaWalkId, category, description, responsible, dueDate, status, photoUrl, closeComment, createdAt

## Categories
Seguridad, Calidad, Productividad, Orden y Limpieza, Mantenimiento, Ergonomia, Medio Ambiente, Otro

## Areas
Produccion, Almacen, Calidad, Mantenimiento, Logistica, Oficinas, Seguridad, Embarques
