# Producción: Seguridad y Pruebas de Estrés

## Seguridad implementada

- **Helmet**: cabeceras HTTP seguras (XSS, clickjacking, MIME sniffing, etc.).
- **Rate limiting**:
  - API general: 300 peticiones por 15 minutos por IP.
  - Login: 10 intentos por 15 minutos por IP (protección frente a fuerza bruta).
- **Sesiones**:
  - En producción es **obligatorio** definir `SESSION_SECRET` (valor largo y aleatorio).
  - Cookie con `secure: true` y `sameSite: lax` en producción.
- **Trust proxy**: activado en producción para que la IP del cliente sea correcta detrás de un proxy (Nginx, load balancer).

## Variables de entorno en producción

| Variable         | Obligatorio | Descripción |
|------------------|-------------|-------------|
| `NODE_ENV`       | Sí          | Debe ser `production`. |
| `SESSION_SECRET` | Sí          | Secreto largo y aleatorio (ej. `openssl rand -base64 32`). |
| `DATABASE_URL`   | Sí          | URL de conexión a PostgreSQL. |
| `PORT`           | No          | Puerto del servidor (por defecto 5000). |

Ejemplo `.env` de producción (no subir a git):

```env
NODE_ENV=production
SESSION_SECRET=<generar con: openssl rand -base64 32>
DATABASE_URL=postgresql://user:pass@host:5432/dbname
PORT=5000
```

## Pruebas de estrés

Se usa **autocannon** para generar carga contra la API.

### Cómo ejecutar

1. Arrancar el servidor en otro terminal:
   ```bash
   npm run dev
   # o en producción: npm start
   ```
2. Ejecutar la prueba (por defecto 30 s, 10 conexiones):
   ```bash
   npm run stress-test
   ```
3. Opciones por variables de entorno:
   - `BASE_URL`: URL base (por defecto `http://localhost:3000`).
   - `DURATION`: segundos de prueba (por defecto 30).
   - `CONNECTIONS`: número de conexiones concurrentes (por defecto 10).
   - `COOKIE`: cookie de sesión para probar rutas autenticadas.

Ejemplo con más carga y duración:

```bash
DURATION=60 CONNECTIONS=25 npm run stress-test
```

Para probar endpoints que requieren login, copia la cookie `connect.sid` del navegador (F12 → Application → Cookies) y:

```bash
COOKIE="connect.sid=TU_VALOR_AQUI" npm run stress-test
```

### Qué revisar

- **Errores y timeouts**: que no crezcan de forma anormal.
- **Latencia media**: que se mantenga en un rango aceptable (p. ej. &lt; 500 ms en entorno controlado).
- **Rate limit**: al superar el límite de login deberías recibir 429; en la consola del script se muestran errores.

## Checklist antes de lanzar a producción

- [ ] `SESSION_SECRET` generado y configurado (nunca usar el valor por defecto).
- [ ] `DATABASE_URL` apunta a la base de datos de producción.
- [ ] `NODE_ENV=production` al arrancar el servidor.
- [ ] Servidor detrás de HTTPS (cookie `secure` solo funciona con HTTPS).
- [ ] Pruebas de estrés ejecutadas y sin errores críticos.
- [ ] Backups de la base de datos configurados.
- [ ] Logs y monitoreo revisados (errores 5xx, rate limit 429).
