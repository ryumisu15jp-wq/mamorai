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
# アプリ本体(SPA) を /app 配下へ
cp -r "$ROOT/apps/desktop/dist/." "$OUT/app/"
# vercel設定
cp "$ROOT/deploy/vercel.json" "$OUT/vercel.json"

echo "✓ out/ を生成しました（このディレクトリをホスティングに配信）"
echo "   /            = サービスページ"
echo "   /lp          = LP"
echo "   /co/ /s/ /tradmin/ = アプリ(SPA, /app/ にフォールバック)"
