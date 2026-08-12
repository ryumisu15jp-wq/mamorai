# MAMOR-AI Sprint3 敵対的評価レポート（Adversary 兼 Evaluator #17）

- 対象: シフト表 / 日次配置表 / 拡張制約フレームワーク / AIシフト最適化(HITL)（REQ-016..021）
- 実施: Fresh Context・実ファイル走査・静的grep・テスト/型チェック再実行
- 最新判定: **retry1 → 総合判定 PASS**（下記「retry1 再判定」節を参照。初回はFAIL）

> 本ファイルは複数回判定を積層記録する。以下「## 初回(FAIL)」は初回評価の全文（保存）。
> 最新の是正後判定は末尾「## retry1 再判定」節を参照。

---

## 初回(FAIL)

- 日付: 2026-08-11
- **総合判定: FAIL**（CRITICAL 1件 / HIGH 5件。ゲート② カバレッジ FAIL）

---

## 1. サマリー（客観結果）

| 項目 | 結果 |
|---|---|
| input-core テスト | **201 passed / 201**（21ファイル）✅ |
| server テスト | **8 passed / 8**（shift-optimize 5, risk 3）✅ |
| tsc（input-core / server, --noEmit） | いずれも **exit 0**（型エラーなし）✅ |
| カバレッジ（全体） | Stmts 95.38% / **Branch 89.47%** / Funcs 98.55% / Lines 95.38% |
| カバレッジ（shift層） | Lines 91.15% / Branch 85.64%。**optimize.ts は Lines 75.2% / Branch 79.48%** |
| Secrets ハードコード | 検出なし（`process.env` 経由のみ、core は purity テストで env/fetch/apiKey 参照禁止を強制）|
| migration 0102 | additive-only（`create ... if not exists` / `add column if not exists`(NULL可) / `create index if not exists`）。破壊的DDLなし ✅ |
| 実ビルド（Tauri/Vite）・DB結合・実Claude・OR-Tools | **未検証**（後述） |

成果物は「純粋・決定論」の設計思想を概ね守り、テストは全GREEN。しかし**最重要の安全要件（未登録hard制約の扱い・勤務間隔hard制約の実装・説明の正当性）に CRITICAL 級の穴**があり、これがテストで検出されていない（テストが不安全挙動を"正"として追認している）。

---

## 2. 指摘リスト（重大度別・修正場所つき）

### CRITICAL

**C1. 未登録hard制約が"違反なし・feasible=true"で素通りし、勤務間隔(min_rest_hours)hard制約が完全に無視される — かつ説明が「充足済」と虚偽表示する**
- 場所:
  - `packages/input-core/src/shift/constraints.ts` :: `evaluateConstraints`（`if (evaluator === undefined) continue` で未登録kindを無言スキップ）
  - `packages/input-core/src/shift/optimize.ts` :: `generateDraft`（`satisfied: hardLabels` を全割付に無条件付与） / `candidateHardConflict`（`default: break` で未知kindを無視）
  - レジストリ `registry`（`min_rest_hours` の評価器が**存在しない**）
- 事実:
  - `min_rest_hours`（勤務間隔＝労基インターバル）は types.ts の第一級 `ConstraintKind` であり、REQ-018/019 の EARS に**明示的に列挙**され（「勤務間隔」）、REQ-019 のテスト可能性でも「資格・勤務間隔・必要人数」を検証対象と明記。さらに **server の mock Claude(`claude.ts`)は `min_rest_hours` を severity:'hard'(労働基準法)で生成する**。
  - にもかかわらず `min_rest_hours` の評価器はレジストリ未登録、`candidateHardConflict` にも case なし。
  - 結果: hard な勤務間隔制約は (a) 生成で回避されず、(b) `evaluateConstraints` で無言スキップ→ `hardViolations=0` → **`feasible=true`**、(c) `generateDraft` が `satisfied = hardLabels`（全hardラベル）を全割付に付けるため、**「勤務間隔11時間以上」を"充足した"と各割付が虚偽表示**する。
  - これは spec が High リスクと明記する「制約の取りこぼし＝違法・不当な配置に直結」そのもの。任意の未登録hard kind（会社独自の絶対制約等）でも同様に危険配置を許す。s3_constraints の「未登録kind_違反を出さず安全にスキップする」テストが、この**危険挙動を"安全"として追認**している。
