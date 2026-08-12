# Sprint4 敵対的評価レポート — 通知 / 教育・資格 / テンプレート設定 / Tauri統合

- 評価者: TRYANGROW Adversary 兼 Evaluator (#17) — Fresh Context
- 対象: REQ-022〜025, NFR-01
- 日付: 2026-08-11
- 判定: **PASS**（CRITICAL 0 / HIGH 0 / MEDIUM 2 / LOW 5。ブロッカーなし）

---

## サマリー

Sprint4 の 4 REQ は、ロジックを `@mamorai/input-core` の純粋関数に集約し、UI は委譲に徹する層分離が厳守されている。テストは **input-core 262 / desktop bridge 4 = 全266件 GREEN**、input-core・desktop とも `tsc --noEmit` はエラー 0。カバレッジは全体 Stmts 99% / Branch 91.32%、Sprint4 実装ファイルは Branch 92〜100%。マイグレーション 0103 は静的走査で破壊的DDL 0（additive-only）。ハードコード秘密・`dangerouslySetInnerHTML` は検出なし。

誤配信防止（REQ-022）は fail-closed 設計、資格分類（REQ-023）は UTC固定で境界正確、テンプレOFF（REQ-024）は非破壊コピー＋`resolveForm`除外が機能し、**過去集計は DailyReport.values 側に独立して存在するため OFF の影響を受けない設計**。Tauri抽象（REQ-025）は DI で不在時 no-op/フォールバックが検証済み。

重大な欠陥はない。是正推奨は「本番前の CSP 設定（M1）」と「REQ-024 過去集計非破壊の直接テスト追加（M2）」。

---

## 指摘リスト（重大度別）

### CRITICAL
なし。

### HIGH
なし。

### MEDIUM

**M1 [security] `tauri.conf.json` の `security.csp: null`（CSP無効）**
- 場所: `apps/desktop/src-tauri/tauri.conf.json` → `app.security.csp`
- WebView は local `dist/` をロードし、`supabaseClient` 経由で外部（Supabase anon）へ接続しうる。CSP 未設定は XSS/外部読込に対する多層防御の欠落。現状は Rust コマンドがスタブ・実接続未有効化のため実害は限定的だが、**本番配布前に restrictive CSP（connect-src を Supabase/ゲートウェイに限定）を必須化**すべき。秘密の露出ではないためゲート④は通すが要是正。

**M2 [test-coverage] REQ-024「過去集計が壊れない」の直接テストが不在**
- 場所: `packages/input-core/src/__tests__/s4_template.test.ts`
- `applyTemplateConfig`/`resolveForm` の OFF除外・元template非破壊は検証済み。しかし「セクションOFF後に既存 DailyReport を集計（MonthlySummary/IncidentBreakdown）しても数値が不変」というシナリオの明示テストがない。アーキ上 aggregate は template.enabled を参照せず DailyReport.values を読むため設計的に非破壊だが、回帰保護のため OFF→過去集計不変のテストを1件追加推奨。

### LOW

**L1 [purity] `applyTemplateConfig` の shallow copy — `fields` 配列が元templateと参照共有**
- 場所: `packages/input-core/src/template/config.ts`（`{ ...s }`）
- `enabled` のみ変更するため現状は安全（fields を後段で破壊するコードなし）。ただし将来 `applied.sections[i].fields` を破壊すると元テンプレへ波及する潜在リスク。ドキュメント化かフィールドまでの複製を検討。

**L2 [robustness] `buildDelivery` が `confirmedIds` を重複除去しない**
- 場所: `packages/input-core/src/notify/model.ts`
- 同一IDが重複すると confirmed が過大・unconfirmed が過小になる。DB の `unique(notification_id, staff_id)`（0103）で実運用は担保されるが、純関数として `Set` 化していない。

**L3 [correctness] scope='workType'/'role' で対象値 undefined のとき、当該属性が undefined の利用者に一致**
- 場所: `packages/input-core/src/notify/model.ts`
- fail-narrow（属性欠落者のみ）で「全員誤配信」にはならず、UI は常に既定値を供給するため実害なし。ただし属性未設定利用者への意図せぬ配信の余地。

**L4 [coverage] 防御的分岐の未到達**
- notify/model.ts L24（`default: matched=false`：型union上到達不能な防御コード）、training/model.ts L59（`ratio<0`：負のcompletedHours、実運用外）。いずれも防御的で許容範囲。

**L5 [data-model] `staff_qualifications` が `valid_until`(0102) と `expires_on`(0103) の二重の期限列を持つ**
- 場所: `supabase/migrations/0103_...sql`
- additive で後方互換は保たれるが期限列が二本立てになり曖昧。`classifyQualification` は `expires_on` 系を使う想定。将来の統一方針をメモ推奨。

---

## 5ゲート判定表

| # | ゲート | 判定 | 根拠 |
|---|--------|------|------|
| ① | テスト全GREEN | **PASS** | input-core 262 + desktop bridge 4 = 266件全通過。s4_notify(14)/s4_training(13)/s4_template(7)/s4_purity(3)/tauriBridge(4) を個別再実行し確認。 |
| ② | カバレッジ | **PASS** | 全体 Stmts 99% / Branch 91.32%。Sprint4: template 100/100、training 100/93.75、notify 97.67/92.3。未達分岐は防御的コードのみ（L4）。REQ-024 過去集計非破壊の直接テストは要追加（M2）。 |
| ③ | 層分離 / 純粋性 | **PASS** | notify/training/template は `../types.js` のみ import、React/DB/window/Date.now/Math.random 不参照（s4_purity 静的テストで強制）。日付はUTC固定決定論。input-core・desktop とも tsc エラー0。UI は input-core へ委譲。 |
| ④ | 秘匿境界 / Secrets | **PASS**（要是正 M1） | ハードコード秘密なし（anonキーは `import.meta.env`）、`dangerouslySetInnerHTML` なし、service_role はサーバ限定方針。Tauri capabilities は最小（fs/shell/http 過剰付与なし）。ただし `csp:null` は本番前に是正すべき多層防御ギャップ。 |
| ⑤ | 後方互換 (NFR-01) | **PASS** | 0103 は DROP/RENAME/ALTER TYPE/NOT NULL/TRUNCATE/DELETE を含まず（静的走査 0件）。新規5テーブルは `create table if not exists`、`staff_qualifications` は 0102 作成済みへ `add column if not exists` の冪等追加、index も `if not exists`。RLS policy は本ファイルで張らず既存結合時に付与（追加のみ厳守）。 |

---

## 総合判定: **PASS**

5ゲート全通過。CRITICAL/HIGH ともに 0。誤配信防止・資格分類境界・テンプレOFF非破壊・Tauri抽象いずれも仕様を満たし、実装品質・テスト規約（AAA/境界/純粋性）ともに高い。MEDIUM 2・LOW 5 は次スプリント/本番前対応で足りる非ブロッカー。

### 次アクション（優先順）
1. **M1**: 本番配布前に `tauri.conf.json` へ restrictive CSP を設定（connect-src を Supabase/ゲートウェイ限定）。
2. **M2**: 「セクションOFF後の過去 DailyReport 集計が不変」テストを s4_template に1件追加。
3. **L2/L1**: `buildDelivery` の confirmedIds を Set 化、`applyTemplateConfig` の fields 共有をコメント明記。
4. **L5**: `valid_until` と `expires_on` の統一方針を database-design.md に追記。
5. 実DB結合時に通知/資格/研修/テンプレ設定テーブルへ現場スコープ RLS を付与（0103は未付与）。

---

## 未検証事項（本評価の範囲外・別工程で確認）

- **実DDL/RLS**: 既存25テーブルの実スキーマは未提供（OQ-DB1）。0103 の緩い参照（FKなし）・RLSポリシーは実DB結合時に要検証。クロスユーザー分離は未テスト。
- **Tauri 実ビルド**: `cargo build`/`tauri build` は本スプリント非実行（設定・雛形のみ）。WebView2 実挙動・msi/nsis バンドルは未検証。
- **実 updater / OSダイアログ**: `save_file`/`print`/`check_update` は `Ok(None)`/`Ok(())` のスタブ。保存ダイアログ・PDF/Excel実バイナリ生成・自動更新の実装は Tauri 結合時。
- **E2E**: ユーザーフロー（通知作成→配信、資格アラート、テンプレOFF→フォーム反映、保存/印刷）の実機E2Eは未実施。
- **秘密の実行時露出**: フロントバンドルへのキー混入は静的スキャンのみ（バンドル出力の実査は未実施、ただし env 参照設計で低リスク）。

---
## Orchestrator 追記: MEDIUM 即時是正
- **M2 CLOSED**: REQ-024「過去集計の非破壊」の直接回帰テストを追加（`s4_template_regression.test.ts`）。applyTemplateConfigでcounterをOFF後も aggregateCounters/monthlySummary が不変、元template/元section非破壊を検証。
- **M1 CLOSED(暫定)**: `apps/desktop/src-tauri/tauri.conf.json` の `csp:null` を制限CSP（default-src 'self' 等）に変更。実配布時に接続先へ合わせ最終調整。
最終: input-core 264/264 GREEN。
