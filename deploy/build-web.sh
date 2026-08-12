#!/usr/bin/env bash
# MAMOR-AI Web配信物を out/ に組み立てる。
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
OUT="$ROOT/out"

echo "▶ input-core build"
pnpm --filter @mamorai/input-core build >/dev/null

echo "▶ desktop(Web) build with base=/app/"
VITE_BASE=/app/ pnpm --filter @mamorai/desktop build >/dev/null

echo "▶ assemble out/"
rm -rf "$OUT"
mkdir -p "$OUT/app" "$OUT/lp"
cp "$ROOT/web/index.html" "$OUT/index.html"
cp "$ROOT/web/lp.html"    "$OUT/lp/index.html"
cp "$ROOT/web/favicon.ico" "$ROOT/web/favicon-16.png" "$ROOT/web/favicon-32.png" \
   "$ROOT/web/apple-touch-icon.png" "$ROOT/web/icon-192.png" "$ROOT/web/icon-512.png" \
   "$ROOT/web/icon-maskable-512.png" "$ROOT/web/logo-mark.png" "$ROOT/web/og-image.png" \
   "$ROOT/web/site.webmanifest" "$OUT/"
cp -r "$ROOT/apps/desktop/dist/." "$OUT/app/"
for p in co s tradmin; do
  mkdir -p "$OUT/$p"
  cp "$OUT/app/index.html" "$OUT/$p/index.html"
done
cp "$ROOT/deploy/vercel.json" "$OUT/vercel.json"

echo "✓ out/ generated"
