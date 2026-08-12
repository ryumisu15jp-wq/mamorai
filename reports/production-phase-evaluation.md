# 本採用フェーズ 敵対的評価レポート（Adversary/Evaluator #17）

- 対象: MAMOR-AI 実Postgres結合・RLS・データ往復（本採用フェーズ DB-1/DB-2/DB-3）
- 検証日: 2026-08-11 / Fresh Context / 実コマンド裏取り済み
- ライブDB: 127.0.0.1:5433 db=mamorai（trust）, psql 16.13
- 検証DB: `mamorai_verify` を新規作成し 0000→0100→0102→0103→0200→0201 を順次適用（検証後 DROP 済）

## 総合判定: **FAIL（要修正・再認証）**

コア群A/群B（daily_reports / shifts / shift_overrides / report_drafts / shift_preferences /
staff_qualifications / notification_confirmations / shift_optimization_runs・assignments）の
現場スコープRLSは**自分の実クエリで健全に実効**することを確認した。
しかし、**NFR-03「担当外現場が見えない」を実DB上で破る越境読取**（HIGH）と、
**群B『サーバ専用書込』が app_client 自身に詐称可能**（HIGH）を実証したため、
本採用フェーズのセキュリティゲートは通せない。いずれも修正箇所は局所的で、再認証可能な性質。

---

## 1. 客観結果サマリー

### 1.1 適用の健全性 … PASS
- 新規DB `mamorai_verify` に全6マイグレーションが **EXIT=0 で適用**（0200 の NOTICE は
  `drop policy if exists` の想定内スキップのみ、エラーではない）。
- **破壊的DDLゼロ**: `drop table/column`, `alter column`, `rename`, `set not null`,
  `drop constraint`, `truncate` を全migでgrep → 一致なし。0100/0102/0103 は
  `add column if not exists` / `create table if not exists` / `create index if not exists` のみ。
- **冪等**: 全6ファイルを再適用しても RE-RUN OK（0エラー）。

### 1.2 RLS実効（自分で実証） … コアはPASS / 全体はFAIL
非superuser `app_client`（rolsuper=f, rolbypassrls=f）で**直接接続**し実クエリで検証:

| 検証 | 期待 | 実結果 |
|---|---|---|
| (a) site1ユーザの daily_reports 可視 | 自現場のみ | site1=1件のみ（site2不可視）**PASS** |
| (b) 担当外 site2 への INSERT | 拒否 | `new row violates row-level security policy` **PASS** |
| (c) 群B runs を素の app_client で INSERT | 拒否 | RLSで拒否 **PASS** |
| 子表 staff_qualifications（site2隊員の資格）を site1ユーザで参照 | 0件 | 0件 **PASS** |
| 子表 notification_confirmations（site2）を site1ユーザで参照 | 0件 | 0件 **PASS** |
| 子表 shift_optimization_assignments（site1 run）を site2ユーザで参照 | 0件 | 0件 **PASS** |
| service（app.role=service）で群B INSERT | 許可 | 成功 **PASS** |
| superuserバイパス回避 | force RLS | daily_reports/shift_preferences 等は relforcerowsecurity=t **PASS** |

→ **列挙された群A/群Bの範囲では、USING/WITH CHECK・子表JOIN・force RLS すべて正しく効く。**
統合テストもトートロジーでなく、u_a/u_b の別ユーザで実INSERT/SELECTしRLS境界を跨いでいる。

**ただし以下2点で全体はFAIL（下記 指摘 CRIT/HIGH）。**

### 1.3 往復（統合テスト） … PASS
- `pnpm --filter @mamorai/server exec vitest run` → **18/18 GREEN**
  （うち統合10件: reportRepo 6 + shiftRepo 4 が実Postgres app_client往復）。
- 非トートロジー: 別ユーザ(U_A/U_B)で実行し「担当外は0件/null」「担当外INSERTは
  `/row-level security/i` で throw」「群B直INSERT拒否・withServiceで成功」を実往復で確認。

### 1.4 秘匿境界 / Secrets … PASS
- Claude鍵は**サーバ層のみ**（`server/src/services/claude.ts`・`routes/risk.ts`、`process.env.CLAUDE_API_KEY`、
  `x-api-key` は server→Claude のみ）。apps/packages からの参照なし（input-core には purity テストで
  `/anthropic/i` 混入を禁止する assert あり）。
- 接続情報はenv経由（`DATABASE_URL` 既定 trust・パスワード無し）。`user:pass@` 形式の
  資格情報ハードコードは grep 一致なし。レスポンスへの鍵混入を防ぐテストも存在（SECRET非露出）。