- 修正提案:
  1. `evaluateConstraints` は未登録kindを無言スキップせず、**severity==='hard' の未登録kindは feasible を落とす**（例: `unenforced` 違反を hardViolations に push、または結果に `unenforcedHardKinds[]` を返し呼出側が確定不可にする）。soft未登録のみ警告スキップ可。
  2. `min_rest_hours` の評価器と `candidateHardConflict` のcaseを実装する。ただし現行 `ShiftCell`/`DraftAssignment` は勤務の開始/終了時刻を持たない（H4参照）ため、**まずモデルに時間帯を追加**しないと勤務間隔は評価不能。
  3. `generateDraft.satisfied` は「その割付で実際に検証・充足した制約」のみを列挙する（全hardラベルの無条件コピーを廃止）。

### HIGH

**H1. 説明可能性(REQ-021)の誤誘導: `satisfied` が全hardラベルの無条件コピー**
- 場所: `optimize.ts` :: `generateDraft`（`satisfied: hardLabels`）
- 各割付が、その割付と無関係な hard 制約（他ポジションの資格要件、未評価の勤務間隔 等）まで「充足」と主張する。REQ-021「説明が実際の割付根拠と乖離すると誤誘導」に直接抵触。null割付は `satisfied:[]` で妥当だが、非null割付の satisfied は信頼できない。C1と同根。

**H2. 最適化の安全中核（greedyのhard回避）が無テスト — optimize.ts Lines 75.2%/Branch 79.48%**
- 場所: `optimize.ts` :: `candidateHardConflict` の `max_consecutive_days` / `max_weekly_hours` 分岐（カバレッジ未到達行）
- s3_optimize のテストは headcount / qualification / day_off_request のみ。**連勤上限・週労働上限の貪欲回避ロジックは1件も検証されていない**。REQ-019「生成割付が全ハード制約を違反しない」の核心が未担保。ちょうど連勤(=days境界)・週境界での generateDraft 回避テストが欠落。

**H3. HITL確定/反映がブラウザ側で実行され、サーバ確定RPC(/api/shift/confirm)を迂回（ADR-008違反）**
- 場所: `apps/desktop/src/features/shift/AiOptimizer.tsx` :: `handleConfirm`（`confirmOptimizationRun`/`applyConfirmedRun` をクライアントで直接呼ぶ）／`shiftClient.ts`（`/structure`・`/optimize` は呼ぶが **`/confirm` を一切呼ばない**）
- REQ-020設計注記/ADR-008 は「確定操作・書込は service_role の Node/Express 専用RPC経由に限定、クライアント直結を許さない」と規定。サーバ側 `createConfirmHandler` は実装済みだが**UIから未使用**。現状はDB永続化が無く `applyConfirmedRun` はメモリ上 ShiftCell 生成に留まるため実害は未発生だが、**DB結合時にこのままだとクライアント直書きの抜け道**になる。確定は必ずサーバ経由に統一すべき。
- ※ HITLの論理ゲート自体は健全: `confirmOptimizationRun` は `reviewed!==true` と二重確定を throw で拒否し、UI無効化に依存しない。UIを迂回しても reviewed=true 無しでは確定不可。**自動確定の抜け道は論理層には無い**。

**H4. データモデルに勤務時間帯が無く、勤務間隔(min_rest_hours)が構造的に表現不能**
- 場所: `types.ts` :: `ShiftCell`（workType のみ、開始/終了時刻なし）/ `DraftAssignment`
- 労基インターバルは「連続する勤務の終了→次勤務開始の時間差」で判定するが、モデルは日付+区分のみで時刻を持たない。REQ-018/019 が名指しする hard 制約が、現行モデルでは実装不能。C1の根本原因の一つ。

