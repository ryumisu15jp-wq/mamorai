# Sprint1 敵対的レビュー & 5ゲート統合判定

- 対象: MAMOR-AI（警備1分日報）Sprint1 成果物
- レビュー担当: Adversary(レッドチーム) 兼 Evaluator(#17 品質保証部長)
- モード: Fresh Context（前会話の前提を持ち込まず、Readで実確認したもののみ断定）
- 実施日: 2026-08-11

---

## 1. サマリー（客観結果）

### Sprint1 スコープ（spec/behavioral-spec.md より）
REQ-001〜007 を対象。共通入力ロジック層 `packages/input-core`（純粋関数）＋ Tauri/React デスクトップの1分日報UI＋追加のみマイグレーション。Expo(モバイル)UI・DB実接続・承認ワークフロー(REQ-008以降)は Out of Scope。

### 成果物一覧（実在を確認）
| 区分 | ファイル |
|---|---|
| ドメイン層 | `packages/input-core/src/types.ts`, `report/template.ts`(resolveForm), `report/prefill.ts`(buildPrefilledForm), `report/validation.ts`(validateForSubmit), `report/model.ts`(createDraft/createSubmittedReport/estimateTaps), `index.ts` |
| テスト | `__tests__/` 7ファイル（resolveForm/buildPrefilledForm/validateForSubmit/estimateTaps/model/purity/backwardCompat）＋ `fixtures.ts` |
| DB | `supabase/migrations/0100_report_additive.sql` |
| UI | `apps/desktop/src/App.tsx`, `features/report/QuickDailyReport.tsx`, `features/report/demoData.ts`, `lib/supabaseClient.ts`, `styles.css` |
| Tauri | `src-tauri/tauri.conf.json`, `Cargo.toml` |

### 客観メトリクス（実行して裏取り）
| 項目 | 結果 | 根拠 |
|---|---|---|
| テスト | **49/49 GREEN**（7ファイル） | `vitest run --coverage` 実行 |
| カバレッジ | Stmts 100 / Funcs 100 / **Branch 91.02** / Lines 100（対象 `src/report/**`,`types.ts`） | 同上。閾値 lines/func/stmt=90, branch=80 を満たす |
| 型チェック | input-core / desktop とも **tsc --noEmit exit 0**（strict:true, noUncheckedIndexedAccess:true） | 両パッケージで実行 |
| ビルド | 未実施（Sprint1 方針で cargo/tauri build は行わない。desktop に `dist/` 既存） | Cargo.toml コメント |
| Secrets | ハードコード秘匿情報 **検出なし** | grep(secret/apikey/service_role/eyJ/sk-) で0件 |
| XSS | `dangerouslySetInnerHTML`/`innerHTML`/`eval` **なし** | grep 0件、出力は `JSON.stringify`＋React標準エスケープ |

---

## 2. 指摘リスト（重大度別）

### CRITICAL
なし。

### HIGH

**H-1. estimateTaps がプリフィル済みフォームで操作数を過大計上（REQ-004 / NFR-02）**
- 対象: `packages/input-core/src/report/model.ts` `estimateTaps`（85-110行）＋ `apps/desktop/src/features/report/QuickDailyReport.tsx`（63-64行 `estimateTaps(liveForm, template)`）
- 事実: taps は **テンプレート `default` からの差分**で算出される（counter=|cur-def|, select=常に+1, check=trueで+1）。ところが UI はプリフィル済み `baseForm.values` を初期表示するため、ユーザーが1度も操作していない初期状態でも差分が計上される。
- 実証: `demoData.ts` の承認済プリフィル値（counter 1/2/3, check aed=true, select shift=夜勤・weather=晴, gate handover=true）を estimateTaps に通すと、初期ロード時点で **taps=10（select2＋counter6＋check2）= 10/10** となり、以降1タップで即「超過」表示。差別化の中核である1分日報メーターが起動直後から満杯を示す UX 欠陥。
- リスク: REQ-004「操作数が閾値以内」の判定が prefill と統合すると意味を成さない。TapMeter が誤警告。
- テスト状況: estimateTaps 系テストは全て `makeForm` で明示値を組むのみで、**buildPrefilledForm→estimateTaps の統合経路が未テスト**（この過大計上を検出できていない）。
- 修正提案: 操作数はテンプレート default ではなく **プリフィル後のベースライン（buildPrefilledForm の出力）からの差分**で測る、または prefill 由来の初期差分を除外する。統合テスト（prefill→estimate）を追加。

**H-2. `invalid_type` が宣言のみで未発火・number型の非数値がレンジ検証を素通り（REQ-006）**
- 対象: `validation.ts` 47行 `field.type === 'number' && typeof value === 'number' && field.range`／`types.ts` 92行 `'invalid_type'`
- 事実: Violation code `'invalid_type'` は型に宣言されているが**コード中で一度も push されない**（grep で使用0）。number フィールドに文字列等の非数値が入ると `typeof value === 'number'` が false になりレンジ検証を**丸ごとスキップ**して合格する。`validateForSubmit` の入力は `Record<string, Record<string, unknown>>`（unknown）で、prefill は元値を型チェックせずコピー（`prefill.ts` 36-39行）、REQ-007 の legacy_extras/legacy データ経路もあるため型ドリフトが現実に起こり得る。
- リスク: 検証の権威であるべきドメイン層が、型不整合の不正値を提出時に黙って通す。現UIは counter を number に制御しているため実悪用性は限定的だが、Expo/legacy/直接API経由で破れる。
- 修正提案: number/select/check の型不一致時に `invalid_type` を発火（またはコードを型から削除して意図を明確化）。time は非文字列を parseTime が null 化し invalid_time になるため実害なし。

### MEDIUM

**M-1. SubmitValidationError が未export、UI が name 文字列でマッチ（REQ-001 層境界）**
- 対象: `model.ts` 28-35行（クラス非export）／`QuickDailyReport.tsx` 30-36行 `extractViolations`（`e.name !== 'SubmitValidationError'`）
- 事実: 例外クラスを export せず、UI が文字列 `'SubmitValidationError'` と `violations` プロパティ形状に依存して分解している。内部実装詳細への脆い結合であり、リネームで静かに壊れる。層分離の思想に反する漏れ。
- 修正提案: エラークラス／型ガードを input-core から export する、あるいは throw ではなく判別可能な結果型で violations を返す。

**M-2. Tauri CSP が null（セキュリティ）**
- 対象: `src-tauri/tauri.conf.json` 23-25行 `"security": { "csp": null }`
- 事実: Content-Security-Policy 未設定。今後 WebView から Supabase 直結・日報データ描画を行う設計のため、connect-src を Supabase URL に限定し script-src 'self' 等へ絞る CSP を DB接続前に設定すべき。現状 DB未接続のため即時被害はないが、実接続を有効化する前の必須対応。
- 修正提案: 実接続有効化と同一PRで最小 CSP を定義。capabilities（Tauri v2 権限）も接続機能追加時に最小化。

**M-3. ブランチ閾値 80% は組織標準90%を下回る／types.ts が0%表示**
- 対象: `vitest.config.ts` `thresholds.branches: 80`
- 事実: lines/func/stmt=90 だが branches=80。ECC testing-standard は90%基準。実測91%で結果は満たすが、閾値設定自体が標準より緩い。カバレッジ対象に含まれる `types.ts` は型のみのため 0% 表示（実行文なしで実害はないが report 上は誤解を招く）。
- 修正提案: branches を90へ引き上げ（現状91%で通る）。types.ts を coverage include から除外。

**M-4. 非カバー分岐が実シナリオを含む（カバレッジギャップ）**
- 対象/事実（v8 Uncovered）:
  - `prefill.ts:35`（`if (target === undefined) continue`）＝ **旧テンプレの無効/存在しないセクションを含む過去日報からのプリフィル**が未テスト。archived セクション由来値の取り扱いという現実的経路。
  - `model.ts:86-88,93-94` ＝ estimateTaps の `enabled===false` セクション skip・`sectionValues===undefined` skip・`default`非数値フォールバック(`:0`)・`value`非数値フォールバック(`:def`) が未到達。H-2 の型ドリフト経路と重なる。
  - `validation.ts:30`（`values[section.id] ?? {}` のセクション欠落側）, `:84`（`pushPairViolation` の `pairWith===undefined` 再ガード＝呼出側で既にチェック済みの実質デッド分岐）。
- 修正提案: prefill の無効セクション混入ケースと estimateTaps の disabled/欠落/型不一致ケースにテスト追加。validation.ts:84 の冗長ガードは整理。

**M-5. UI が range クランプを再実装（REQ-001 の軽微な侵食）**
- 対象: `QuickDailyReport.tsx` `step()`（76-85行）で `field.range.min/max` を UI 側でクランプ。
- 事実: 入力UXとしてのクランプであり最終検証は validateForSubmit が担うが、レンジという業務知識が UI に複製されている。ドメイン層に「クランプ関数」を置いて共有する方が Expo 再利用時に挙動一致を保てる。

### LOW
- **L-1**: `createSubmittedReport` が `new Date().toISOString()` を使用（`model.ts` 71行）。REQ-001「同一入力→同一出力」の純粋性が submittedAt で崩れる。purity テストは import/global のみ検査し時刻依存を見ていない。時刻は引数注入（clock 注入）にすると純粋・テスト容易。
- **L-2**: 本文系の一部フォントが16px未満（`styles.css` field-label 15px, field-msg 13px, badge 11px）。主要操作ボタン/入力は 44px・16px を満たす（.tap 44×44, .input min-height44/16px, .toggle 44px）ため NFR-02 の中核は充足。ラベル可読性は要確認。
- **L-3**: `pairWith` は同一セクション内フィールドのみ解決（別セクション参照は parseTime→null で無検証・無警告）。現テンプレでは問題ないが仕様として明文化推奨。
- **L-4**: 異常系 time は概ね正しく棄却（'24:00'・'25:00'・'09:60'・'9:5'・全角"あさ" いずれも invalid_time／TIME_RE が2桁固定のため'9:5'も弾く）。バグではなく良好。境界 '00:00'〜'23:59' と end===start 常時違反も確認済み。

---

## 3. 5ゲート判定表

| # | ゲート | 判定 | 根拠 |
|---|---|---|---|
| ① | テスト全GREEN | **PASS** | 49/49 pass（vitest実行済）。失敗・skipなし |
| ② | カバレッジ閾値達成 | **PASS** | Stmts/Funcs/Lines=100, Branch=91.02（閾値90/90/90/80 を全達成）。※閾値設定が組織標準90に対しbranch80と緩い点は M-3 |
| ③ | 層分離/純粋性 | **PASS** | purity テスト green、input-core は react/react-native/@supabase/window/document 非依存、tsc strict clean。UI は概ね委譲。M-1/M-5 の軽微な漏れは是正推奨だが境界自体は保持 |
| ④ | セキュリティ/Secrets | **PASS** | Secrets 0件、anonキーはenv経由のみ・service_roleサーバ限定を明記、XSS/eval なし、getSupabaseは常にnull。※CSP=null(M-2)はDB接続前の必須対応 |
| ⑤ | 後方互換（追加のみ） | **PASS** | 0100_report_additive.sql は `add column if not exists`(全NULL許容)/`create table/index if not exists` のみ。drop/rename/alter type/既存列NOT NULL化なし。backwardCompatテスト green |

---

## 4. 総合判定

# 総合: PASS（条件付き）

5ゲートすべて PASS、CRITICAL ゼロ。ただし **HIGH 2件（H-1 タップ過大計上 / H-2 invalid_type 未発火）は Sprint2 着手前の必須修正**とする。これらは「テストが手薄な統合経路・型ドリフト経路」に潜み現行テストが緑のまま見逃している類のため、対応と同時に回帰テスト追加を要求する。

### 次アクション
1. **Sprint2 へ進行可**。ただしバックログ先頭に H-1・H-2 を must-fix で積む（prefill×estimate 統合テスト、number型検証＋invalid_type発火）。
2. **DB実接続を有効化する前に** M-2（CSP）を必須対応。実DDL/RLS 受領後に backwardCompat を実スキーマで再検証。
3. M-1（エラーclass export）・M-3（branch閾値90化・types.ts除外）は Sprint2 の軽微改善で回収。
4. FAIL ではないため差し戻しは不要。Chief Secretary へは「PASS・HIGH2件を条件」で報告。

---

## 5. 未検証事項（正直な限界）
- **実DDL未提供**: 既存25テーブルの実スキーマ・既存RLSは未提供（SQL冒頭 OQ-DB1 として明記済み）。additive-only は**ファイル単体としては**確認したが、実テーブルに対する適用可否・列名衝突・既存RLSとの整合は未検証。実DDL受領時に (a)追加列名の既存衝突、(b)report_drafts/report_templates と既存FK整合、(c)RLS新規付与要否 を要再点検。
- **DB結合/RLS未検証**: Supabase 実接続なし（getSupabase は常時 null）。クロスユーザーRLS・認可は Sprint後半 Database Engineer の結合テスト待ち。
- **Tauri 実ビルド未実施**: cargo/tauri build 未実行（Sprint1方針）。capabilities/allowlist・実CSP適用・WebView2挙動は実ビルドで要確認。
- **UIコンポーネントテスト未実施**: NFR-02(44px/16px/10タップ)は CSS 値と estimateTaps ロジックの静的確認のみ。実レンダリング/ブラウザ計測・E2E は未実施（H-1 の10/10問題は実UI計測で顕在化する想定）。
- **desktop 側の自動テストなし**: QuickDailyReport 等 UI ロジック（extractViolations, step クランプ）にユニットテストが無く、型チェックのみ担保。

---

## v1.1 是正記録（Orchestrator 指示による即時修正）

Evaluator が PASS 判定と同時に挙げた HIGH 2件を、バックログ送りにせず Sprint1 内で即時修正した。

- **H-2（invalid_type 未発火）**: `packages/input-core/src/report/validation.ts` の number 検証を修正。非空だが有限数でない値に `invalid_type` を発火し、レンジ検証を素通りさせないようにした。
- **H-1（tap計数がdefault基準でprefill済みUIが起動直後に超過）**: `packages/input-core/src/report/model.ts` の `estimateTaps` に任意引数 `baseline` を追加。プリフィル済み初期値を基準に「ユーザーが実際に操作したタップ数」のみを数える。baseline 省略時は従来挙動（後方互換）。UI(`QuickDailyReport.tsx`)は `baseForm.values` を baseline として渡すよう更新。
- **MEDIUM（SubmitValidationError 未export）**: 同クラスを export し、UI は文字列マッチではなく `instanceof` で判別するよう更新。

回帰テスト `packages/input-core/src/__tests__/remediation.test.ts`（7件）を追加。**最終: 56/56 GREEN、カバレッジ lines/funcs/stmts 100% / branches 91%、desktop tsc clean、vite build 成功。**

残る未検証事項（実DDL未提供・RLS未検証・Tauri実ビルド未実施・UIコンポーネントテスト無し）は据え置き。実DDL提供後に再点検する。