### 1.5 後方互換 … PASS
- 0100/0102/0103 は**追加のみ**を維持（非追加動詞 grep 一致なし）。
- 0000 は冒頭コメントで「ASSUMED BASELINE（推定・実DDL提供時に本ファイルごと置換）」と明記。
- **結線の隔離点は単一**: 実DDL中の `current_setting('app.user_id')` は
  **app_user_site_ids() 内の1箇所のみ**。全19ポリシーが `select app_user_site_ids()` を経由。
  Supabase移行時はこの関数本体を `auth.uid()` ベースへ差し替えるだけで全ポリシーが追従する。

---

## 2. 指摘（重大度別）

### HIGH-1 — 群B『サーバ専用書込』は app_client 自身に**詐称可能**（実証済）
`app_is_service()` は `current_setting('app.role')='service'` という**クライアント設定可能なGUC**を
読むだけ。app_client で直接接続し `select set_config('app.role','service',false)` を実行後、
`insert into shift_optimization_runs ...` が**成功した**（run_id 返却）。
つまり「群Bはクライアント書込不可＝HITL自己確定を構造排除」（0200/pool.ts の主張）は、
**同一 app_client ロールが app.role を立てれば破れる**。DBレベルでは群Bの書込保護が
app_client ロールに対して**強制されていない**（SQLi や誤設定1行で群B書込へ昇格しうる）。
- 影響: NFR-03/ADR-008 の「AI経路＝サーバ専用」保証が、実DBでは *アプリ規律* に依存。
- 修正: 群Bの `with check` を `app_is_service()`（GUC）ではなく **別DBロール**（例 `app_service`、
  `current_user='app_service'`）に紐付ける。Supabaseでは service_role（検証済JWT・別ロール）で
  代替され、この穴は自然に閉じる（→ §4 差替え手順で結線）。それまでは
  「withService は client 非公開の別接続でのみ使う」ことを明示ゲート化する。

### HIGH-2 — 担当外現場データの**越境読取**（NFR-03 違反・実証済）
`0201` の `grant select on all tables in schema public to app_client` により、**RLS未適用の
site-scoped テーブル**を site1 ユーザが横断参照できる。site1 会員で実クエリした結果:

| テーブル | RLS | site1ユーザから見えたsite2データ |
|---|---|---|
| `notifications`（本部通知/機密 body） | 無効 | **1件（site2の機密通知を読取）** |
| `training_records`（隊員の研修/PII） | 無効 | **1件（site2隊員）** |
| `shift_constraints`（現場の法令/保険設定） | 無効 | **1件（site2）** |
| `notification_targets`（配信対象スナップショット） | 無効 | 全件 |
| `report_templates` / `report_template_sections` / `template_section_configs` | 無効 | 全件 |
| `staff`（全現場の隊員名簿・役割） | 無効 | 全2件 |
| `sites`（全現場） | 無効 | 全2件 |

- 設計 `database-design.md §4` は群Aに「日報テンプレ/配置基準/通知既読」を含め、`notifications/
  training_records` は「既存テーブルの既存RLSがそのまま適用される」前提。しかし**推定ベースライン
  emulationではこれらは 0103 が新規作成しRLS無し**、かつ 0201 が全表SELECTを付与 → 認証済み
  app_client なら誰でも他現場の通知・PII・現場設定を読める。**NFR-03「担当外現場が見えない」を破る。**
- 影響: 読取限定（書込は群A/Bのみに付与）だが、機密通知・PII の**機密性侵害**。ゲートFAIL要因。
- 修正:
  1) `notifications / notification_targets / training_records / shift_constraints /
     report_templates / report_template_sections / template_section_configs` に
     site_id（子表は親JOIN）ベースのRLSを付与（0202 追加mig）。
  2) `grant select on all tables` の**ブランケット付与を廃止**し、RLS済み表へ個別付与へ変更。
     もしくは全 site-scoped 表にRLSを張ってから付与する。

### MEDIUM-1 — 子表RLSが `staff` の素のSELECT権限に依存
`staff_qualifications` 等の子表ポリシーは `select ... from staff where site_id in (...)` を
**app_client権限で評価**するため、app_client に `staff` のSELECTが必要。結果、全現場の
名簿が読める（HIGH-2の一部）。子表判定を **security definer 関数**（app_user_site_ids と同様、
`staff` を隠蔽して site 判定だけ返す）に隔離すれば、`staff` への直接GRANTを外せる。

