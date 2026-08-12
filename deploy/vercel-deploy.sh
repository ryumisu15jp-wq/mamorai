#!/usr/bin/env bash
# MAMOR-AI を Vercel 本番へ配信。VERCEL_TOKEN を環境変数で渡す。
#   例: VERCEL_TOKEN=xxxx bash deploy/vercel-deploy.sh
# out/ は build-web.sh で組み立て済み（/=サービス, /lp=LP, /app=SPA, vercel.json=rewrite）。
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
SCOPE="ryumisu15jp-7155s-projects"
PROJECT="mamorai"

: "${VERCEL_TOKEN:?VERCEL_TOKEN が未設定です}"

# 最新の配信物を組み立て直す
bash "$ROOT/deploy/build-web.sh"

# 静的配信（out/ をそのままアップロード。vercel.json の rewrite が有効）
cd "$ROOT/out"
vercel deploy --prod --yes \
  --token "$VERCEL_TOKEN" \
  --scope "$SCOPE" \
  --name "$PROJECT"
