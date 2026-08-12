#!/usr/bin/env bash
# MAMOR-AI Web配信物を out/ に組み立てる。
#   /            → サービスページ (web/index.html)
#   /lp          → LP (web/lp.html)
#   /co /s /tradmin → SPA(アプリ本体) を /app/ 配下に配置し、vercel.json のrewriteでフォールバック
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
# マーケティング(静的)
cp "$ROOT/web/index.html" "$OUT/index.html"
cp "$ROOT/web/lp.html"    "$OUT/lp/index.html"   # cleanUrls: /lp で解決
# ブランド素材（ファビコン/アプリアイコン/OG/ロゴマーク/manifest）をサイトルートへ
cp "$ROOT/web/favicon.ico" "$ROOT/web/favicon-16.png" "$ROOT/web/favicon-32.png" \
   "$ROOT/web/apple-touch-icon.png" "$ROOT/web/icon-192.png" "$ROOT/web/icon-512.png" \
   "$ROOT/web/icon-maskable-512.png" "$ROOT/web/logo-mark.png" "$ROOT/web/og-image.png" \
   "$ROOT/web/logo-full.png" "$ROOT/web/logo-full@2x.png" \
   "$ROOT/web/site.webmanifest" "$OUT/"
# アプリ本体(SPA) を /app 配下へ
cp -r "$ROOT/apps/desktop/dist/." "$OUT/app/"
# 3系統ログインを物理ファイルで実配置（Vercelのrewriteに依存しない確実な方式）。
# アプリindexは資産を /app/assets/... の絶対パスで読むため、各パス直下に置いても動作する。
for p in co s tradmin; do
  mkdir -p "$OUT/$p"
  cp "$OUT/app/index.html" "$OUT/$p/index.html"
done
# vercel設定
cp "$ROOT/deploy/vercel.json" "$OUT/vercel.json"

echo "✓ out/ を生成しました（このディレクトリをホスティングに配信）"
echo "   /            = サービスページ"
echo "   /lp          = LP"
echo "   /co/ /s/ /tradmin/ = アプリ(SPA, /app/ にフォールバック)"
