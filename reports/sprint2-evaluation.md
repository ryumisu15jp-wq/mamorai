# TRAID Sprint2 敵対的評価レポート（Adversary 兼 Evaluator #17）

- 対象: MAMOR-AI Sprint2（承認ワークフロー / 一覧 / 集計 / 月報出力 / リスク連携）
- 方式: Fresh Context 敵対的レビュー + 静的裏取り（grep）+ テスト実測再実行
- 日付: 2026-08-11
- **総合判定: PASS（条件付き — MEDIUM 5件の是正を次スプリント条件とする）**

---

## 1. サマリー（客観結果）

### スコープ / 成果物
| 層 | 成果物 |
|---|---|
| input-core | `report/{workflow,search,aggregate,exportTable,monthDays}.ts`, `risk/view.ts`, `types.ts` Sprint2型追加 |
| server | `routes/risk.ts`（予測ゲートウェイ）, `index.ts`（Express+CORS） |
| UI | `App.tsx`, `features/{month/MonthlyReport,report/ReportList,risk/RiskRanking,risk/riskClient}` |
| DB | 追加マイグレーションなし（既存 `0100_report_additive.sql` を継続使用） |

### テスト / カバレッジ / ビルド（実測）
| 項目 | 結果 |
|---|---|
| input-core テスト | **137 passed / 137**（14ファイル、うち Sprint2 `s2_*` = 5ファイル・78件） |
| input-core カバレッジ | **Stmts 100% / Funcs 100% / Lines 100% / Branch 93.13%**（目標90%↑ 達成） |
| Sprint2ファイル branch | aggregate 91.42% / view 92.3% / workflow・search・exportTable・monthDays 100% |
| server テスト | **3 passed / 3**（risk.test.ts） |
| UI テスト | **0件（apps/desktop にテストファイル無し）** |
| Secrets 静的走査 | ハードコード鍵 **検出0**。dist バンドルに実鍵リテラル無し（`sk-ant-…`/`sk-…` 0件、`VITE_RISK_API_BASE` のみ） |
| dangerouslySetInnerHTML / eval | **0件**（apps ソース） |
| マイグレーション破壊操作 | drop/rename/NOT NULL/truncate = **0件**（`add column if not exists`・`create table if not exists` のみ） |

---

## 2. 指摘リスト（重大度別）

### CRITICAL: 0 件
### HIGH: 0 件

### MEDIUM
- **M1 [correctness/coverage] `aggregate.ts:aggregateCounters`** — `report.values` の全セクション（meta/table/gate/check 含む）の数値を無差別に合算しており、REQ-010 が意図する **counter セクション限定ではない**。`values` は section.id→field→value のみ保持し kind 情報が無いため、構造的に counter を判別できない。table の数量列や数値化された time 等が混入すると `totalResponses`・`dailyTrend.count` が過大計上。**テストは `counter` セクションのみ投入しており本欠陥を検出できない（トートロジー隣接の網羅欠落）**。修正: 集計対象キー/セクションを `AggregateConfig` で明示ホワイトリスト化、または values に kind を持たせる。
- **M2 [correctness/spec] `aggregate.ts:monthlySummary` approvalRate 分母** — 分母=提出済+承認済+差し戻し（下書き/未作成を除外）。**OQ-04 未解決**のままの暫定定義で、現場が「全対象日に対する承認率」を期待するとズレる。ゼロ除算は `denom===0?0` で回避済み（適切）。修正: RYUGEN に OQ-04 確定を仰ぎ、定義をコメント/型から乖離させない。
- **M3 [coverage/i18n] `search.ts:keywordHit`** — `toLowerCase()` のみで **全角英字（ＥＬＶ）↔半角（ELV）や NFKC 正規化が未対応**。ASCII 大小のみテスト済で全角ケースの網羅欠落。日本語現場では全角入力が現実的。修正: `normalize('NFKC').toLowerCase()`。
- **M4 [security] `server/index.ts` + `routes/risk.ts`** — `/api/risk` に **認証・レート制限が無い**。CORS は `localhost:5173` 限定で過剰許可ではない（良）が、CORS はブラウザ外クライアントを止めない。実 Claude エンジン結線後は**課金消費・DoS 濫用の経路**になる。現状モックのため実害は無いがゲート化前提で MEDIUM。修正: サーバ間トークン/セッション検証 + レート制限（実エンジン有効化と同時）。
- **M5 [coverage] server / UI テスト空白** — server は 502 catch 分岐・`createMockPredictionEngine`・`resolvePredictionEngine` 実 fetch 分岐・`createRiskRouter` が未テスト。UI（4画面）はテスト 0 件。カバレッジ閾値も未設定。層としての回帰検知力が弱い。

### LOW
- **L1 [robustness] `monthDays.ts:daysInMonth`** — 'YYYY-MM' 書式検証なし。非数値月 → `NaN` → `monthDates` 空配列を無言で返す（'2026-13' 等も 31日として通す）。UI は固定値渡しで現状無害だが将来のバグ源。
- **L2 [consistency] `view.ts:filterRisks`** — 同点時の明示タイブレーク無し（V8 の安定ソート依存）。`rankRisks` は `id.localeCompare` で契約化しているのに `filterRisks` は未明示で契約が不一致。RiskRanking では rank→filter の順で実害無し。
- **L3 [coverage] `view.ts:fromPredictionResponse`** — type/position/probability 欠落時の既定分岐（''/0）が未テスト（branch 92.3% の穴、行35-37）。「不正入力」網羅の主張に対し不足。
- **L4 [smell] `RiskRanking.tsx:RiskRow`** — input-core 付与済み `item.level` を無視し `classifyRisk(item.score)` で再導出。同一純関数なので発散はしないが冗長。