### LOW-1 — `app.user_id` 未設定時のフェイルクローズは正しいが可観測性が低い
`current_setting('app.user_id', true)` 未設定→NULL→`app_user_site_ids()` 0行 で
安全側（全不可視）に倒れる。設計として妥当だが、接続確立時に user_id 必須を強制する
アサーション（例 withUser 内で空文字/未設定を拒否）を入れると事故検知が早い。

### 情報 — 検証成果物 `reports/rls-verification.txt` は別ロール `app_user` を使用
提出物のRLS検証は 0201 が作る `app_client` ではなく、検証SQL内で作った `app_user` で実施
（結果自体は妥当）。本レポートは**0201の app_client 実体で再実証**した。ロール名の二重化は
将来の混乱源なので `app_client` へ統一を推奨。

---

## 3. 5ゲート判定表

| # | ゲート | 客観根拠 | 判定 |
|---|---|---|---|
| G1 | 適用の健全性 | 新規DBに0エラー適用・冪等再適用OK・破壊的DDLゼロ | **PASS** |
| G2 | RLS実効 | コア群A/群B・子表JOIN・force RLSは実クエリで健全。だが HIGH-1(群B詐称)・HIGH-2(越境読取) を実証 | **FAIL** |
| G3 | データ往復 | vitest 18/18 GREEN・統合10件は実RLS往復・非トートロジー | **PASS** |
| G4 | 秘匿境界/Secrets | Claude鍵サーバのみ・env接続・資格情報ハードコード無し | **PASS** |
| G5 | 後方互換 | 追加のみ維持・0000は置換前提明記・隔離点 app_user_site_ids() 単一 | **PASS** |

**総合: G2 FAIL により本採用フェーズ = FAIL（4/5 PASS・G2で不合格）。**
コアスコープは強固で、修正は局所的（RLS追加＋GRANT絞り＋service別ロール化）。再認証は容易。

---

## 4. 実DDL差替え手順（Supabase移行チェックリスト）

1. **0000 を実DDLへ置換**
   - MAMOR-AI 既存25テーブルの実DDLが判明したら `0000_base_assumed.sql` を**ファイルごと置換/削除**。
   - `app_site_members` を実在の現場メンバーシップ相当表へ差替え（FK先 sites.id/staff.id/auth.users.id を実名確定）。
   - 0100/0102/0103 は改変しない（`add column if not exists` が実列と衝突する場合は列名のみ差替え）。

2. **app_user_site_ids() を auth.uid() へ結線（唯一の結線点）**
   ```sql
   create or replace function app_user_site_ids() returns setof uuid
   language sql stable security definer set search_path = public as $$
     select m.site_id from <実メンバーシップ表> m where m.user_id = auth.uid()
   $$;
   ```
   - `current_setting('app.user_id')` はここ1箇所のみ。auth.uid() へ替えれば全19ポリシー追従。

3. **app_client 認証（群Bの本質修正・HIGH-1）**
   - 群Bの `with check` を GUC ではなく **service_role**（Supabaseの別ロール・検証済JWT）に紐付ける。
     `app_is_service()` を `auth.jwt()->>'role' = 'service_role'`（またはロール比較）へ差替え。
   - フロントは anon/authenticated キー（SELECTのみ）、AI経路のNode/Expressは
     **service_role キーをサーバ環境変数のみで保持**し群B書込に使用。素のクライアントは昇格不能。

4. **RLSカバレッジ拡張（HIGH-2の本質修正・0202 追加mig）**
   - `notifications / notification_targets / training_records / shift_constraints /
     report_templates / report_template_sections / template_section_configs` に
     site_id（子表は親JOIN）RLSを付与し force RLS。
   - `grant select on all tables` を廃止し、RLS済み表への**個別GRANT**へ。子表JOINの `staff`
     依存は security definer 関数へ隔離して直接GRANTを外す（MEDIUM-1）。

5. **Supabase移行チェックリスト**
   - [ ] 全 site-scoped 表に `enable + force row level security`（漏れゼロを `pg_class.relrowsecurity` で検査）
   - [ ] anon/authenticated ロールへの過剰GRANT無し（`information_schema.role_table_grants` で棚卸し）
   - [ ] service_role は環境変数のみ・クライアントバンドルに非混入（Secrets走査）
   - [ ] auth.uid() 結線後に本レポート §1.2 の (a)(b)(c)＋越境読取テストを**再実行しGREEN**
   - [ ] Supabase Advisor の RLS/Security lint を0件化

---

