#!/usr/bin/env bash
# MAMOR-AI Web配信物を out/ に組み立てる。
#   /            → サービスページ (web/index.html)
#   /lp          → LP (web/lp.html)
#   /co /s /tradmin → 管理コンソールSPA を /console/ 配下に配置（ログイン導線）
#   /app         → 勤務員PWA（スタッフ向けモバイルアプリ, インストール可能）
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
OUT="$ROOT/out"

echo "▶ input-core build"
pnpm --filter @mamorai/input-core build >/dev/null

echo "▶ 管理コンソールSPA build (base=/console/)"
VITE_BASE=/console/ pnpm --filter @mamorai/desktop build >/dev/null

echo "▶ 勤務員PWA build (base=/app/)"
pnpm --filter @mamorai/desktop build:pwa >/dev/null

echo "▶ assemble out/"
rm -rf "$OUT"
mkdir -p "$OUT/console" "$OUT/app" "$OUT/lp"
# マーケティング(静的)
cp "$ROOT/web/index.html" "$OUT/index.html"
cp "$ROOT/web/lp.html"    "$OUT/lp/index.html"   # cleanUrls: /lp で解決
# ブランド素材（ファビコン/アプリアイコン/OG/ロゴ/manifest）をサイトルートへ
cp "$ROOT/web/favicon.ico" "$ROOT/web/favicon-16.png" "$ROOT/web/favicon-32.png" \
   "$ROOT/web/apple-touch-icon.png" "$ROOT/web/icon-192.png" "$ROOT/web/icon-512.png" \
   "$ROOT/web/icon-maskable-512.png" "$ROOT/web/logo-mark.png" "$ROOT/web/og-image.png" \
   "$ROOT/web/logo-full.png" "$ROOT/web/logo-full@2x.png" \
   "$ROOT/web/site.webmanifest" "$OUT/"
# 管理コンソールSPA を /console 配下へ
cp -r "$ROOT/apps/desktop/dist/." "$OUT/console/"
# 勤務員PWA を /app 配下へ（エントリを index.html にリネーム）
cp -r "$ROOT/apps/desktop/dist-pwa/." "$OUT/app/"
if [ -f "$OUT/app/pwa.html" ]; then mv "$OUT/app/pwa.html" "$OUT/app/index.html"; fi
# 3系統ログインを物理ファイルで実配置（Vercelのrewriteに依存しない確実な方式）。
# 管理indexは資産を /console/assets/... の絶対パスで読むため、各パス直下に置いても動作する。
for p in co s tradmin; do
  mkdir -p "$OUT/$p"
  cp "$OUT/console/index.html" "$OUT/$p/index.html"
done
# vercel設定
cp "$ROOT/deploy/vercel.json" "$OUT/vercel.json"

echo "✓ out/ を生成しました（このディレクトリをホスティングに配信）"
echo "   /              = サービスページ"
echo "   /lp            = LP"
echo "   /co /s /tradmin = 管理コンソール(SPA, /console/)"
echo "   /app           = 勤務員PWA"