**H5. 0102 の AI経路テーブルに実RLSが無く（方針コメントのみ）、confirm エンドポイントも無認証・reviewedは自己申告**
- 場所: `supabase/migrations/0102_shift_additive.sql`（RLSポリシー DDL なし）／`server/src/routes/shift-optimize.ts` :: `createConfirmHandler`（認証・レート制限なし、`reviewed===true` はリクエストボディの自己申告）
- 「クライアントSELECTのみ / service_role書込」は**コメントで明記**（gate⑥の文書要件は充足）だが、実ポリシーは「DB結合時に付与」として全面 defer。現状は新規テーブルに RLS が一切かからない。confirm も誰でも到達すれば `reviewed:true` を送るだけで（永続化後は）任意シフトを反映し得る。NFR-03/ADR-008 の実効的担保は未達（実装は次段だが、リスクとして明記）。

### MEDIUM

- **M1. グローバル可変レジストリの状態漏れ**: `constraints.ts` の `registry`(module-level Map) を `registerConstraintEvaluator` が破壊的変更。reset/unregister API なし。テストが `my_org_rule`/`my_org_rule_2` を登録し、プロセス内で永続。長時間稼働サーバでの累積・上書き、テスト間漏れの温床。"純粋"を掲げる層の唯一の共有可変状態。→ 依存注入 or ベースMap複製で分離推奨。
- **M2. applyConfirmedRun が feasibility を再検証しない**: `finalize.ts`。hard違反を含む(feasible=false)ランでも status='確定' なら反映してしまう。HITLの人間オーバーライドとして意図的なら、確定時に警告/明示同意を要求すべき。
- **M3. confirm がクライアント供給の `run`(draft) を無検証で信頼**: `shift-optimize.ts`。サーバ側で draft を再評価せず applyConfirmedRun するため、永続化後は改竄された割付をそのまま反映可能。
- **M4. insurance_weekly_hours を candidateHardConflict が扱わない**: hard指定時、生成は回避しないが evaluate は違反検出 → generate/evaluate 非対称（安全側だが over-infeasible）。

### LOW

- **L1**: ルート `pnpm test` は `packages/**` のみ実行。**server テストは標準スクリプト外**（別途 `pnpm --filter @mamorai/server test`）。CI で server テスト未実行リスク。
- **L2**: browser `localMockStructure`(shiftClient) と server `createMockCallClaude`(claude.ts) が乖離（browser側に min_rest_hours 分岐なし）。デモ挙動の不整合。
- **L3**: `generateDraft` の greedy は不完全（解が存在しても欠員=nullを残し得る）。安全側だが over-conservative。

---

## 3. 5ゲート統合判定

