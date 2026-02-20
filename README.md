# Gembops – Gemba Walk Tracker

App para programar Gemba Walks, registrar hallazgos, asignar responsables y dar seguimiento.

## Stack

- **Frontend:** React, Vite, Tailwind, TanStack Query
- **Backend:** Express, Passport (sesiones)
- **DB:** PostgreSQL con Drizzle ORM

## Desarrollo local

1. **Requisitos:** Node.js 18+, PostgreSQL

2. **Clonar y dependencias**
   ```bash
   git clone https://github.com/TU_USUARIO/Gemba-Simple-Tracker.git
   cd Gemba-Simple-Tracker
   npm install
   ```

3. **Variables de entorno**
   ```bash
   cp .env.example .env
   # Editar .env con tu DATABASE_URL y SESSION_SECRET
   ```

4. **Base de datos**
   ```bash
   npm run db:push
   npm run create-admin   # opcional: crea usuario admin
   ```

5. **Arrancar**
   ```bash
   npm run dev
   ```
   Abre http://localhost:5000 (o el PORT que uses).

## Build para producción

```bash
npm run build
npm start
```

El build genera `dist/` (servidor + cliente). El servidor sirve el front desde `dist/public` y escucha en `PORT` (por defecto 5000).

## Desplegar en Railway

1. **Subir el repo a GitHub** (si no está ya).
   ```bash
   git remote add origin https://github.com/TU_USUARIO/Gemba-Simple-Tracker.git
   git add .
   git commit -m "Preparar para GitHub y Railway"
   git push -u origin main
   ```

2. **Crear proyecto en Railway**
   - Entra en [railway.app](https://railway.app) y crea un proyecto.
   - “Deploy from GitHub repo” y elige este repositorio.

3. **Añadir PostgreSQL**
   - En el proyecto: “Add service” → “Database” → “PostgreSQL”.
   - Railway crea la variable `DATABASE_URL` automáticamente.

4. **Variables de entorno del servicio web**
   - En el servicio que despliega tu código (no el DB):
   - Variables → Añadir:
     - `SESSION_SECRET`: una cadena larga y aleatoria (por ejemplo generada con `openssl rand -hex 32`).
   - `DATABASE_URL` suele inyectarse si el servicio y la DB están en el mismo proyecto; si no, cópiala desde el servicio PostgreSQL.

5. **Build y start**
   - Railway usa por defecto `npm install`, `npm run build` y `npm start` si están en tu `package.json`. No hace falta configuración extra.

6. **Dominio**
   - En el servicio → Settings → “Generate domain” para obtener una URL pública.

7. **Admin inicial**
   - Tras el primer deploy, puedes ejecutar `create-admin` localmente apuntando a la `DATABASE_URL` de Railway, o crear el usuario desde tu flujo de registro si lo tienes.

## Scripts útiles

| Script | Descripción |
|--------|-------------|
| `npm run dev` | Desarrollo (Vite + servidor) |
| `npm run build` | Build producción (cliente + servidor) |
| `npm start` | Servidor producción |
| `npm run db:push` | Aplica el esquema Drizzle a la DB |
| `npm run create-admin` | Crea usuario administrador |

## Licencia

MIT
