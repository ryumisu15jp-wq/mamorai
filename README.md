# MAMOR-AI（再開発 / Tauri デスクトップ版 MVP）— 試作ビルド

警備業向け業務管理アプリ MAMOR-AI を、React + Vite + Node/Express + Supabase を土台に **Tauri でラップした PC 専用デスクトップアプリ**として再開発するプロジェクトの試作（プロトタイプ）です。TRAID パイプライン（TDD 駆動）で Sprint 1〜4 を実装しました。

> **試作の前提**: 既存 MAMOR-AI の実データベース定義（25テーブルの実DDL）が未提供のため、DB スキーマは *推定* を含みます。Supabase への実接続・RLS・実 Claude 予測エンジン・OR-Tools 実装・Tauri 実ビルドは、実DDL提供後の「本採用フェーズ」で対応します。現状の共通ロジック層（`packages/input-core`）は **UI/DB 非依存の純粋 TypeScript** で完全にテスト済みです。

## モノレポ構成

```
packages/input-core/   共通入力ロジック層（純粋TS・UI/DB非依存・Expo再利用可）
  src/report/          日報: テンプレート解決/プリフィル/検証/モデル/承認WF/一覧/集計/出力
  src/risk/            リスク予測の分類・ランキング・フィルタ
  src/shift/           シフト/配置表/★拡張制約フレームワーク/AI最適化/HITL確定
  src/notify/          通知の対象別配信・未確認集計
  src/training/        資格の更新間近分類・研修達成率
  src/template/        テンプレートのセクションON/OFF
apps/desktop/          React + Vite フロント（10画面）＋ Tauri v2 スケルトン
server/                Node/Express ゲートウェイ（Claude鍵秘匿・シフト最適化・HITL確定）
supabase/migrations/   追加のみマイグレーション（0100/0102/0103, 破壊的変更なし）
spec/                  行動仕様(EARS)・アーキテクチャ(ADR)・DB設計・審査レポート
reports/               各Sprintの Evaluator 評価レポート
```

## 前提ツール

Node.js 20+ / pnpm 10+（Tauri 実ビルドには Rust も必要ですが、試作では不要）。

## セットアップ & 実行

```bash
pnpm install

# 共通ロジック層のテスト（264件・カバレッジ）
pnpm --filter @mamorai/input-core exec vitest run --coverage

# デスクトップUI（開発サーバ / ブラウザで確認可）
pnpm --filter @mamorai/desktop exec vite dev      # http://localhost:5173
pnpm --filter @mamorai/desktop exec vite build     # 本番ビルド（dist/）

# リスク/シフト最適化ゲートウェイ（Claude鍵はサーバ側env）
pnpm --filter @mamorai/server exec vitest run
#   実行時: CLAUDE_API_KEY 等の環境変数があれば実呼び出し、無ければモック
```

Tauri デスクトップとして起動する場合（Rust 導入後・本採用フェーズ）:

```bash
# 例: apps/desktop で
pnpm dlx @tauri-apps/cli dev     # WebView ラップで起動
```

## 主な設計ポイント

- **層分離**: 検証・集計・シフト最適化・制約評価・LLMパースは全て `@mamorai/input-core`（純粋関数）。UI/サーバはこれを呼ぶだけ。将来の Expo（スマホ）展開でロジックを再利用できます。
- **秘匿境界**: Claude API キーは Node/Express 側の環境変数のみ。フロントは Supabase anon と自サーバ API だけを参照。
- **AIシフト最適化**: 自然言語 → Claude で制約構造化 → 数理最適化で下案 → **管制員が確認して初めて確定（HITL、全自動確定なし）**。
- **拡張制約フレームワーク**: `legal`(国/労基)・`insurance`(保険)・`company`(会社)・`shift`・`other`/独自カテゴリを **データ駆動で追加可能**、各制約に hard/soft、評価器はレジストリで拡張。**評価器が無い hard 制約は "問題なし" にせず feasible=false（フェイルセーフ）**。
- **後方互換**: 既存25テーブルは破壊的変更なし。マイグレーションは追加列（NULL許容）／追加テーブルのみ。

## テスト状況（試作時点）

| パッケージ | テスト | 備考 |
|---|---|---|
| input-core | 264 / 264 GREEN | lines 99% / branches 91% / funcs 100% |
| server | 27 / 27 GREEN | ゲートウェイ整形・HITL・秘匿 ＋ 実DB統合(RLS往復) |
| desktop | 4 / 4 GREEN | Tauri 抽象の DI |

## 本採用フェーズ（実DDL提供後）の残作業

実RLS/認証、実 Claude 予測エンジン結線（OQ-05）、OR-Tools CP-SAT 差し替え、Tauri 実ビルド（WebView2）、E2E、UIコンポーネントテスト、Supabase 実接続。詳細は各 `reports/sprintN-evaluation.md` の「未検証事項」を参照。

## 本採用フェーズ（DB結合の実証）

実DDL未提供のため、**推定スキーマを正式スキーマとして確定**し、この環境で実 Postgres を立てて DB結合・RLS・データ往復を「本物として」実証しました（実Supabase不要）。

- マイグレーション（適用順）: `0000_base_assumed.sql`（推定既存ベース）→ `0100/0102/0103`（追加のみ）→ `0200_rls.sql` + `0202_rls_hardening.sql`（現場スコープRLS）→ `0201_app_role.sql`（最小権限ロール）。
- ロール分離: `app_client`（一般・RLS従属）と `app_service`（AI経路=群Bの書込のみ特権）。**アプリは必ず app_client（非superuser）で接続**（superuserはRLSをバイパスするため）。
- データアクセス層: `server/src/db/`（`withUser`=リクエストごとに `set local app.user_id` でRLSを効かせる、`withService`=app_service別接続）。ロジック/検証は `@mamorai/input-core` に委譲。
- 実証済み（実クエリ・統合テスト）: 担当外現場データは全テナント表で **0件**、越境INSERT拒否、群B書込は app_service のみ（app_client はセッション変数を偽装しても不可）、日報の作成/取得/承認WFが実DBで往復。検証ログ: `reports/rls-hardening-verification.txt`, `reports/production-phase-evaluation.md`。

ローカルでDBを立てて再現する例:
```bash
/usr/lib/postgresql/16/bin/initdb -D /var/lib/pgtest -U postgres --auth=trust
/usr/lib/postgresql/16/bin/pg_ctl -D /var/lib/pgtest -o "-p 5433" start
psql -h 127.0.0.1 -p 5433 -U postgres -tAc "create database mamorai;"
for f in 0000_base_assumed 0100_report_additive 0102_shift_additive 0103_notify_training_additive 0200_rls 0201_app_role 0202_rls_hardening; do \
  psql -h 127.0.0.1 -p 5433 -U postgres -d mamorai -v ON_ERROR_STOP=1 -f supabase/migrations/$f.sql; done
pnpm --filter @mamorai/server exec vitest run   # 実DB統合テスト
```

**実DDL提供後の差替え点（隔離済み）**: `0000_base_assumed.sql` を実25テーブルDDLへ置換 / `app_user_site_ids()` を `auth.uid()` ベースへ / `app_client`・`app_service` を Supabase auth・service_role JWT へ結線 / `DATABASE_URL(_SERVICE)` を実値へ。
# mamorai