| ゲート | 判定 | 根拠 |
|---|---|---|
| ① テスト全GREEN | **PASS（機械的）** | core 201/201・server 8/8 GREEN、tsc 両者 exit 0。ただしテスト群は C1 の危険挙動を"安全"と追認し、勤務間隔hard・greedyのhard回避を未検証（実効品質は不足）。 |
| ② カバレッジ | **FAIL** | 全体 Branch **89.47% < 90%**（組織標準 ecc-rule-testing-standards の90%未達）。かつ安全中核 `optimize.ts` Lines 75.2%/Branch 79.48%、連勤・週上限の hard回避分岐と min_rest_hnours 経路が完全未到達。C1/H2 の温床。 |
| ③ 層分離 / 純粋性 | **PASS（条件付き）** | core shift/*.ts は purity テストで UI/DB/env/fetch/非決定を禁止・GREEN。server は input-core へ委譲し再実装なし。ただし M1(グローバル可変レジストリ) と H3(UIが確定をクライアント実行) が層原則を部分的に侵食。 |
| ④ 秘匿境界 / Secrets | **PASS** | ハードコード秘匿なし。Claude鍵は server env のみ・x-api-key ヘッダでのみ使用、レスポンス/ログ非露出。structure は許可フィールドのみ写像し混入キーを除去（テスト実証）。CORS は localhost:5173/env 限定。 |
| ⑤ 後方互換 | **PASS** | 0102 は additive-only（新規テーブル/NULL可列追加/冪等インデックスのみ、drop/rename/型変更/NOT NULL化なし）。AI経路テーブルの「SELECTのみ/service_role書込」方針をコメント明記。 |

**総合判定: FAIL**（ゲート②が Fail。加えて CRITICAL C1 は単独で是正必須）

---

## 4. 次アクション（優先順）

1. **[C1] 未登録hard制約の安全化**: `evaluateConstraints` で hard 未登録kindを feasible 落下（or unenforced 返却）に変更し、対応する RED テストを追加。s3_constraints の「未登録kind安全スキップ」テストを **hard は不安全** に改訂。
2. **[C1/H1] `generateDraft.satisfied` を実検証済み制約のみに限定**。全hardラベル無条件コピーを廃止し、REQ-021 の説明整合テストを追加。
3. **[H4→C1] ShiftCell/DraftAssignment に勤務時間帯を追加**し `min_rest_hours` 評価器 + `candidateHardConflict` case を実装。
4. **[H2/ゲート②] optimize.ts の連勤・週上限 greedy回避テスト**（境界: ちょうど連勤/週境界/空staff/全員無資格）を追加し Branch を 90%以上へ。
5. **[H3] UI 確定/反映を `/api/shift/confirm` 経由に統一**（`applyConfirmedRun` のクライアント直呼びを撤去）。
6. **[H5] AI経路テーブルの実RLSポリシー**（SELECTのみ/service_role書込）と confirm の認証を DB結合時に付与。
7. **[M1] レジストリを DI 化**しグローバル可変状態を除去。**[L1]** CI に server テストを組み込む。

---

## 5. 未検証事項（正直な列挙）

- **実DDL/DB結合**: 既存25テーブルの実スキーマ未提供。0102 は「モック+推定」ベース（OQ-DB1）。実RLS・実FK・load-onto 可否は未検証。
- **実Claude I/F**: `resolveCallClaude` の実呼び出しはプロンプト未確定・キー無し環境のためモックのみ実行。実 Anthropic レスポンス形と `parseConstraintsFromLLM` の整合は未検証。
- **OR-Tools/CP-SAT**: `resolveOptimizer` は heuristic 固定。厳密ソルバは未実装（設計差し替え点のみ）。generateDraft の完全性・大規模現場での充足は未検証。
- **Tauri 実ビルド**: `apps/desktop` の Vite/Tauri 実ビルド・起動は未実行（コード読取のみ）。
- **UIテスト**: shift feature（AiOptimizer/ConstraintEditor/ShiftGrid/DailyAssignment）に自動テストなし。HITLボタン無効化・確定フローの UI 検証は目視レビューのみ、E2E未実施。
- **NFR-01 実測**: additive-only はDDL静的確認のみ。既存データ上でのマイグレーション適用は未実行。

---

### 特記（本レビューの最重要2点）
- **HITL**: 論理層は健全（reviewed=true 必須・二重確定拒否・未確定反映拒否を throw で強制、UI無効化に非依存）。**自動確定の論理的抜け道は無い**。ただし **UIが確定をクライアント実行し ADR-008 のサーバ限定を迂回**（H3）＝アーキ上の抜け道は残存。
- **未登録hard制約**: **危険**。未登録hardは無言スキップ→feasible=true、`min_rest_hours`(労基インターバル)は評価器不在で常に無視され、説明は「充足済」と虚偽表示（C1）。System の中核価値（合法シフト生成）を損なう最優先是正事項。

---

## retry1 再判定

- 実施: Fresh Context・実コード再走査・テスト/カバレッジ/型チェック再実行（是正後 retry1）
- 日付: 2026-08-11
- **総合判定: PASS**（初回のCRITICAL/HIGH主要指摘が閉じ、ゲート②カバレッジも是正を確認）

### 客観結果（再実行）

| 項目 | 初回 | retry1 | 判定 |
|---|---|---|---|
| input-core テスト | 201/201 | **225/225**（21ファイル）exit 0 | ✅ |
| server テスト | 8/8 | **8/8**（shift-optimize 5, risk 3）exit 0 | ✅ |
| tsc（core / server, --noEmit） | exit 0 | いずれも **exit 0** | ✅ |
| カバレッジ 全体 Branch | **89.47%（FAIL）** | **91.13%（PASS, 閾値90）** exit 0 | ✅ |
| カバレッジ shift層 | Lines 91.15% / Branch 85.64% | Lines **98.33%** / Branch 89.62% | ✅ |
| optimize.ts | Lines 75.2% / Branch 79.48% | Lines **100%** / Branch **90.14%** | ✅ |
| shiftTimes.ts | （不在） | Lines/Branch **100%** | ✅ |

vitest の `thresholds { lines/functions/branches/statements: 90 }` を満たし exit 0（グローバル閾値をパス）。

### 各指摘の CLOSED / OPEN

- **C1（CRITICAL）未登録hardの無言スキップ + min_rest欠落 + satisfied虚偽 → CLOSED**
  - `constraints.ts::evaluateConstraints`: 未登録kindは `severity==='hard'` のとき `code:'unevaluable'` の hard違反として計上し `feasible=false`（fail-safe）。soft未登録のみ従来スキップ。実コードで確認（L277-289, feasible=hardViolations.length===0）。
  - `min_rest_hours` 評価器 `evalMinRestHours` を実装しレジストリ登録（L208-245）。新規 `shiftTimes.ts`（勤務時刻マップ・crossesMidnight・`restIntervalHours` 翌日跨ぎ算出）で労基インターバルを実評価。夜勤明け翌日勤=0h<11h が hard違反、ちょうど11h/12h境界は違反なしをテスト実証（s3_constraints 「min_rest_hours」describe 7ケース、priorShifts経路含む）。
  - `optimize.ts::verifiedSatisfiedLabels`: satisfied は当該割付に関連し実検証で充足した hard制約のみ。無関係ポジションの資格・集約headcount・未登録kindは載せない（虚偽表示防止）。s3_optimize 「satisfied は実検証した制約のみ」describe で実証。
  - greedy `candidateHardConflict` に min_rest_hours / custom_flag / max_consecutive / max_weekly の case を実装し回避。生成後 `evaluateConstraints(draft)` で再評価し未評価hard・残存hardは feasible=false + unresolved。
- **C1派生 H1（satisfied無条件コピー）→ CLOSED**（同上 verifiedSatisfiedLabels）。
- **H2（greedyのhard回避が無テスト）→ CLOSED**。s3_optimize に連勤/週上限/min_rest/custom_flag hard回避＋境界のnull割付テストを追加、optimize.ts Branch 79.48→90.14%。
- **H3（HITL確定がクライアント権威・ADR-008迂回）→ CLOSED**。`AiOptimizer.handleConfirm` は `shiftClient.confirmRun` → サーバ `/api/shift/confirm`（reviewed必須）を第一経路化。サーバ成功時のみ `serverConfirmed=true` で「確定」。サーバ拒否(非ネットワーク4xx/5xx)かつ reviewed=true は再throw（ローカル確定させない）。フォールバックは `confirmed=false` の未確定プレビュー明示。desktop から `shift_overrides` 直書き・supabase書込は皆無（grep確認）。
- **ゲート②カバレッジ FAIL → CLOSED**（全体Branch 91.13% ≥ 90）。
- **H4（モデルに時間帯なし）→ 実質CLOSED**。`ShiftTime` 型＋`OptimizationContext.shiftTimes?`＋既定マップで勤務時刻を供給し min_rest 評価が成立（WorkType→時刻の外挿方式。個別セル時刻ではないが労基インターバル判定には十分）。
- **H5（AI経路の実RLS/認証未付与）→ OPEN（残課題・非ブロッキング）**。0102 は方針コメントのみで実RLS DDLなし、confirm は無認証・reviewedは自己申告。DB結合前でありゲート⑤(後方互換)は充足するが、DB結合時に実ポリシー必須。
- **M1（グローバル可変レジストリ）→ OPEN（MEDIUM据置）**。`registerConstraintEvaluator` がモジュールレベルMapを破壊的更新。テスト間漏れ・長時間稼働での累積リスク。DI化推奨。
- **M2/M3（applyConfirmedRun/confirmがdraftを再検証せず信頼）→ OPEN（MEDIUM据置）**。永続化後の改竄draft反映リスク。DB結合時にサーバ側再評価を推奨。
- **L1（`pnpm test` が server を含まない）→ OPEN（LOW据置）**。CIでの server テスト明示必須。

### 新たな抜け道の探索（敵対的）

- **soft偽装バイパス**: 未登録kindを soft指定すればスキップされるが、これは「情報のみ」の設計意図どおりで、既知の危険hard(min_rest等)はモックClaudeが hard生成する。コード上の新規hole無し。
- **satisfied再確認**: 生成後に final evaluate が hard違反(feasible=false)でも satisfied にその制約が載るケースを検証 → 未登録hardは verifiedSatisfiedLabels の default分岐で載らず、既知hardは greedy が回避済みのため非null割付では整合。虚偽表示の新規holeは検出されず。
- **min_rest別経路スキップ**: `evalMinRestHours` は priorShifts+割付を日付Mapに併合し隣接日(epoch差1)を全対（逆順・非隣接・勤務なし区分・上書き時刻を境界テスト）。同一日に複数勤務があるとMapが後勝ちで1件に潰れる既存モデル制約は残るが、greedyの usedToday と同一で回帰ではない。
- **確定のクライアント権威残存**: フォールバックの localConfirmed は run.status='確定' になるが UI は `serverConfirmed && status==='確定'` でのみ確定表示。confirmed=false のプレビュー止まり。論理層 `confirmOptimizationRun` は reviewed!==true / 二重確定を throw で拒否（UI無効化非依存）。自動確定の論理的抜け道は無し。

### 5ゲート再判定

| ゲート | 初回 | retry1 | 根拠 |
|---|---|---|---|
| ① テスト全GREEN | PASS(機械的) | **PASS** | core 225/225・server 8/8・tsc両者exit0。テストが C1危険挙動を「安全」と追認していた点も是正（fail-safe/min_rest/satisfiedの正しいテストへ改訂）。 |
| ② カバレッジ Branch≥90% | **FAIL(89.47%)** | **PASS(91.13%)** | 閾値90をパス（exit0）。optimize.ts 90.14%。残uncoveredは防御ガード（constraints 178-181/221/296, optimize 11/16/21/61/121/137）。 |
| ③ 層分離/純粋性 | PASS(条件付) | **PASS** | s3_purity GREEN（新規shiftTimes.ts含む UI/DB/env/fetch/非決定 禁止）。H3是正でUI確定がサーバ委譲へ。M1(可変レジストリ)は残存だが層原則侵食は限定的。 |
| ④ 秘匿境界/Secrets | PASS | **PASS** | ハードコード秘匿なし。structure は許可フィールドのみ写像し混入キー除去をテスト実証。coreは env/fetch/apiKey 参照禁止をpurity強制。 |
| ⑤ 後方互換 | PASS | **PASS** | 0102 additive-only（新規テーブル/NULL可列/冪等index、drop/rename/型変更/NOT NULL化なし）。 |

**総合判定: PASS**（全ゲート通過。CRITICAL/HIGH主要指摘は CLOSED）。

### 残課題（次段で必須・本判定はブロックしない）

- **H5**: AI経路テーブル（shift_optimization_runs/assignments/overrides）の実RLSポリシー（SELECTのみ/service_role書込）と confirm エンドポイントの認証・レート制限を DB結合時に付与。reviewed の自己申告依存を解消。
- **M1**: 制約評価器レジストリの DI化（グローバル可変状態除去・テスト間漏れ防止）。
- **M2/M3**: 確定/反映時にサーバ側で draft を再評価（feasibility 再検証・改竄draft拒否）。
- **L1**: CI 標準スクリプトに server テストを組込み。
- **未検証（正直な列挙）**: 実DDL/DB結合・実RLS/FK（既存25テーブル未提供・0102はモック+推定）、実Claude I/F（モックのみ）、OR-Tools/CP-SAT厳密ソルバ（heuristic固定）、Tauri/Vite 実ビルド・起動、shift UI の自動/E2Eテスト、NFR-01 実データ適用。いずれも本Sprintスコープ外の次段検証事項。
