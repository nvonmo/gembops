# Favicons y assets de la app (Gembops)

Los iconos web se han generado desde **AppIcons.zip** (en `client/src/AppIcons.zip`).

## Archivos en `client/public/`

| Archivo | Origen en zip | Uso |
|--------|----------------|-----|
| `favicon.png` | 32.png | Favicon del navegador (32×32) |
| `favicon.svg` | — | Favicon alternativo (vector) |
| `apple-touch-icon.png` | 180.png | Icono “Añadir a inicio” en iOS (180×180) |
| `icon-192.png` | 196.png | PWA / Android (192×192) |
| `icon-512.png` | 512.png | PWA (512×512) |
| `icon-1024.png` | 1024.png | PWA / alta resolución (1024×1024) |

## Actualizar iconos

Si cambias el contenido de **AppIcons.zip** (nuevo diseño de logo):

1. Sustituye `client/src/AppIcons.zip` por tu nuevo zip.
2. Vuelve a extraer y copiar a `client/public/`:
   - `Assets.xcassets/AppIcon.appiconset//32.png` → `favicon.png`
   - `Assets.xcassets/AppIcon.appiconset//180.png` → `apple-touch-icon.png`
   - `Assets.xcassets/AppIcon.appiconset//196.png` → `icon-192.png`
   - `Assets.xcassets/AppIcon.appiconset//512.png` → `icon-512.png`
   - `Assets.xcassets/AppIcon.appiconset//1024.png` → `icon-1024.png`

O ejecuta desde la raíz del proyecto:

```bash
cd /tmp && rm -rf appicons_extract && mkdir -p appicons_extract && cd appicons_extract && unzip -o /ruta/al/proyecto/client/src/AppIcons.zip 'Assets.xcassets/AppIcon.appiconset//32.png' 'Assets.xcassets/AppIcon.appiconset//180.png' 'Assets.xcassets/AppIcon.appiconset//196.png' 'Assets.xcassets/AppIcon.appiconset//512.png' 'Assets.xcassets/AppIcon.appiconset//1024.png' && cp Assets.xcassets/AppIcon.appiconset/32.png /ruta/al/proyecto/client/public/favicon.png && cp Assets.xcassets/AppIcon.appiconset/180.png /ruta/al/proyecto/client/public/apple-touch-icon.png && cp Assets.xcassets/AppIcon.appiconset/196.png /ruta/al/proyecto/client/public/icon-192.png && cp Assets.xcassets/AppIcon.appiconset/512.png /ruta/al/proyecto/client/public/icon-512.png && cp Assets.xcassets/AppIcon.appiconset/1024.png /ruta/al/proyecto/client/public/icon-1024.png
```

(Reemplaza `/ruta/al/proyecto` por la ruta real del repo.)
