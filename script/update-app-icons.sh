#!/usr/bin/env bash
# Extrae iconos de client/src/AppIcons.zip y los copia a client/public/
# Uso: npm run update-icons (o ./script/update-app-icons.sh desde la raíz del repo)

set -e
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
ZIP="$ROOT/client/src/AppIcons.zip"
PUBLIC="$ROOT/client/public"
TMP="$ROOT/.tmp-appicons"

if [ ! -f "$ZIP" ]; then
  echo "No se encuentra AppIcons.zip en client/src/AppIcons.zip"
  exit 1
fi

mkdir -p "$TMP"
cd "$TMP"
unzip -o "$ZIP" \
  'Assets.xcassets/AppIcon.appiconset//32.png' \
  'Assets.xcassets/AppIcon.appiconset//180.png' \
  'Assets.xcassets/AppIcon.appiconset//196.png' \
  'Assets.xcassets/AppIcon.appiconset//512.png' \
  'Assets.xcassets/AppIcon.appiconset//1024.png' \
  -x '*.DS_Store' 2>/dev/null || true

DIR="Assets.xcassets/AppIcon.appiconset"
cp "$DIR/32.png"   "$PUBLIC/favicon.png"
cp "$DIR/180.png"  "$PUBLIC/apple-touch-icon.png"
cp "$DIR/196.png"  "$PUBLIC/icon-192.png"
cp "$DIR/512.png"  "$PUBLIC/icon-512.png"
cp "$DIR/1024.png" "$PUBLIC/icon-1024.png"

cd "$ROOT"
rm -rf "$TMP"
echo "Iconos actualizados en client/public/ desde AppIcons.zip"