## 5. 未検証事項（本フェーズ範囲外）
- **実Supabase**: 本検証は auth.uid()/service_role を GUC でエミュレートしたローカルPG。
  実Supabase（PostgREST・JWTクレーム・service_roleキー）での挙動は未検証。
- **実認証**: JWTのrole/uidクレーム検証・トークン失効・RLSとの整合は未検証。
- **本番負荷**: EXPLAIN/インデックス効率・接続プール飽和・`app_user_site_ids()` の
  ポリシー毎評価コスト（大規模メンバーシップ時のN+1的サブクエリ）は未計測。
- **実25テーブルDDL**: 0000 は推定ベースライン。実スキーマ確定後の追加列衝突・既存RLS整合は未検証。

---

# retry1 再判定（Fresh Context / Adversary兼Evaluator #17）

- 再検証日: 2026-08-11 / Fresh Context / **実クエリ裏取り済み**
- 対象migration: 0202_rls_hardening.sql（HIGH-1/HIGH-2 是正）を追加適用済みライブDB（127.0.0.1:5433 db=mamorai, trust）
- ロール: `app_client`(rolsuper=f, rolbypassrls=f), `app_service`(rolsuper=f, rolbypassrls=f) を pg_roles で確認

## 総合判定: **PASS（本採用フェーズ 5ゲート全通過）**

前回FAILの根拠だったHIGH-1/HIGH-2を**両方CLOSED**と実証。新たな抜け道は発見されず。
全テナント表(app_site_members除く18表)にRLS+forceが網羅適用され、担当外現場データは
全表で0件・INSERT拒否・service昇格詐称も構造遮断された。27/27 GREEN。

---

## HIGH-1 — service『サーバ専用書込』のGUC詐称 … **CLOSED**（実証）

0202が `app_is_service()` を `current_setting('app.role')='service'`（GUC）から
**`current_user = 'app_service'`**（専用ロール判定・非security-definer）へ置換。加えて
0201のブランケットGRANTを撤回し、群B(shift_optimization_runs/_assignments)の INSERT/UPDATE を
app_client から剥奪→app_service のみへ付与（GRANT層とRLS層の二重遮断）。

実クエリ結果（app_client 接続で GUC 偽装を試行）:

| 検証 | 期待 | 実結果 |
|---|---|---|
| app_client で `set_config('app.role','service')` 後 `app_is_service()` | false | **false**（current_user=app_client）|
| 同接続で `insert into shift_optimization_runs` | 拒否 | **ERROR: permission denied for table**（GRANT層で遮断）|
| app_client で site2宛 daily_reports INSERT | 拒否 | **ERROR: new row violates row-level security policy** |
| app_service 接続で群B INSERT | 成功 | **run_id 返却（app_is_service()=true）** |
| app_service が群A daily_reports SELECT | 拒否(最小権限) | **ERROR: permission denied**（書込特権のみ・広域GRANT無し）|

→ app_client はいかなる GUC を立てても current_user は app_client のまま。群B書込は
GRANT欠如とRLS WITH CHECK の両方で拒否。app_service 別ロール接続でのみ成立。**構造的にCLOSED。**
アプリ層(pool.ts)も withService を**servicePool(app_service固定・別接続)**で実装しGUC非依存。

## HIGH-2 — 担当外現場データの越境読取 … **CLOSED**（実証）

0202が未RLSだった9表(sites/staff/report_templates/report_template_sections/
template_section_configs/shift_constraints/training_records/notifications/notification_targets)に
RLS有効化+force+現場スコープSELECTポリシーを付与。子表は親JOIN(report_templates.site_id /
staff.site_id)で判定。`grant select on all tables` を revoke し、RLS済み表への個別GRANTへ変更。

実クエリ結果（app_client を site1ユーザ u_a=Alice で接続し site2 データ可視性を全テナント表で計測）:

| テーブル | site2データ可視 | 総可視 | 判定 |
|---|---|---|---|
| sites | 0 | 1(自現場のみ) | PASS |
| staff | 0 | 1 | PASS |
| notifications(機密body) | 0(S2 SECRET不可視) | 1(本部一斉=target_site_id NULLのみ可視) | PASS |
| notification_targets | 0 | 0 | PASS |
| training_records(PII) | 0 | 0 | PASS |
| shift_constraints | 0 | 0 | PASS |
| report_templates | 0 | 0 | PASS |
| report_template_sections | 0 | 0 | PASS |
| template_section_configs | 0 | 0 | PASS |
| daily_reports | 0 | 0 | PASS |
| shift_optimization_runs(群B) | 0 | 0 | PASS |
| shift_optimization_assignments(群B) | 0 | 0 | PASS |