### タイムゾーン / 純粋性の確認（問題なし）
- `monthDays` は `Date.UTC` 固定・現在時刻非依存で **UTC/ローカルの日ズレ無し**。うるう年 2024-02=29、2026-02=28 を実測確認。
- `transitionReport` は状態×アクション 16 通りを網羅テスト、許可4遷移のみ実行し他は throw、入力非破壊（新オブジェクト返却）を確認。承認済は終端（穴なし）。
- `incidentBreakdown` 前月比: 前月なし=null / 増=正 / 減=負 / 同数=0 を実測確認。

---

## 3. 5ゲート判定表

| # | ゲート | 判定 | 根拠 |
|---|---|---|---|
| ① | テスト全GREEN | **PASS** | input-core 137/137、server 3/3 が全 GREEN。RED/失敗ゼロ。※UI はテスト 0 件（未整備、既存テストの失敗ではない） |
| ② | カバレッジ | **PASS** | input-core Branch 93.13%（≥90%）、Stmts/Funcs/Lines 100%。Sprint2 各ファイルも ≥91%。※server/UI は閾値外（M5） |
| ③ | 層分離 / 純粋性 | **PASS** | Sprint2 input-core は react/react-native/@supabase/window/document 非参照を静的走査テストで実証。risk/view.ts は Claude/anthropic/apiKey/fetch/axios/process.env 非参照。server・UI とも整形は `fromPredictionResponse` を再利用し集計/遷移/写像をUI/サーバに再実装していない |
| ④ | 秘匿境界 / Secrets | **PASS** | 実鍵ハードコード 0。鍵は `process.env.CLAUDE_API_KEY` のみ・server の Authorization ヘッダ内でのみ使用。レスポンスは整形済 `RiskItem[]` のみ（許可フィールド通過）で鍵混入をテスト実証。dist バンドルに鍵リテラル無し。フロントは必ず `/api/risk` 経由（riskClient は VITE_RISK_API_BASE のみ、エンジン直叩き無し）。CORS は localhost 限定で過剰許可なし。※認証/レート制限欠如は M4（漏洩ではなく濫用リスク） |
| ⑤ | 後方互換（NFR-01） | **PASS** | Sprint2 新規マイグレーション無し。既存 `0100_report_additive.sql` は `add column if not exists` / `create table if not exists` のみで破壊操作・既存列 NOT NULL 追加ゼロ。`DailyReport.legacyExtras` で未知フィールド保全 |

**5ゲート全通過 → 総合 PASS**

---

## 4. 総合判定と次アクション

**総合判定: PASS（条件付き）**。CRITICAL/HIGH ゼロ、5ゲート全通過。ただし MEDIUM 5件は次スプリント着手条件として是正すること。

次アクション（優先順）:
1. **M1**: `aggregateCounters` の集計対象を counter へ限定（config ホワイトリスト or values に kind 付与）+ 非 counter 数値混入を落とす回帰テスト追加。
2. **M2**: OQ-04（承認率分母）を RYUGEN に確定依頼し、定義を実装/型/UIで一致させる。
3. **M4**: 実 Claude エンジン結線と同時に `/api/risk` へ認証+レート制限（billing 保護）。
4. **M3**: keyword を NFKC 正規化。**M5**: server の 502/engine 分岐と UI 主要導線のテスト整備、カバレッジ閾値設定。
5. LOW（L1 月書式検証 / L2 filterRisks タイブレーク明示 / L3 既定分岐テスト）は着手容易・低コストで併せて処理。

FAIL ではないため差し戻し不要。Chief Secretary へは「PASS・MEDIUM5件を次スプリント条件」で報告推奨。

---

## 5. 未検証事項（正直な列挙）

- **実 DDL / DB 結合**: Supabase 直結 SELECT はスタブ（UI は demo データ）。RLS クロスユーザー分離（NFR-03 の RLS 部分）は本 Sprint 範囲外・未検証。
- **実 Claude 予測 I/F（OQ-05）**: `resolvePredictionEngine` の実 fetch 分岐（view.ts 相当の server 側 fetch）は env 未設定のため未実行・未テスト。実 I/F 仕様未確定。
- **Tauri 実ビルド**: `dist/` は存在するが WebView2 での実バイナリ結合・起動は未確認。
- **PDF / Excel 実生成**: `buildMonthlyExportTable` の中間 ExportTable まで。実バイナリ生成は Tauri 結合時スタブ（OQ-07 帳票様式未確定）。
- **UI 自動テスト / E2E**: apps/desktop はユニット/E2E とも 0 件。画面挙動は目視相当のみ。

---

## Orchestrator 追記: バックログ登録（Sprint3 是正条件）
Sprint2 は PASS。以下 MEDIUM を Sprint3 着手時の是正条件としてバックログ先頭に登録（即時修正はしない＝HIGH以上のみ即修正の方針）。
- **M1**: `aggregateCounters` が全数値を無差別合算。counter セクション限定にするためテンプレート情報を引数に取る設計へ（REQ-010 忠実化）。現デモ/テストでは counter のみ数値のため実害なし。
- **M4**: `/api/risk` に認証・レート制限が無い。実 Claude 予測エンジン結線（OQ-05）前に必須。
- **M2** ほか: Evaluator 本文参照。
未解決の人間判断: 承認率の分母定義（OQ-04）、1分日報必須項目（OQ-01/UQ-03）、既存25テーブル実DDL（UQ-01）。
