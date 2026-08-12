# Spec Validation Report — MAMOR-AI（再開発 / Tauri PC専用MVP）

**評価者:** Spec-Validator (#06) / プロダクト企画部 品質QA
**対象:** spec/trend-research-report.md, spec/behavioral-spec.md, spec/architecture.md, spec/database-design.md
**日付:** 2026-08-10　**フェーズ:** TRAIDパイプライン Phase 1c（仕様書品質審査）

---

> **本レポートは2回分の審査記録を含む。** 最新の確定判定は末尾の「## v1.1 再審査」節を参照。以下「初回審査」節は経緯として保存する。

---

# 初回審査（v1.0 / 2026-08-10）

## 総合判定

### スコア: 80 / 100 → **CONDITIONAL**

（85以上=APPROVED / 70〜84=CONDITIONAL / 70未満=REJECTED）

Phase0-1bの成果物は、**トレーサビリティ・破壊的変更禁止の機械担保・HITLのDB二重化・秘匿境界設計**が高水準で、単なる文書ではなく「実装可能な設計」に踏み込めている点を高く評価する。一方で、(1) 手動シフト編集（REQ-016）の永続化先が設計に存在しない、(2) 新規16テーブルへの一括RLS書込ポリシーが責務分界（AI経路はNode/service_role書込）より広く、クライアントによるシフト自己確定・予測キャッシュ汚染を許す、(3) 確定シフト候補→実運用シフトへの反映経路が未定義、(4) NFRに反証不能な曖昧語が残る、という**実装前に潰すべき欠落**がある。加えて全DB設計が**既存25テーブルの実DDL未提供（OQ-DB1）という仮定の上**に立っており、この確認なしにSprint1へ全面着手するのは危険。よって差し戻し（CONDITIONAL）とする。

---

## 採点内訳

| # | 審査観点 | 配点 | 得点 | コメント |
|---|---------|------|------|---------|
| 1 | EARS文法適合 | 20 | 17 | 機能REQ 25件は全て WHEN/WHILE/WHERE/IF + THE システム SHALL(NOT) 構文に準拠し、SHALL NOT の否定要件（REQ-007/020/NFR-01）も適切。減点は **NFRの曖昧語**：NFR-02「十分なタップ/クリック領域」・NFR-04「実用範囲に保つ」は数値が無く、そのままでは反証不能。また REQ-016/023 等に複数SHALL相当の複合動作が混在（原子性の軽微な崩れ）。 |
| 2 | テスト可能性 | 20 | 16 | 全REQに Vitest/pgTAP のテスト方針を明記し、DB設計には**実際に走るpgTAPクロスユーザー/HITL検証**まで書かれている点は優秀。減点は**合否閾値の未確定**：REQ-004「工程数が定義閾値以内」(OQ-01)・REQ-011「承認率」(OQ-04)・NFR-04（閾値なし）は、テスト構造はあっても期待値がTBDで現時点では合否判定不能。 |
| 3 | REQ整合性/トレーサビリティ | 20 | 15 | REQ↔ADR↔DBの対応は概ね良好（REQ-020→ADR-005→`chk_hitl_confirm`、NFR-01→ADR-006→2段CIゲート、NFR-03→0103_rls＋pgTAPは模範的）。減点は**貫通しきらない鎖が3本**：①REQ-016手動シフト編集の保存先テーブルが無い（既存shiftsは「触れない」）、②確定候補→実運用シフトのwrite-back経路が未定義、③REQ-010〜012が依存する`v_monthly_report_summary`が「別マイグレーションで用意」と参照されるのみで未提供。 |
| 4 | スコープ健全性 | 15 | 12 | In/Out of Scope は理由付きで明確、Sprint依存順序（基盤→日報依存→シフト/AI→仕上げ）も妥当。減点は**MVPとしての過大**：AIシフト最適化フルスタック（LLM構造化＋OR-Tools＋HITL＋説明生成、High×4）をSprint3のMVP内に内包。trend-research 推奨1は「AIシフトは第2弾」と示唆しており、PoC（OR-Tools可解性）未実施のままMVP必須に置くのは膨張リスク。REQ-013(Sprint2)の実ファイル出力がREQ-025 Tauri(Sprint4)に機能依存する点の表記も要整理。 |
| 5 | リスク/制約の妥当性 | 15 | 12 | NFR-01破壊的変更禁止は**禁止トークン静的検査＋pg_dumpスナップショット差分ホワイトリスト＋down可逆性**で機械担保、HITLはDB CHECK＋部分ユニークで二重化、Claude鍵秘匿とNode経由・anonキーのみ・低価格×AIコスト設計（割付はソルバー=課金ゼロ＋キャッシュ）も筋が通り高評価。減点は**RLS書込ポリシーの過剰付与**（下記HIGH-2）：ADR-002で「AI経路の書込はNode(service_role)」としながら、0103は16テーブル一律にauthenticatedのINSERT/UPDATE/DELETEを付与し、クライアントがシフト自己確定・`risk_prediction_cache`汚染を行える穴が残る。 |
| 6 | Open Questions の質 | 10 | 8 | 「なぜ人間判断が要るか」「担当者」「影響REQ」まで具体で、既存25テーブル実DDL未提供を**OQ-DB1（最重要）/OQ-05/OQ-06**として正面から扱い、`app_user_site_ids()`一関数に想定を隔離するなど誠実。減点は**取りこぼし2点**：確定候補→実運用シフトのwrite-back方針、およびanonキー配布下でのRLS書込スコープがOQ化されていない。 |
| | **合計** | **100** | **80** | **CONDITIONAL** |

---

## 良い点（先に明記）

- **破壊的変更禁止が「宣言」でなく「機械担保」まで到達**。NFR-01→ADR-006→DB§7の2段CIゲート（禁止トークン検査＋スキーマ差分ホワイトリスト＋ロールバック可逆性）は、人手レビューに依存せず追加のみ原則を強制でき、稼働中25テーブルの毀損リスクを構造的に排除している。
- **HITL（AI自動確定禁止）が仕様→設計→DBを貫通**。REQ-020の `SHALL NOT` が ADR-005 の人間ゲート、DBの `chk_hitl_confirm` CHECK＋`uq_one_confirmed_per_run` 部分ユニークまで具体化され、pgTAPで反証テストまで用意されている。trend-research の「全自動確定を避ける」判断が一貫。
- **秘匿境界の設計が明確**。Claude APIキー・重い最適化計算はNode/Express、RLSで守れるCRUDはSupabase直結、という分界がADR-002の表で整理され、NFR-03（anonキーのみ・クロスユーザー拒否）がpgTAPに落ちている。
- **共通入力ロジック層（REQ-001）の一貫性**。UI/DB非依存・純粋関数・import禁止をlint＋テストで機械検証する方針がADR-004→input-core構成まで具体化され、Expo横展開という差別化戦略の前提を初期固定できている。
- **市場調査の結論が仕様に忠実に反映**。「低価格AI配置最適化はCTSYS先行」という不都合な事実を直視し、差別化を「日報×リスク×シフトの統合体験」に再定義、Out of Scope（給与/請求・ハード連携・全自動確定）の理由付けも一貫している。

---

## 指摘リスト（CRITICAL / HIGH / MEDIUM / LOW）

### CRITICAL
なし（絶対的な設計破綻は検出せず）。ただし後述HIGH-0（既存DDL未提供）は、放置してSprint1へ全面着手した場合CRITICAL級に転じ得る**前提リスク**である。

### HIGH

**HIGH-0｜既存25テーブルの実DDL未提供により全DB設計が仮定の上に立つ**
- 該当: database-design.md §0.1 / OQ-DB1・OQ-05・OQ-06、behavioral-spec.md OQ-05/OQ-06
- 問題: FK参照先（`sites.id`/`staff.id`/`auth.users.id`）、追加列対象テーブル名（`daily_reports`等）、RLS現場判定（`user_site_roles`）、REQ-009検索インデックス、REQ-016シフト構造が**すべて推定**。`IF NOT EXISTS`／`app_user_site_ids()`隔離で被害は限定しているが、確認前に確定設計とは言えない。
- 修正提案: Sprint1着手前にRYUGEN/現行運用者から実DDL（`pg_dump --schema-only`）を取得。特に `daily_reports` の列名・`status`列、`shifts`/`assignments`構造、現場メンバーシップテーブルの実体を確定し、仮定箇所（追加列対象・FK・`app_user_site_ids()`）を実名に置換。**未取得のままSprint1着手は不可**。

**HIGH-1｜手動シフト編集（REQ-016）の永続化先が設計に存在しない**
- 該当: behavioral-spec.md REQ-016 / database-design.md 表1.1・L31・L242
- 問題: REQ-016は「カレンダー型勤務表のセル単位編集を**保存**」を要求するが、既存 `shifts` は「参照のみ（触れない）」、新規追加テーブルにも通常シフトの編集保存先が無い（あるのは `shift_optimization_*` 系＝AI下案のみ）。手動編集の書込経路が宙に浮いている。
- 修正提案: (a) 既存 `shifts` へ行INSERT/UPDATEを行う経路をADR/設計に明記（DDL不変＝additive原則に反しない）するか、(b) 実DDL未確認の間は `shift_overrides`（追加テーブル・site_id軸RLS）に編集差分を保持し確定時に反映、のいずれかを設計に追記。OQ-DB1と連動。

**HIGH-2｜新規16テーブルへの一括RLS書込ポリシーが責務分界より過剰**
- 該当: database-design.md §4（0103_rls_additions, L496〜532）/ ADR-002・ADR-003
- 問題: 0103はループで16テーブル全てに authenticated の INSERT/UPDATE/DELETE を付与。しかしADR-002/003では `shift_optimization_*`・`shift_candidate_assignments`・`risk_prediction_cache` は**Node(service_role)が書込、フロントはSELECTのみ**の想定。現状ポリシーでは、担当現場内の悪意あるクライアントが `shift_optimization_candidates` に `confirmed_flag/by/at` を自前で立てて `chk_hitl_confirm` を満たし**Nodeオーケストレーションを経ずにシフトを自己確定**でき、`risk_prediction_cache` も改ざん可能。HITLのDB二重化が実質バイパスされる。
- 修正提案: AI経路テーブル（`shift_optimization_runs/constraints/candidates`, `shift_candidate_assignments`, `risk_prediction_cache`）はフロントを **SELECTのみ**に制限し、INSERT/UPDATE/DELETEは service_role（RLSバイパス）に限定。確定操作もNode経由の専用RPC/エンドポイントに集約。一括ループから当該テーブルを除外し個別ポリシー化する。Security Engineer #14 の必須確認事項に格上げ。

**HIGH-3｜確定シフト候補→実運用シフトへの反映（write-back）経路が未定義**
- 該当: behavioral-spec.md REQ-020/REQ-016 / database-design.md 表1.1
- 問題: HITL確認で `shift_optimization_candidates.review_status='confirmed'` に至った後、その割当（`shift_candidate_assignments`）が**実運用の勤務表（既存shifts）へどう反映されるか**が仕様・設計のいずれにも無い。データフローが候補テーブルで途切れ、AIシフトが現場に反映されない。
- 修正提案: 確定候補→運用シフト反映の経路（Node経由の反映処理か、追加テーブルからのビュー統合か）を設計に追記し、REQとして起票。HIGH-1と合わせシフト永続化モデルを一本化。OQへ追加。

### MEDIUM

**MEDIUM-1｜月報集計ビュー `v_monthly_report_summary` が参照のみで未提供**
- 該当: database-design.md §6.1（L661）/ REQ-010・011・012
- 問題: 月報集計は「追加ビュー/RPCに集約」と方針提示され `v_monthly_report_summary` が名指しされるが、テーブル一覧・マイグレーション本体に実DDLが無く「別マイグレーションで用意」止まり。REQ-010〜012の集計基盤が空白。
- 修正提案: 当該ビュー/RPCのDDLを（実列名確認後＝OQ-DB1連動で）マイグレーションに追加、もしくはSprint2成果物として明示的にスコープ化。

**MEDIUM-2｜NFR-04「実用範囲」が反証不能**
- 該当: behavioral-spec.md NFR-04
- 問題: 「主要画面の表示応答を実用範囲に保つ」は数値目標もOQも無く、テスト可能性欄も「応答時間計測」とあるが合否線が無い。
- 修正提案: 代表データ量（例 日報N万件）での主要画面応答目標（例 P95 < 1.5s）を数値化、もしくはOQ化して閾値確定を先送りする旨を明記。

**MEDIUM-3｜NFR-02の曖昧語（十分な）**
- 該当: behavioral-spec.md NFR-02
- 問題: 「十分なタップ/クリック領域」は測定不能。数値はOQ-01に委ねられているが、SHALL文自体が曖昧。
- 修正提案: 「最小フォント◯pt・最小タップ領域◯px・工程数≦◯（いずれもOQ-01で確定）」と、確定前でも測定軸を明示した表現へ書き換え。

**MEDIUM-4｜REQ-013(PDF/Excel出力,Sprint2)がREQ-025 Tauri(Sprint4)に機能依存**
- 該当: behavioral-spec.md REQ-013/REQ-025・依存関係マップ（REQ-013 → REQ-025）
- 問題: 依存マップは「025が013に依存」だが、実ファイル保存/印刷はTauri層（REQ-025, Sprint4）が担うため、REQ-013の**実出力はSprint2で完結しない**。Sprint2の成果が「中間データ構造まで」であることが本文で明示されておらず、完了判定がぶれる。
- 修正提案: REQ-013に「Sprint2は出力用中間データ構造まで、実ファイル生成/印刷はREQ-025完了後（Sprint4結合）で検証」と受入範囲を明記。

**MEDIUM-5｜AIシフト最適化フルスタックのMVP内包（スコープ膨張）**
- 該当: behavioral-spec.md Sprint3（REQ-018〜021）/ trend-research 推奨1・推奨6
- 問題: OR-Tools可解性PoC未実施のまま、High×4のAI最適化をMVP必須スコープに置く。trend-research自身が「AIシフトは日報の次（第2弾）」と示唆。実現不確実性が高くMVP全体を遅延させ得る。
- 修正提案: REQ-018〜021を「PoC（警備制約がOR-Toolsで解けるか）成功をゲートに着手するfast-follow」と位置付け、MVPコア（日報×リスク）から明示分離。PoCをSprint3着手前タスクとして起票。

### LOW

**LOW-1｜REQ-009検索インデックスがOQ-DB1待ちで無効化**
- 該当: database-design.md §2 L212-215
- 問題: 日報一覧/検索の複合インデックスが実列名未確認でコメントアウト。REQ-009のNFR-04充足は現時点で担保されていない（OQ-DB1で解消見込み）。
- 修正提案: OQ-DB1確定直後に有効化するTODOとしてSprint1タスクに紐付け。

**LOW-2｜REQ-011のテスト期待値がOQ-04（承認率の分母）未確定に依存**
- 該当: behavioral-spec.md REQ-011/OQ-04
- 問題: 承認率の分母定義が未確定のため、テストの期待値が確定できない。
- 修正提案: OQ-04確定を「REQ-011実装前」の前提としてSprint2ガイドに明記。

**LOW-3｜複数SHALL相当の複合REQ（原子性）**
- 該当: behavioral-spec.md REQ-016（表示＋編集保存）・REQ-023（抽出＋表示）
- 問題: 1REQに複数の検証対象動作が同居し、テスト/トレースの粒度がやや粗い。
- 修正提案: 必要に応じサブREQ分割、または受入条件を箇条化。

---

## 修正すべき必須項目（CONDITIONAL解除条件）

以下を修正のうえ再提出すること。**HIGH全件＋MEDIUM-1/2は必須**、MEDIUM-3〜5・LOWは強く推奨。

1. **[HIGH-0]** 既存25テーブル実DDLを取得し、仮定箇所（FK・追加列対象・`app_user_site_ids()`）を実名に置換。未取得ならSprint1着手不可であることを合意。
2. **[HIGH-1/HIGH-3]** 手動シフト編集の保存先、および確定候補→実運用シフトのwrite-back経路を設計に追記し、シフト永続化モデルを一本化（必要なら新REQ・新OQ起票）。
3. **[HIGH-2]** 0103のRLS書込ポリシーを見直し、AI経路テーブル（`shift_optimization_*`／`shift_candidate_assignments`／`risk_prediction_cache`）はフロントSELECTのみ・書込はservice_role/Node経由に限定。Security Engineer #14 の確認を条件化。
4. **[MEDIUM-1]** `v_monthly_report_summary`（またはRPC）の実DDLをマイグレーションに追加、もしくはSprint2成果物として明示スコープ化。
5. **[MEDIUM-2/3]** NFR-02/NFR-04を測定可能な数値（またはOQ紐付き）へ書き換え、反証可能にする。

APPROVED相当（再審査で85点以上）に至れば、Generator起動（Sprint1）へ進行可。なお本指摘は主に architecture.md / database-design.md の整合・RLS・シフト永続化に関わるため、修正は Planner 単独でなく **Architect(#07)・Database Engineer(#08) の再連携**を要する。

---

## RYUGENが実装Sprint前に回答すべき Open Questions（統合・名寄せ済み）

各specのOQを名寄せ・重複排除して統合した。★=最重要（これが未確定だと着手不可/手戻り甚大）。

| 統合ID | 質問（名寄せ元） | 重要度 | 担当 | 影響REQ/設計 |
|--------|----------------|--------|------|-------------|
| **UQ-01 ★** | **既存25テーブルの実DDL**（`daily_reports`列名/`status`列、`shifts`/`assignments`構造、`sites`/`staff`/`notifications`/`training_records`の実在・主キー、**現場メンバーシップテーブルの実体**、`risk_predictions`の有無）〔OQ-05, OQ-06, OQ-DB1, OQ-DB2, OQ-DB3〕 | High | RYUGEN / DB Engineer / Architect | 全DB設計・FK・追加列対象・`app_user_site_ids()`・REQ-009/014/016 |
| **UQ-02 ★** | **AIシフト最適化で扱う制約条件の網羅**（有資格・勤務間隔・希望休・必要人数・連続勤務上限 等）と**ハード/ソフトの区別**〔OQ-03, OQ-DB4〕 | High | RYUGEN / Architect | REQ-018/019 最適化モデル。抜けは違法配置に直結。`constraint_type` enum拡張要否 |
| **UQ-03 ★** | **「1分日報」の必須入力項目の最小集合と操作工程数の上限**（NFR-02のアクセシビリティ数値基準＝最小フォント/タップ領域も連動）〔OQ-01〕 | High | RYUGEN | REQ-004 / NFR-02。中核差別化の成立条件 |
| UQ-04 | プリフィルの参照元優先順位（前日 / 直近提出済 / 現場テンプレート既定値）〔OQ-02〕 | High | RYUGEN | REQ-003 初期値決定ロジック |
| UQ-05 | 既存Claude APIリスク予測エンジンの入出力I/F仕様（返却フィールド・呼び出し方法・更新頻度）〔OQ-05, OQ-DB2〕※UQ-01と一部重複、I/F面を別掲 | High | Architect / DB Engineer | REQ-014連携。未確認だと結合不能・予測キャッシュ設計未確定 |
| UQ-06 | 月報「承認率」の分母定義（提出済 / 全対象日 / 作成済）〔OQ-04〕 | Mid | RYUGEN | REQ-011 集計値・テスト期待値 |
| UQ-07 | 月報PDF/Excelの確定レイアウト（提出先フォーマット・帳票様式）〔OQ-07〕 | Mid | RYUGEN | REQ-013 出力実装 |
| UQ-08 | 資格「更新間近」の基準日数・法定研修時間（新任/現任/業務別）の要件値〔OQ-10〕 | Mid | RYUGEN / Legal | REQ-023 分類・アラート閾値 |
| UQ-09 | Tauri のOSサポート範囲（Windows/WebView2単独か）とWebView2ランタイム配布方式〔OQ-09〕 | Mid | RYUGEN / Architect | REQ-025 検証範囲 |
| UQ-10 | 交通誘導（2号）業務を将来対象に含めるか、含める場合の日報様式差分〔OQ-08〕 | Mid | RYUGEN | スコープ境界・MVP後拡張 |
| UQ-11 | 低価格帯の目標価格（隊員規模別月額）と課金単位（現場数/隊員数）〔OQ-11〕 | Mid | RYUGEN / Finance | NFR-03の現場単位RLS/課金整合・AIコスト整合 |
| UQ-12（新規） | 手動シフト編集の保存先、および**確定AIシフト→実運用シフトへのwrite-back経路**（本審査HIGH-1/HIGH-3で新規に露見） | High | RYUGEN / Architect / DB Engineer | REQ-016/020 のシフト永続化モデル |

### RYUGENへの最重要確認 3点
1. **UQ-01: 既存25テーブルの実DDL提供**（特に現場メンバーシップテーブル）— これ無しにDB設計・RLS・FKは仮定のままで、Sprint1着手は不可。
2. **UQ-02: AIシフト制約の網羅とハード/ソフト区別** — 抜けは違法・不当配置に直結。最適化モデル（REQ-018/019）の根幹。
3. **UQ-03: 1分日報の必須項目最小集合と工程数上限** — 製品の中核差別化とNFR-02アクセシビリティ基準の成否を決める。

---

## 次アクション

1. Planner(#05) が本レポートの**修正必須項目1〜5**を、Architect(#07)・Database Engineer(#08) と連携して反映（HIGH-1〜3はDB/アーキ修正を伴う）。
2. RYUGENへ **UQ-01/02/03** を Chief Secretary 経由で先行確認依頼。
3. 修正版を再提出 → 再審査で85点以上を確認後、Generator起動（Sprint1）へ進行。

---
---

# v1.1 再審査（2026-08-10 / CONDITIONAL 是正の再審査）

**対象:** database-design.md v1.1 / architecture.md v1.1 / behavioral-spec.md v1.1（各末尾「v1.1是正履歴」・新規 §3.5/§4群B/§4.5・ADR-002/ADR-008 を精査）
**是正実施:** Architect(#07) ＋ Database Engineer(#08) 合同

## 総合判定（v1.1）

### スコア: 80 → **91 / 100**（+11）→ **APPROVED**

（85以上=APPROVED / 70〜84=CONDITIONAL / 70未満=REJECTED）

前回CONDITIONALの根拠であった **HIGH-1（手動シフト編集の保存先不在）・HIGH-2（AI経路テーブルへのRLS書込過剰付与）・HIGH-3（確定候補→実運用シフトのwrite-back経路未定義）を、いずれも「形だけの追記」ではなく実体（新規テーブル・RLS群分離・ADR・pgTAP検証）を伴って解消**したことを確認した。特にHIGH-2は、群Bの書込ポリシーを**意図的に一切作らない**設計＋`force row level security`＋pgTAP(7)(8)の反証テストで、「担当現場内の悪意あるクライアントによるシフト自己確定（HITLバイパス）・予測キャッシュ汚染」を構造的に遮断できており、単なる注記ではなく機械担保に到達している。MEDIUM-1/2/3も是正済み。よって **APPROVED**。

ただし **Sprint1着手は HIGH-0（既存25テーブルの実DDL提供＝UQ-01）を外部依存ゲートとする**（後述）。これは仕様書の品質欠陥ではなく RYUGEN 側の提供待ちであり、本採点では減点しない。

## 採点内訳（前回→今回）

| # | 審査観点 | 配点 | 前回 | 今回 | 変化根拠 |
|---|---------|------|------|------|---------|
| 1 | EARS文法適合 | 20 | 17 | **19** | NFR-02（16px/44px/10タップ・OQ-01追随）・NFR-04（P95<1.5s＋代表データ量）が反証可能な数値へ。残る軽微減点はREQ-016/023の複合動作（原子性）のみ。 |
| 2 | テスト可能性 | 20 | 16 | **18** | pgTAP(7)(8)で「群Bへのクライアントinsert/update拒否＝42501」を実テスト化。NFR-04にP95合否線。残減点はOQ-01(工程数)・OQ-04(承認率分母)が依然TBDで一部期待値が未確定。 |
| 3 | REQ整合性/トレーサビリティ | 20 | 15 | **18** | **貫通しなかった鎖3本が全て接続**：①REQ-016→`shift_overrides(source='manual')`、②REQ-020→ADR-008→`shift_overrides(source='ai_apply')`、③REQ-010〜012→0105ビュー。残減点はマージビュー(既存shifts＋overrides)がOQ-DB1待ちで未提供、0105が「保留（Sprint2有効化）」の暫定である点。 |
| 4 | スコープ健全性 | 15 | 12 | **13** | シフト永続化モデルの一本化でSprint3スコープの輪郭が明確化。ただしMEDIUM-4（REQ-013のSprint2完結範囲）・MEDIUM-5（AIシフトPoCゲート化）は「強く推奨」止まりで未反映のため小幅加点に留める。 |
| 5 | リスク/制約の妥当性 | 15 | 12 | **14** | 最大の穴だったHIGH-2 RLS過剰付与を群B SELECT限定＋pgTAPで解消。残減点は「手動編集(source='manual')行をai_apply反映が上書きしない保護」がADR-008の文面規定に留まりDB制約化されていない点（Generator実装依存）。 |
| 6 | Open Questions の質 | 10 | 8 | **9** | 前回取りこぼしのUQ-12（write-back方針）が設計で解決され、新たな残OQ（マージ載せ替え・manual上書き既定）をADR-008に明記。誠実。 |
| | **合計** | **100** | **80** | **91** | **APPROVED** |

## 各HIGH指摘の是正検証（CLOSED / OPEN）

**HIGH-1｜手動シフト編集の保存先不在 → CLOSED**
- 検証: `shift_overrides`（0104 / database-design.md §3.5）を新設。`(site_id, staff_id, work_date)` 一意、`source='manual'` 既定。RLSは群A同様に担当現場CRUD＋INSERT時 `source='manual' and edited_by=auth.uid()` を強制し、クライアントによる `ai_apply` 偽装を防止。REQ-016本文にも設計注記を追記。既存 `shifts` に触れない追加のみ。**実体を伴う解消。**

**HIGH-2｜AI経路テーブルへのRLS書込過剰付与 → CLOSED**
- 検証: 0103を **群A（本人・現場担当がCRUD／11表）** と **群B（`shift_optimization_runs/constraints/candidates/assignments`＋`risk_prediction_cache`＝SELECTのみ）** に分離。群Bは INSERT/UPDATE/DELETE ポリシーを**一切作成しない**＋`force row level security`で、anonキー(authenticated)からの書込を全拒否。書込は service_role(RLSバイパス)を持つ Node 専用RPCに限定。pgTAP(7)は予測キャッシュ直INSERT拒否(42501)、(8)は候補への確定UPDATE拒否(42501)を実テスト化。`shift_candidate_assignments` は自前で `site_id not null`（§0.2 L372）を保持しSELECTポリシーが成立。**HITL二重化のバイパス経路を構造的に閉塞。辛口に見ても形式追記ではなく機械担保。**

**HIGH-3｜確定候補→実運用シフトのwrite-back未定義 → CLOSED**
- 検証: ADR-008を新設。確定検知→Nodeが `shift_candidate_assignments` を走査し `shift_overrides(source='ai_apply')` へ `(site_id,staff_id,work_date)` upsert（冪等）→候補に `applied_status/at/by` 記録。再最適化時は旧候補を `superseded` に落とす。反映は service_role 限定でHIGH-2と整合。候補側 `applied_*` はNULL許容追加列で後方互換。データフローの断絶が解消。**CLOSED。** ※残課題（DB非強制の手動保護）は下記OPEN-minorへ。

**HIGH-0｜既存25テーブル実DDL未提供 → OPEN（外部依存ゲート／仕様欠陥ではない）**
- 判定: 本件は RYUGEN 提供待ちの外部依存であり、`app_user_site_ids()` 隔離・`IF NOT EXISTS`・各所の「実DDL判明後に再判定」注記で被害は限定されている。**採点上は減点しない。** ただし **UQ-01 の提供が Sprint1 着手の前提条件**であることを判定に明記する（マージビュー・0105実列名・REQ-009インデックスがこれに連動）。

## 残存する軽微事項（APPROVEDを妨げないが実装時に潰す）

- **OPEN-minor-1（Generator実装依存）:** ADR-008の「`source='manual'` 行をAI反映が上書きしない」保護がDB制約でなく文面規定。反映upsertの `WHERE`/`ON CONFLICT DO UPDATE` 条件で manual 行除外を実装で担保すること（回帰テスト必須）。
- **OPEN-minor-2:** 0105月報ビューは列名がOQ-DB1待ちで「Sprint2着手時に有効化」の暫定。承認率分母もOQ-04確定まで暫定式。REQ-010〜012はinput-core純粋関数で先行検証する二層構成で回避されており可。
- **MEDIUM-4/5（前回・強く推奨）:** REQ-013のSprint2完結範囲の明記、AIシフト最適化のPoCゲート化は未反映。Sprint3着手判断時にPlanner/Architectで再確認を推奨（ブロッカーではない）。

## 判定と次アクション（v1.1）

1. **判定: APPROVED（91点）。** Generator(#10) 起動（Sprint1）へ進行可。
2. **ただし Sprint1 着手の前提条件 = UQ-01（既存25テーブル実DDL、特に現場メンバーシップテーブル）の RYUGEN 提供。** 未提供の間は `app_user_site_ids()`・追加列対象・FK・マージビューが仮定のままで、実装確定不可。Chief Secretary 経由で先行取得すること。
3. DevOps(#—)/Security Engineer(#14) は群B書込がNode/service_role専用である前提でCI/RLS回帰を組む。

---

## RYUGEN が実装Sprint前に回答すべき Open Questions（統合・最終版）

前回統合リストを、v1.1是正の結果で更新した。★=最重要（未確定だと着手不可/手戻り甚大）。UQ-12は設計で解決済みだが残OQを内包。

| 統合ID | 質問 | 重要度 | 担当 | 影響REQ/設計 | v1.1状態 |
|--------|------|--------|------|-------------|---------|
| **UQ-01 ★最重要** | **既存25テーブルの実DDL**（`daily_reports`列名/`status`、`shifts`/`assignments`構造、`sites`/`staff`/`notifications`/`training_records`の実在・主キー、**現場メンバーシップテーブルの実体**、`risk_predictions`有無） | High | RYUGEN / DB Eng / Architect | 全DB設計・FK・追加列対象・`app_user_site_ids()`・0105実列名・REQ-009/014/016・マージビュー | **未提供＝Sprint1着手ゲート** |
| **UQ-02 ★最重要** | **AIシフト最適化の制約条件の網羅**（有資格・勤務間隔・希望休・必要人数・連続勤務上限 等）と**ハード/ソフトの区別** | High | RYUGEN / Architect | REQ-018/019。抜けは違法配置に直結。`constraint_type` enum拡張要否 | 未確定 |
| **UQ-03 ★最重要** | **「1分日報」の必須入力項目の最小集合と操作工程数の上限**（NFR-02の最小フォント/タップ領域の確定値も連動） | High | RYUGEN | REQ-004/NFR-02。中核差別化の成立条件。現状16px/44px/10タップは暫定値 | 暫定値で数値化済・最終値待ち |
| UQ-04 | プリフィルの参照元優先順位（前日/直近提出済/現場テンプレ既定値） | High | RYUGEN | REQ-003 初期値決定 | 未確定 |
| UQ-05 | 既存Claudeリスク予測エンジンの入出力I/F仕様（返却フィールド・呼出方法・更新頻度） | High | Architect / DB Eng | REQ-014連携・予測キャッシュ設計 | 未確定 |
| UQ-06 | 月報「承認率」の分母定義（提出済/全対象日/作成済） | Mid | RYUGEN | REQ-011 集計値・0105式・テスト期待値 | 暫定=提出済（0105に明記）・最終値待ち |
| UQ-07 | 月報PDF/Excelの確定レイアウト（提出先フォーマット） | Mid | RYUGEN | REQ-013 出力実装 | 未確定 |
| UQ-08 | 資格「更新間近」基準日数・法定研修時間（新任/現任/業務別） | Mid | RYUGEN / Legal | REQ-023 分類・閾値 | 未確定 |
| UQ-09 | Tauri のOSサポート範囲とWebView2ランタイム配布方式 | Mid | RYUGEN / Architect | REQ-025 検証範囲 | 未確定 |
| UQ-10 | 交通誘導（2号）業務を将来対象に含めるか・日報様式差分 | Mid | RYUGEN | スコープ境界 | 未確定 |
| UQ-11 | 低価格帯の目標価格（隊員規模別月額）と課金単位 | Mid | RYUGEN / Finance | NFR-03のRLS/課金整合・AIコスト整合 | 未確定 |
| UQ-12 | 手動シフト編集の保存先・確定AI→実運用のwrite-back経路 | High | Architect / DB Eng（設計解決）→ RYUGEN（既定値） | REQ-016/020 永続化モデル | **設計解決済**。残OQ=①実DDL判明後 `shift_overrides` 維持 or 既存 `shifts` 追加列へ載せ替え、②manual編集済セルへのAI反映の上書き既定値、を RYUGEN と確定 |

### RYUGENへの最重要確認 3点（最終版）
1. **UQ-01: 既存25テーブルの実DDL提供（特に現場メンバーシップテーブル）** — これ無しにはDB設計・RLS・FK・マージビューが仮定のまま。**Sprint1着手の前提ゲート。**
2. **UQ-02: AIシフト制約の網羅とハード/ソフト区別** — 抜けは違法・不当配置に直結。最適化モデル（REQ-018/019）の根幹。
3. **UQ-03: 1分日報の必須項目最小集合と工程数上限** — 製品の中核差別化とNFR-02数値基準（現状16px/44px/10タップは暫定）の最終確定。