→ 担当外現場データは**全テナント表で0件**。本部一斉通知(target_site_id IS NULL)のみ全員可視
（設計意図どおり・機密は target_site_id 付きで現場限定）。**NFR-03「担当外現場が見えない」成立。CLOSED。**

## 抜け道探索 … 新規発見なし

- **RLS網羅**: `pg_class.relrowsecurity=false` は **app_site_members のみ**（18テナント表は全て
  relrowsecurity=t かつ relforcerowsecurity=t）。app_site_members は app_client へ GRANT無しで
  到達不能（`permission denied` 実測）、security definer `app_user_site_ids()` 経由でのみ参照。妥当な除外。
- **public残GRANT**: `information_schema.role_table_grants` で PUBLIC への表GRANT **0件**。
  app_client は SELECT中心+群AのINSERT/UPDATEのみ、app_service は群B書込のみ。過剰GRANTなし。
- **policy健全性**: 全43ポリシーで INSERT=WITH CHECK / SELECT=USING / UPDATE=両方 を確認。
  子表(training_records/report_template_sections/staff_qualifications/notification_confirmations)は
  親JOINでスコープ、USING/WITH CHECK不備なし。`app_is_service()` は prosecdef=f(非definer)で
  呼出側 current_user を評価するため詐称不可。
- **site_id無し子表のJOIN漏れ**: training_records(staff_id→staff.site_id)・
  report_template_sections(template_id→report_templates.site_id) とも実クエリで0件確認済み。

## 5ゲート再判定表

| # | ゲート | 客観根拠(実クエリ) | 判定 |
|---|---|---|---|
| G1 | 適用の健全性 | 0202再適用 EXIT=0・error/fatal無し・冪等・破壊的DDL grep一致なし | **PASS** |
| G2 | RLS実効 | HIGH-1/2 CLOSED実証・18表RLS+force網羅・越境読取0件・GUC詐称遮断・全43policy健全 | **PASS**(前回FAIL→是正) |
| G3 | データ往復 | vitest **27/27 GREEN**(統合: rlsHardening 9 + reportRepo 6 + shiftRepo 4)・withUser/withService実接続で非トートロジー | **PASS** |
| G4 | 秘匿境界/Secrets | (前回PASS維持)Claude鍵サーバ層のみ・env接続・資格情報ハードコード無し | **PASS** |
| G5 | 後方互換 | 0202は追加のみ(enable/force/policy/grant)・0100/0102/0103不変・隔離点 app_user_site_ids() 単一 | **PASS** |

**総合: 5/5 PASS → 本採用フェーズ = PASS。**

## 残課題（PASSブロッカーではない・Supabase本番前に対応推奨）

- **MEDIUM-1（緩和済/残存）**: 子表RLSは app_client の `staff` SELECT権限に依存(JOIN評価)。
  staff自体もRLSでスコープされ越境は塞がったが、staff直接GRANTを外し security definer 関数へ
  隔離すればさらに堅い。本番前の改善項目。
- **LOW-1**: `app.user_id` 未設定時はフェイルクローズ(0行)で安全だが、接続確立時の user_id 必須
  アサーションで事故検知を早めると良い。
- **notifications 一斉通知**: target_site_id IS NULL を全員可視とする設計判断。本部一斉が
  意図どおりだが、業務要件次第で「全員可視の範囲」を明文化しておくこと。
- **未検証(範囲外)**: 実Supabase(PostgREST/JWT/service_roleキー)・実認証・本番負荷は未検証（前回§5継続）。

## 実DDL差替えの隔離点（確定）

1. **0000_base_assumed.sql をファイルごと実DDLへ置換**（app_site_members を実メンバーシップ表へ・
   0100/0102/0103 は列名衝突時のみ差替え）。
2. **唯一の結線点 = `app_user_site_ids()`**: `current_setting('app.user_id')` はこの security definer
   関数1箇所のみ。本体を `auth.uid()` ベースへ差替えれば全43ポリシーが追従。
3. **service判定 = `app_is_service()`**: `current_user='app_service'` を Supabase の
   `auth.jwt()->>'role'='service_role'`（またはロール比較）へ差替え。app層は servicePool の
   接続文字列を service_role キーへ差替えるのみ（GUC非依存で移行が単純）。
4. **RLSカバレッジ検査**: 移行後 `pg_class.relrowsecurity` で漏れ0・`role_table_grants` で
   過剰GRANT0・本節HIGH-1/2の実クエリを再実行しGREENを確認。
