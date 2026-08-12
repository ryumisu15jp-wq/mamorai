# Architecture Decision Records — MAMOR-AI（再開発 / Tauri PC専用MVP）

**作成:** Architect (#07) / 開発本部 部長　**作成日:** 2026-08-10　**版:** v1.1（Spec-Validator CONDITIONAL 是正）
**参照:** spec/behavioral-spec.md（Planner #05, 機能REQ 25件 + NFR 4件）、spec/trend-research-report.md（Trend Researcher #04 / Phase 0）、MAMORAI_all_screens_v2.html（全11画面 v2）
**対象:** TRAIDパイプライン Phase 1b（アーキテクチャ決定）

---

## 0. 全体方針（このADR群が答えるべき問い）

build指示は絶対前提であり、本ADRは「その前提を **どう実現するか**」を記録する。核となる技術的問いは4つ:

1. **どこで動くか** — Tauri PC専用デスクトップ（WebViewラップ）で既存React/Vite資産をどう載せるか（ADR-001）。
2. **誰が何に責任を持つか** — フロント（Supabase直結）とNode/Express（AI・秘匿ロジック）の責務分界（ADR-002 / ADR-003）。
3. **どう再利用するか** — 日報/月報の入力ロジックをUIから分離し、将来Expoで再利用可能にする共通層（ADR-004）。
4. **どう最適化するか** — AIシフト最適化を「LLM構造化 → 数理最適化 → 人間確認（HITL）」でどう安全・低コストに回すか（ADR-005）。

これに「破壊的変更なしのスキーマ拡張（ADR-006）」「通知/リアルタイム・教育記録の扱い（ADR-007）」、v1.1で追加した「確定AIシフト→実運用シフトへの反映フロー（ADR-008）」を加えた **8件のADR** で構成する。設計原則は **YAGNI（PC専用MVPに不要なものは作らない）** と **層の責務境界を初期固定**（特にinput-core、REQ-001はHighリスク）。

---

## ADR-001: Tauri でラップした PC専用デスクトップアプリを採用（vs Electron）

日付: 2026-08-10 / 状態: Accepted

### 背景
MAMOR-AI は事務所PCで複数現場を横断管理する管制・事務担当（ペルソナ「三角さん」）が主ユーザーで、ブラウザタブに埋もれない常駐デスクトップ体験・印刷・Excel/PDF出力との親和性が実務価値の核（REQ-025）。既存資産は React + Vite のWebフロントであり、これをネイティブ相当のデスクトップに載せる必要がある。build指示で **TauriによるWebViewラップ・PC専用MVP** が確定している。

### 決定事項
- **Tauri v2** で既存 React/Vite フロントを **OS標準WebViewにラップ**し、単一デスクトップアプリ `apps/desktop` として配布する（REQ-025）。
- **MVPの主対象OSは Windows / WebView2**（trend-research 4-1、OQ-09）。Mac/Linuxは検証範囲外（Out of Scope）。
- Rust（`src-tauri`）側の実装は **最小限（ファイル保存 / ローカル印刷 / 自動更新 = updater）** に限定する。業務ロジックはRustに持ち込まない（Web層とinput-coreに集約）。
- 重い処理・秘匿処理はTauri内で完結させず、Node/Express経由とする（ADR-003と整合）。

### 代替案
| 案 | 利点 | 却下理由 |
|----|------|---------|
| **Electron** | エコシステム成熟、Chromium同梱でレンダリング差異が出にくい | バイナリ150MB級・メモリ大でChromium同梱。中小の非力な事務所PCに重い。既存Vite資産の移行メリットもTauriと同等で、軽量性の差（実測96%小型化報告）を捨てる理由がない（trend-research 4-1） |
| **PWA / ブラウザのまま** | 実装コスト最小、配布不要 | 「常駐デスクトップ・ローカル印刷・Excel/PDF保存・自動更新」（REQ-025）の一級体験と信頼性が出ない。差別化の柱「事務所PCで完結」（trend-research 3-2-4）が薄まる |
| **ネイティブ(WPF/C#等)で作り直し** | OS最適 | React/Vite/Supabase/共通ロジックの既存資産を全放棄。個人〜小規模開発のキャパを超える。YAGNI違反 |

### スケーラビリティ評価
- **100 / 1,000 / 10,000 ユーザー**: クライアントはローカル実行のため、ユーザー数増加はデスクトップ側のボトルネックにならない。負荷はSupabase（ADR-002）とNode/Express（ADR-003）に集約される。
- 留意点: **WebView2ランタイムの配布方式**（Evergreen常駐 vs Fixed Version同梱）を検証必須（OQ-09）。レンダリング差異はWindows単一対象化で最小化する。自動更新（Tauri updater）の署名鍵運用を初期に固める。

### 結果
- Frontend Developer(#12): 既存React/Vite UIを `apps/desktop` として構成し、印刷・保存呼び出しは **Tauri API を直接叩かず抽象レイヤ（platform adapter）越し**に呼ぶ（REQ-025のテスト可能性 / 将来Expo差し替えのため）。
- DevOps Agent(#13): Windows向けTauriビルド・署名・updaterのCI/CDをSprint4で構築。
- 検証タスク（Sprint4前倒し推奨）: Windows/WebView2での印刷・Excel/PDF保存・自動更新のPoC（trend-research 推奨6-a）。

---

## ADR-002: React + Vite フロント & Supabase 直結、責務分界は「参照系はRLSで直結／秘匿・重処理はNode経由」

日付: 2026-08-10 / 状態: Accepted

### 背景
build指示で「フロントはSupabaseへ直接接続（RLS前提）」「バックエンドはNode/Express + AI予測エンジンを維持」が確定。デスクトップアプリからのSupabase直結では **RLSが唯一の防御線**（NFR-03、trend-research 4-3）。何をフロント直結で行い、何をNode経由（=AI/秘匿ロジック）に残すかの **責務分界** を明確化しないと、APIキー露出・課金保護・データ分離が破綻する。

### 決定事項 — 責務分界の原則
**「Supabaseの認可(RLS)だけで安全に守れるCRUD/参照は直結。RLSでは守れない“秘密・課金・重い計算・第三者API”はNode/Express経由」** を分界線とする。

| 処理 | 経路 | 根拠 |
|------|------|------|
| 日報のCRUD・下書き・提出・承認（REQ-005/008/009） | **Supabase直結** | 現場単位RLSで完結。低レイテンシ・実装簡素 |
| 月報集計の読み取り・シフト表/配置表のCRUD（REQ-010〜013/016/017） | **Supabase直結**（集計はビュー/RPC） | RLSで現場スコープを担保できる |
| 通知の購読・教育記録/資格の参照（REQ-022/023） | **Supabase直結**（+Realtime, ADR-007） | 読み取り主体・RLSで守れる |
| **Claude APIリスク予測の取得（REQ-014/015）** | **Node/Express経由（必須）** | Claude APIキー秘匿・課金保護（NFR-03）。クライアント直叩き禁止 |
| **AIシフト最適化（LLM構造化＋ソルバー, REQ-018〜021）** | **Node/Express経由（必須）** | APIキー秘匿＋重い最適化計算をサーバ側で（ADR-005） |
| 提出時の最終バリデーション | フロント（input-core, ADR-004）**＋ DBの追加のみ制約/RLS** で二重化 | 単一防御に依存しない |

- フロントは `@supabase/supabase-js` で **anonキーのみ**を保持（service_role鍵は絶対にバンドルしない、NFR-03）。全テーブルアクセスはRLSポリシー前提。
- 現場スコープは `site_id` を軸にRLSで分離（ADR-006 / 申し送り）。

**【v1.1 HIGH-2 是正：AI経路テーブルはフロントSELECTのみ／書込はNode(service_role)限定】**
上の分界（「RLSで守れる参照＝直結」）は **読取** を許すが、**AI経路テーブルへの書込までは許さない**。`shift_optimization_runs/constraints/candidates`・`shift_candidate_assignments`・`risk_prediction_cache` は Node(service_role) が書込む前提であり、これらの **クライアント直結は SELECT のみ**（INSERT/UPDATE/DELETE のRLSポリシーを付与しない）。理由は、担当現場内の悪意あるクライアントが `confirmed_flag/by/at` を自前で立てて DB制約 `chk_hitl_confirm` を満たし、**Nodeオーケストレーションを経ずにシフトを自己確定**（HITLバイパス）できたり、`risk_prediction_cache` を汚染できる穴を塞ぐため。**HITL確定・最適化結果の永続化・予測キャッシュ更新は、service_role を持つ Node/Express の専用エンドポイント/RPC に限定**する（下表の該当行を「Node経由（必須）」に格上げ）。実運用シフトへの反映も同様にNode経由（ADR-008）。DB側のポリシー分離は database-design.md §4（0103, 群A/群B）に対応。

| 処理（v1.1で明確化した書込境界） | 経路 | 根拠 |
|------|------|------|
| AIシフト最適化結果・候補・割当の**永続化/更新**（REQ-019） | **Node/Express（service_role, 必須）** | クライアント書込を許すとHITL自己確定を許容（HIGH-2） |
| シフト下案の**HITL確定操作**（REQ-020） | **Node/Express 専用RPC（必須）** | 確認フラグの真正性をサーバで担保。DB制約と二重化 |
| 確定候補→実運用シフトの**反映（write-back）**（REQ-020→REQ-016） | **Node/Express（service_role, 必須）** | ADR-008。`shift_overrides(source='ai_apply')` へ冪等反映 |
| 予測キャッシュ `risk_prediction_cache` の**書込**（REQ-014） | **Node/Express（必須）** | 予測キャッシュ汚染防止・Claude課金保護 |
| **手動**シフト編集（セル単位）（REQ-016） | **Supabase直結**（`shift_overrides`, source='manual'） | 本人・現場担当が書く領域。RLSで担当現場に限定 |

### 代替案
| 案 | 利点 | 却下理由 |
|----|------|---------|
| **全アクセスをNode/Express経由（BFF一枚岩）** | 認可を1箇所に集約、RLS不要 | 単純CRUDまでサーバ経由でレイテンシ増・実装量増。build指示の「Supabase直結」に反する。Supabaseの強みを捨てる |
| **全アクセスをSupabase直結（Nodeレス）** | 最小構成 | Claude APIキーがクライアントに露出し課金・秘匿が破綻（NFR-03）。重い最適化計算をクライアントで回せない。build指示の「Node/Express維持」に反する |
| **Supabase Edge Functionsで秘匿処理** | サーバレスで運用軽い | 既存 Node/Express + AI予測エンジン資産を活かせない（build指示は維持を明示）。将来的な代替候補としては保持 |

### スケーラビリティ評価
- **100**: Supabase Free〜Pro / Node/Express 1インスタンスで十分。
- **1,000**: Supabase Pro。直結参照はRLS付きインデックスクエリで線形。Node/ExpressはAI予測・最適化のみ担うため負荷は「予測/最適化リクエスト数」に比例（CRUDトラフィックはNodeを通らない=Nodeが薄く保てる）。
- **10,000**: 直結参照はDB側インデックス・集計ビューの最適化が要（NFR-04、DB Engineer）。Node/ExpressはAI系のみのため水平スケール容易。Claude API課金がコストの主変数（ADR-005でキャッシュ/バッチ制御）。

### 結果
- Frontend Developer(#12): データアクセスを **`supabaseClient`（直結）** と **`apiClient`（Node/Express宛）** の2アダプタに分離。AI系（予測・最適化）は必ず`apiClient`経由。UIコンポーネントはinput-core（ADR-004）を呼び、Supabaseクライアントを直接importしない。
- Database Engineer(#08): 直結される全テーブルにRLSポリシー先行設計（末尾申し送り）。集計は重いクエリをビュー/RPC化しN+1回避（NFR-04）。
- Generator(#10): Node/Express側に予測ゲートウェイ・最適化ゲートウェイを実装（ADR-003/005）。

---

## ADR-003: 既存 Node/Express + Claude AI予測エンジンを維持し、秘匿ゲートウェイとして拡張

日付: 2026-08-10 / 状態: Accepted

### 背景
既存の Claude API リスク予測エンジン（p-risk / ダッシュボードの「MAMOR-AI予測」）は競合にない独自資産で、差別化の柱（trend-research 3-2-2）。build指示で「Node/Express + AI予測エンジンを維持」「Claude APIキーはサーバ側に隠蔽」が確定。既存予測I/Fを壊さず、リスク予測（REQ-014/015）とAIシフト最適化（REQ-018〜021）の両方の入口として拡張する必要がある。予測I/Fの実仕様は未確認（OQ-05）。

### 決定事項
- **既存 Node/Express を「AI・秘匿処理ゲートウェイ」として維持・拡張**する（`server/`）。Claude APIキー・最適化ソルバーはこの層にのみ存在させる（NFR-03）。
- エンドポイントを2系統に整理:
  - `POST /api/risk/*` — リスク予測（既存予測エンジンのラップ）。既存I/Fは **後方互換ラッパ**で包み、フロントには正規化済みDTO（種別/ポジション/リスク度/発生確率/要因タグ、REQ-014）を返す。既存呼び出しは変更しない。
  - `POST /api/shift/optimize`・`/api/shift/structure` — AIシフト最適化（ADR-005）。
- Supabaseとの関係: Nodeは **Supabaseのservice_role**（またはユーザーJWT委譲）で必要データを読むが、書き込みは最小限。原則データの正はSupabaseに置く。
- OQ-05（既存予測I/F仕様）確定までは **アダプタ層（`server/services/claude.ts`）で予測エンジンを抽象化**し、I/F差異を吸収する。

### 代替案
| 案 | 利点 | 却下理由 |
|----|------|---------|
| **予測エンジンをEdge Functionへ移設** | 運用サーバレス化 | build指示「Node/Express維持」に反する。既存エンジン資産・実績を捨てるリスク。OQ-05未確認の段階で移設は危険 |
| **フロントからClaude API直叩き** | サーバ不要 | APIキー露出・課金無制限化（NFR-03違反）。論外 |
| **予測とシフト最適化を別サービスに分割** | 責務分離が明確 | MVP規模では過剰（YAGNI）。両者ともClaude API利用で秘匿要件が同一のため1ゲートウェイで足りる。将来分割の余地は残す |

### スケーラビリティ評価
- **100**: 単一Node/Expressインスタンスで予測・最適化とも十分。
- **1,000**: 予測はレスポンスキャッシュ（同一現場・同日）で重複課金回避。最適化はキュー化（同時実行数制限）で保護。
- **10,000**: Node/Expressを水平スケール（ステートレス化）。Claude API課金がコスト主因のためレート制御・バッチ・モデル選択（ADR-005）でFinance目標と両立。CRUDはNodeを通らない（ADR-002）ため、Node層は「AIリクエスト数」だけで見積もれる。

### 結果
- Generator(#10): `server/routes/risk.ts`（既存互換ラッパ）・`server/services/claude.ts`（予測/構造化の抽象）・`server/routes/shift-optimize.ts`・`server/services/optimizer.ts` を実装。全exportに`[REQ-XXX]`アノテーション。
- Security Engineer(#14): フロントバンドルにAPIキーが含まれないこと、Node層のみが鍵を保持することを審査（NFR-03）。
- **OQ-05 は Architect / DB Engineer が既存予測エンジンのI/O仕様確認を最優先で実施**（未確認だと結合不能）。

---

## ADR-004: 共通入力ロジック層 `packages/input-core`（UI・DB非依存、Expo再利用可能なヘッドレス設計）

日付: 2026-08-10 / 状態: Accepted

### 背景
最重要設計要件（REQ-001, Highリスク）。日報/月報/シフトの入力バリデーション・プリフィル・テンプレート解決・集計を **UI（React/Tauri）とデータアクセス（Supabase）から分離**し、将来のExpo（スマホ）展開で同一の検証・集計挙動を再利用する（trend-research 推奨5）。この分離が崩れると横展開の前提が失われる。

### 決定事項
- **フレームワーク非依存のTypeScriptパッケージ `packages/input-core`** を作成（React/RN/Node いずれからも呼べるヘッドレス設計）。
- **純粋関数中心・副作用なし**。DOM / `@supabase/supabase-js` / React を **import禁止**（lintルール + テストで機械的に検証、REQ-001のテスト可能性）。I/Oは呼び出し側（アダプタ）が担い、input-coreは「データ in → データ out」に徹する。
- モジュール構成（Sprint計画に整合）:
  - `report/` — model / validation（必須・数値範囲・時刻整合・翌日跨ぎ REQ-006）/ prefill（REQ-003）/ template（5型 meta·table·counter·check·gate の解決 REQ-002）/ aggregate（月報集計 REQ-010〜012）/ workflow（状態遷移 REQ-008）/ search（REQ-009）
  - `risk/view.ts` — 予測結果の整形・ソート・分類（REQ-014/015、取得はNode経由）
  - `shift/` — model / constraints（ハード/ソフト制約 REQ-018）/ assignment（配置表・欠員検出 REQ-017）
  - `notify/` `training/` `template/`（REQ-022〜024）
  - `types.ts` — 全ドメイン型（DTO）
- UIは「input-coreで構造/検証を得る → プラットフォームアダプタ（Supabase直結 or apiClient）でI/O」の一方向データフロー。
- **提出バリデーションはinput-coreを正**とし、UIは再実装しない（Expo再利用時の挙動差異ゼロを保証、REQ-006）。

### 代替案
| 案 | 利点 | 却下理由 |
|----|------|---------|
| **ロジックをReactコンポーネント/フックに内包** | 実装が速い | Expo再利用時に全ロジック再実装が必要でDesktop/Mobileの挙動差異が発生。REQ-001の最重要要件に真っ向から反する |
| **Supabase RPC(Postgres関数)に集約** | DB1箇所に集約 | クライアント即時バリデーション（1分日報の軽快さ NFR-02）が出せない。Expoでも同じ往復が必要。テスト/デバッグがSQL依存で重い。※ただし最終防御としてDB制約は併用（ADR-006） |
| **状態管理ライブラリ（Redux等）にロジック混在** | 既存パターン | UI状態とドメインロジックが癒着し純粋性・再利用性が失われる |

### スケーラビリティ評価
- **コード/チームのスケール**: 純粋関数・DOM/DB非依存のためユニットテストが高速で、カバレッジ90%（ECC基準）を維持しやすい。REQ追加時も層の責務境界が明確で影響範囲が局所化。
- **実行時**: クライアント内計算のためユーザー数に非依存。大量日報の月報集計（REQ-010〜012）は入力データ件数に比例するのみ。巨大月次はサーバ側集計（Supabaseビュー/RPC）に委譲する余地を残す。
- **プラットフォーム展開**: Desktop→Expo追加時、input-coreは無改変で再利用（UI/アダプタのみ新規）。

### 結果
- Generator(#10): `packages/input-core` をSprint1で先行実装（REQ-001〜007の土台）。全exportに`[REQ-XXX]`。DOM/Supabase import禁止をESLint+テストで強制。
- TDD-Writer(#09): input-coreの純粋性（同一入力→同一出力）・境界値（時刻逆転/翌日跨ぎ/必須欠落）をVitestで先行RED。
- Frontend Developer(#12): UIはinput-coreの返す構造/検証結果のみを描画し、ロジックを再実装しない。

---

## ADR-005: AIシフト最適化は「LLM構造化 → 数理最適化 → 管制員確認(HITL)」ハイブリッド、実行はNode/Express側

日付: 2026-08-10 / 状態: Accepted

### 背景
警備シフトは資格・休日・勤務間隔・配置基準・法令など **制約が明確で多岐**なため数理最適化が本質的に向く（trend-research 4-2）。一方、現場の曖昧な自然言語要望の解釈・配置理由の説明生成はLLMが強い。LLM単体に割付を丸投げすると制約違反・再現性欠如のリスク（REQ-018〜021、いずれもHigh）。全自動確定は現場の信頼を損なうため禁止（REQ-020、trend-research 推奨2）。低価格帯（CTSYS月3,980円〜が先行）とコスト/レイテンシの両立が必須。

### 決定事項 — 3段パイプライン（全段Node/Express側で実行）
1. **構造化（LLM, REQ-018）**: 管制員の自然言語要望・制約を、既存Claude APIで **構造化制約データ**（有資格要件・勤務間隔・希望休・必要人数・連続勤務上限、ハード/ソフト区別 OQ-03）へ変換。想定外出力時はエラーを返し割付に進めない。
2. **最適化（数理, REQ-019）**: 構造化制約を **制約付き最適化ソルバー（OR-Tools CP-SAT を第一候補、規模により段階的ヒューリスティックにフォールバック）** で解き、ハード制約を満たす割付**下案を1つ以上**生成。充足不能時は違反理由を返す。**この計算はサーバ側（`server/services/optimizer.ts`）で実行**しクライアント直叩き禁止（NFR-03）。
3. **説明生成（LLM, REQ-021）**: 各割付に「なぜこの配置か」（充足制約・優先根拠）をLLMで付与。**説明は最適化結果を入力に生成**し、割付そのものはLLMに委ねない（説明と結果の乖離防止）。
4. **人間確認ゲート（HITL, REQ-020）**: 下案を管制員が確認・微修正して **のみ** `status="確定"`へ遷移。確認フラグ無しの確定要求は拒否（`SHALL NOT` 自動確定）。

**コスト/レイテンシ設計（低価格帯両立）**:
- LLMは「構造化」「説明」の2箇所のみ（割付はソルバー=API課金ゼロ）。→ Claude API課金を最小化。
- 構造化結果・説明は現場×対象期間でキャッシュ。再最適化時はソルバーのみ再実行しLLMを再呼び出ししない。
- モデルは用途で使い分け（構造化は軽量モデル可、複雑要望のみ上位モデル）。長時間最適化はジョブキュー化しUIはポーリング/Realtime（ADR-007）で進捗表示。

### 代替案
| 案 | 利点 | 却下理由 |
|----|------|---------|
| **LLMに割付まで全部やらせる** | 実装が最速・ソルバー不要 | 制約違反・再現性欠如（同じ入力で結果が揺れる）・トークン課金爆発。違法配置リスク（REQ-018/019のHigh）。trend-research が明確に非推奨 |
| **数理最適化のみ（LLMなし）** | 決定的・低コスト | 現場の曖昧な自然言語要望を管制員が手で構造化する負担大。説明可能性（REQ-021）も別実装。差別化の「自然言語で頼める」体験を失う |
| **クライアント側でソルバー実行** | サーバ負荷ゼロ | 重い計算でデスクトップが固まる。ソルバー配布/バージョン管理が煩雑。秘匿要件（NFR-03）とも整合しない |
| **AIが自動確定（人間ゲートなし）** | 管制員の手間ゼロ | 現場の信頼喪失・誤配置の責任所在不明。REQ-020で明示的に禁止 |

### スケーラビリティ評価
- **100**: 単一ワーカーで即応。隊員数十名の1現場最適化はCP-SATで秒〜十数秒想定。
- **1,000**: 最適化ジョブをキュー化（同時実行数制限）し、タイムアウト＋ヒューリスティックフォールバック。LLMキャッシュで課金線形化。
- **10,000**: ワーカー水平スケール。現場単位に問題を分割（現場横断の巨大最適化はしない=中小前提でYAGNI）。コスト主変数はClaude API課金 → キャッシュ率とモデル選択でFinance目標$45/月級と両立を監視。
- **制約規模**: ハード制約数増でCP-SATが解けない場合に備え、`optimizer`をソルバー差し替え可能なインターフェースにする（PoC結果に依存、trend-research 推奨6-b）。

### 結果
- Generator(#10): `server/routes/shift-optimize.ts`（構造化→最適化→説明のオーケストレーション）・`server/services/optimizer.ts`（ソルバー抽象）・`server/services/claude.ts`（構造化/説明）。制約モデルとハード/ソフト区別は `packages/input-core/shift/constraints.ts` に型定義（DB非依存）。
- TDD-Writer(#09): 「生成割付が全ハード制約を違反しない」「充足不能で違反理由を返す」「確認フラグ無し確定が拒否される」をVitestで先行。
- **OQ-03（制約網羅・ハード/ソフト区別）は Architect / RYUGEN が確定必須**。抜けは違法配置に直結。PoC（OR-Toolsで警備制約が解けるか）をSprint3着手前に実施。

---

## ADR-006: 破壊的変更なしのスキーマ拡張戦略（追加のみ・後方互換）

日付: 2026-08-10 / 状態: Accepted

### 背景
既存6モジュール・25テーブルが稼働中。列削除・型変更・リネームは稼働データ・既存機能の毀損に直結する（NFR-01 / REQ-007 / REQ-025、いずれもHigh）。全Sprint横断の絶対制約。既存シフト・配置表テーブル、リスク予測I/Fの実構造は一部未確認（OQ-05/OQ-06）。

### 決定事項
- **追加のみ（additive-only）** を全マイグレーションの絶対原則とする:
  - 既存テーブルへの拡張は **NULL許容の追加列** または **追加テーブル（1:1/1:N拡張）** のみ。
  - 集計・整形は **追加ビュー / RPC** で表現し、既存テーブル定義に触れない。
  - **DROP COLUMN / ALTER TYPE / RENAME / 非互換なNOT NULL・制約追加を禁止**。
- マイグレーションは連番ファイル（例 `supabase/migrations/0100_report_additive.sql`〜）で管理し、各ファイル冒頭に対応REQ・影響範囲・後方互換宣言を記載。
- **後方互換の機械検証**: 既存スキーマのスナップショットと差分比較し、DROP/RENAME/ALTER TYPE を含まないことをCIで静的検査（NFR-01のテスト可能性）。
- RLSは新規追加テーブルで `site_id`（現場スコープ）を軸に先行設計（ADR-002 / 申し送り）。既存テーブルのRLSは現状を尊重し、追加時のみ整合を取る。
- OQ-06（既存シフト/配置テーブル構造）確定までは、シフト拡張を **追加テーブル前提**で設計し、既存構造が判明した時点で「追加列で載るか/追加テーブルか」を再判定。

### 代替案
| 案 | 利点 | 却下理由 |
|----|------|---------|
| **既存テーブルを理想形にリファクタ（列変更/リネーム）** | スキーマが綺麗になる | 稼働中データ毀損・既存機能破壊。NFR-01/REQ-007が明示的に禁止。ダウンタイム・移行リスクが中小運用に許容不可 |
| **新スキーマへ全データ移行** | 設計自由度が最大 | 移行コスト・整合検証コストが個人〜小規模開発のキャパ超。MVPで不要（YAGNI） |
| **アプリ層だけで互換吸収（DB無変更）** | マイグレーション不要 | 新機能に必要な永続データ（下書き/承認履歴/シフト下案/制約）を持てない。追加のみなら安全に永続化できる |

### スケーラビリティ評価
- **データ量**: 追加列/追加テーブルは既存の読み取り経路に影響を与えない。新規参照はインデックス設計（下記申し送り）で線形性を担保（NFR-04）。
- **スキーマ進化**: additive-onlyは後方互換を保ちつつ機能追加できるため、Expo展開・機能拡張時もマイグレーションの安全性が維持される。
- **RLS**: `site_id`軸の複合インデックスで現場スコープの絞り込みが1,000→10,000現場でもスケール。

### 結果
- **Database Engineer(#08) が本ADRの主担当**。追加テーブル/追加列/ビュー/RLS/インデックスを設計（詳細は末尾申し送り）。
- Generator(#10): マイグレーションは追加のみで記述。破壊的DDLを書かない。
- CI（DevOps #13）: スキーマ差分の静的検査（DROP/RENAME/ALTER TYPE検出）をパイプラインに組込。

---

## ADR-007: リアルタイム通知は Supabase Realtime（直結・RLS配下）、教育記録/資格は追加テーブル＋クライアント判定

日付: 2026-08-10 / 状態: Accepted

### 背景
通知・業務指示の対象別配信と未確認集計（REQ-022）、教育記録・資格の更新間近アラート（REQ-023）が必要。PC専用MVPのため常時プッシュ基盤（モバイルPush等）はスコープ外だが、事務所PC常駐アプリでの通知の即時反映は体験価値になる。両機能とも読み取り主体でRLSで守れる。

### 決定事項
- **通知（REQ-022）**: 通知は追加テーブル（`notification` / `notification_target` / `notification_read`）に永続化し、フロントは **Supabase Realtime（Postgres Changes購読）で直結受信**（ADR-002の直結領域）。対象別配信（全員/夜勤者/特定現場）は「配信対象条件」を保存し、購読はRLSで受信者にスコープ。未確認件数は既読テーブルとの差分ビューで集計。**新規のPush基盤は作らない（YAGNI / PC専用MVP）**。
- **教育記録・資格（REQ-023）**: 研修記録・資格・有効期限を追加テーブルに保持。「有効/更新間近/期限切れ」の分類・研修進捗（32/45h等）達成率は **`packages/input-core/training`（純粋関数）** で判定（ADR-004）。基準日数（OQ-10）は設定値として外出し。
- Tauriのローカル通知（トースト）は将来拡張余地として残すが、MVPはアプリ内表示で足りる。

### 代替案
| 案 | 利点 | 却下理由 |
|----|------|---------|
| **ポーリングで通知取得** | 実装単純 | 未確認の即時反映が弱い。Supabase Realtimeが直結構成で低コストに使えるため採用理由が薄い |
| **Node/Express経由でWebSocket自前実装** | 完全自由 | Supabase Realtimeで足りるものを再発明。運用コスト増（YAGNI）。ADR-002の分界（RLSで守れるものは直結）に反する |
| **モバイルPush基盤（Expo等）をMVPで構築** | 将来のExpo即応 | PC専用MVPでは不要。Out of Scope。Expo展開時に追加ADRで対応 |

### スケーラビリティ評価
- **100**: Supabase Free/ProのRealtimeで十分。
- **1,000**: Realtime同時接続数（現場×管制端末）を監視。現場単位チャンネル設計でフィルタ負荷を分散。
- **10,000**: Realtime接続数がボトルネック化しうるため、購読を現場スコープに限定しペイロードを最小化。通知本文は購読トリガ＋個別フェッチに分離する余地を残す（Finance連携でコスト再評価）。

### 結果
- Database Engineer(#08): 通知系・教育/資格系の追加テーブルとRLS（受信者/現場スコープ）、Realtime有効化を設計。
- Generator(#10): `input-core/notify` `input-core/training` に判定ロジック（純粋関数）。配信・購読アダプタはSupabase直結。
- Frontend Developer(#12): 通知はRealtime購読でバッジ更新。教育記録はinput-coreの分類結果を描画。

---

## ADR-008: 確定AIシフト（HITL）→ 実運用シフトへの反映（write-back）フロー【v1.1新規 / HIGH-3】

日付: 2026-08-10 / 状態: Accepted

### 背景
Spec-Validator HIGH-3 の指摘。ADR-005のパイプラインは「LLM構造化→最適化→HITL確認」で `shift_optimization_candidates.review_status='confirmed'` に到達するが、**確定した割当（`shift_candidate_assignments`）が実運用の勤務表（既存 `shifts`）へどう反映されるか**が旧v1.0の仕様・設計のいずれにも無く、データフローが候補テーブルで途切れAIシフトが現場に反映されなかった。また REQ-016 の手動シフト編集（HIGH-1）の保存先も宙に浮いていた。両者を **実運用シフトの単一の正（source of truth）** に一本化する必要がある。

### 決定事項 — 反映モデルの一本化と反映フロー
- **実運用シフトの正を追加テーブル `shift_overrides` に一本化**する（database-design.md §3.5 / 0104）。手動編集（`source='manual'`）と確定AIシフトの反映（`source='ai_apply'`）を同一テーブルに保持し、`(site_id, staff_id, work_date)` を一意キーとする。既存 `shifts` には触れない（追加のみ / ADR-006）。実運用のシフト表・配置表（REQ-016/017）は「既存 `shifts`（実DDL判明後）＋ `shift_overrides` の上書きマージ」をビュー/アプリ層で解決して表示する。
- **反映フロー（write-back、全てNode/Express・service_role経由）:**
  1. **確定検知**: 管制員のHITL確認で候補が `review_status='confirmed'`（+`confirmed_flag/by/at`）に遷移（ADR-005、Node専用RPC）。同一runで確定は最大1件（`uq_one_confirmed_per_run`）。
  2. **反映（apply）**: Node の反映処理が確定候補の `shift_candidate_assignments` を走査し、各割当を `shift_overrides` へ **upsert**（`source='ai_apply'`, `candidate_id`/`run_id` で由来リンク）。`(site_id, staff_id, work_date)` 一意により、同一セルは1行に収束。
  3. **工程記録**: 反映完了で候補に `applied_status='applied'`・`applied_at`・`applied_by` を記録（NULL許容追加列）。
- **冪等性**: 反映処理は `(site_id, staff_id, work_date)` を競合キーとする upsert（`insert ... on conflict do update`）で実装し、**同一確定候補の再反映は同じ結果に収束**（重複行を作らない）。反映は現場×対象期間を単位に**トランザクションで一括適用**する。
- **再実行・再最適化時の扱い**: 同一runを再反映しても upsert で無害（冪等）。**別の候補を新たに確定・反映**する場合、直前に適用済みの候補を `applied_status='superseded'` に落とし（追跡用）、新候補の割当で該当セルを上書きする。手動編集（`source='manual'`）が既に入っているセルは、既定では**手動編集を尊重して上書きしない**（`source='ai_apply'` の反映は manual 行を保護。上書きするかは管制員の明示操作に委ねる＝HITL原則の延長）。
- **境界**: 反映処理はクライアントから直接叩けない（`shift_overrides` の `source='ai_apply'` 書込は service_role 限定、HIGH-2）。クライアントは手動編集（`source='manual'`）のみ直結で書込む。

### 代替案
| 案 | 利点 | 却下理由 |
|----|------|---------|
| **既存 `shifts` へ直接 write-back** | 反映先が1つで単純 | 既存 `shifts` の実DDL未確認（OQ-DB1）で列構造が不明。既存テーブルへの書込はトリガ/制約との相互作用で後方互換リスク。実DDL判明まで不可（判明後に再判定） |
| **候補テーブルをそのまま実運用として参照** | 反映処理が不要 | 手動編集の保存先が別に必要（HIGH-1）で二重管理。run単位の候補構造は日次勤務表の表示・編集に不向き。監査上「確定」と「運用中の実績」を分離できない |
| **反映をクライアント（フロント）で実行** | サーバ処理不要 | service_role が必要な群B書込をクライアントに開く＝HIGH-2の穴を再生。冪等制御・トランザクションもクライアントでは脆い |

### スケーラビリティ評価
- 反映は現場×対象期間の割当件数（数十〜数百行）に比例する軽量upsert。ユーザー数非依存。
- `(site_id, staff_id, work_date)` 一意 + `idx_shift_override_site_date` で日次勤務表の読み取りは現場スコープの範囲スキャンで線形（NFR-04）。
- 大規模化時も現場単位でトランザクションを分割（現場横断の巨大反映はしない＝中小前提 / YAGNI）。

### 結果
- Generator(#10): `server/routes/shift-apply.ts`（確定→反映オーケストレーション）・`server/services/shift-writeback.ts`（`shift_overrides` への冪等upsert）を実装。全exportに`[REQ-XXX]`。反映はservice_roleクライアントで実行。
- Database Engineer(#08): `shift_overrides`（0104）と候補の `applied_*` 追加列、RLS（`source='ai_apply'`はservice_role限定）を提供（database-design.md §3.5）。実運用シフト表示用の「既存shifts＋overridesマージビュー」は実DDL（OQ-DB1）確定後に追加。
- Frontend Developer(#12): シフト管理画面（REQ-016）は「マージ結果」を表示し、手動編集は `shift_overrides(source='manual')` へ直結upsert。AI反映は「反映」ボタン→Node RPC（クライアントは群Bを直接書かない）。
- **残Open Question（UQ-12 / OQ-DB1連動）**: 既存 `shifts` の実DDL確定後、`shift_overrides` を維持するか既存 `shifts` 追加列に載せ替えるか、manual編集がある行へのAI反映の上書きポリシーの既定値を RYUGEN と確定する。

---

## アーキテクチャ全体図

```
┌──────────────────────────────────────────────────────────────────────────┐
│  apps/desktop  —  Tauri v2 (Windows / WebView2 主対象)   [ADR-001]         │
│  ┌────────────────────────────────────────────────────────────────────┐  │
│  │  React + Vite フロント（既存資産を WebView にラップ）                 │  │
│  │  p-dash / p-risk / p-rlist / p-rnew / p-month /                      │  │
│  │  p-shift / p-assign / p-notify / p-tpl / p-comp                      │  │
│  │  UIは input-core を呼び、Supabaseクライアントを直接importしない       │  │
│  └───────────────┬───────────────────────────────┬────────────────────┘  │
│                  │ 呼び出し                        │ platform adapter      │
│  ┌───────────────▼───────────────┐   ┌────────────▼───────────────────┐  │
│  │ packages/input-core [ADR-004] │   │ src-tauri (Rust, 最小)          │  │
│  │ UI/DB非依存・純粋関数           │   │ 保存 / 印刷 / 自動更新(updater)  │  │
│  │ report(validation/prefill/     │   └─────────────────────────────────┘  │
│  │ template/aggregate/workflow) / │                                        │
│  │ risk(view) / shift(constraints/│    ← Desktop も 将来Expo も同一APIで再利用 │
│  │ assignment) / notify / training│                                        │
│  └───────────────────────────────┘                                        │
└──────────┬────────────────────────────────────────────┬──────────────────┘
           │ ①Supabase直結（RLS前提）[ADR-002]            │ ②Node経由（秘匿/重処理）
           │  日報CRUD/月報参照/シフト/配置/               │  AIのみ [ADR-002/003/005]
           │  通知(Realtime)/教育記録  [ADR-007]           │
           ▼                                              ▼
┌────────────────────────────────────────┐   ┌───────────────────────────────────┐
│ Supabase（既存25テーブル継承・追加のみ）  │   │ Node.js / Express（維持・拡張）[ADR-003]│
│ [ADR-006]                               │   │ ── AI/秘匿ゲートウェイ ──            │
│ ┌──────────┐┌──────────┐┌────────────┐ │   │ POST /api/risk/*   既存予測ラッパ    │
│ │ Auth     ││ Postgres ││ Realtime   │ │   │   (REQ-014/015)                     │
│ │          ││ + RLS    ││ Postgres   │ │   │ POST /api/shift/structure          │
│ │          ││ site_id  ││ Changes    │ │   │   LLM構造化 (REQ-018)               │
│ │          ││ 現場分離  ││ 通知購読    │ │   │ POST /api/shift/optimize           │
│ └──────────┘└──────────┘└────────────┘ │   │   ┌─────────────────────────────┐  │
│  追加テーブル/追加列(NULL可)/ビュー/RPC   │   │   │ optimizer  OR-Tools CP-SAT   │  │
│  ※ DROP/RENAME/ALTER TYPE 禁止           │   │   │  (REQ-019 数理最適化)         │  │
└────────────────────────────────────────┘   │   │ claude.ts  構造化/説明生成    │  │
           ▲                                   │   │  (Claude APIキーはここのみ)   │  │
           │ service_role / JWT委譲で読取        │   └─────────────────────────────┘  │
           └───────────────────────────────────│  → 下案生成 → 管制員が確認・確定    │
                    HITL: AI自動確定禁止 [ADR-005]│    (human-in-the-loop, REQ-020)    │
                                                └───────────────────────────────────┘

将来: apps/mobile (Expo) を追加時、packages/input-core を無改変で再利用（UI/adapterのみ新規）
```

---

## Database Engineer (#08) への申し送り事項

**大原則: 追加のみ（additive-only）。既存25テーブルの DROP COLUMN / ALTER TYPE / RENAME / 非互換制約追加は一切禁止（NFR-01 / REQ-007）。**

1. **後方互換（最優先・ADR-006）**: 拡張は「NULL許容の追加列」または「追加テーブル」のみ。集計は追加ビュー/RPCで表現し既存定義に触れない。既存スキーマのスナップショット比較で DROP/RENAME/ALTER TYPE を含まないことをマイグレーションテスト＋CIで機械検証すること。各マイグレーションファイル冒頭に対応REQ・後方互換宣言を記載。

2. **RLS（現場スコープ・最優先）**: 新規追加テーブルは全て `site_id`（現場）を必須に持たせ、RLSで「担当外現場のデータが見えない」ことを保証する（NFR-03、ADR-002の直結領域は RLS が唯一の防御線）。**担当外 site_id へのクロスアクセス試行が空/エラーになること**をSQLレベルのクロスユーザーテストで検証（behavioral-spec NFR-03のテスト可能性に対応）。フロントは anon キーのみ・service_role 鍵は Node 側のみ。

3. **追加テーブル方針（機能別）**:
   - **日報系（Sprint1-2）**: 下書き・提出・承認履歴・差し戻し（REQ-005/008）、テンプレートのセクションON/OFF設定（REQ-024）を追加テーブルで。既存日報テーブルには触れず、拡張情報はNULL許容追加列 or 1:1追加テーブル（REQ-007）。
   - **シフト系（Sprint3）**: **OQ-06（既存シフト/配置テーブルの構造・勤務区分マスタ・ポジション定義・配置基準）を最優先で調査**。既存構造判明まではシフト下案・構造化制約・配置基準を **追加テーブル前提**で設計（REQ-016/017/019）。AIシフト下案は `status`（下案/確認中/確定）と「管制員確認フラグ」を持ち、確認なし確定を **DB制約でも防ぐ**（REQ-020のHITLをDB層でも二重化）。
   - **通知・教育系（Sprint4）**: `notification` / 配信対象条件 / 既読、`training_record` / `qualification`（有効期限）。通知テーブルは Realtime 有効化（ADR-007）。

4. **インデックス（NFR-04・N+1回避）**:
   - 日報一覧/検索（REQ-009）: `(site_id, 対象月, status, 報告者)` 複合インデックス。
   - 月報集計（REQ-010〜012）: 集計は重いクエリを **ビュー/RPC化**しN+1回避。EXPLAIN ANALYZEで検証。
   - RLS絞り込み: `site_id` 先頭の複合インデックスをRLS対象テーブル全てに。
   - 資格更新間近（REQ-023）: 有効期限の範囲検索用インデックス（必要なら期限が近い行の部分インデックス）。

5. **リスク予測連携（ADR-003 / OQ-05）**: 既存 Claude API 予測エンジンの入出力I/F仕様（返却フィールド・呼び出し方法・更新頻度）を Architect と共同で最優先確認。予測結果をDBにキャッシュ/永続化するか（課金・レイテンシ削減）を判断し、するなら追加テーブルで（既存に触れない）。

6. **Node/Express の DB アクセス境界（ADR-002/003）**: Node は AI・秘匿処理のみ担う。CRUDは原則フロント直結（RLS）で、Node からの書き込みは最小限（シフト下案の永続化等）。データの正はSupabaseに置く。

**着手順の推奨**: ①既存25テーブル＋シフト構造の実態調査（OQ-06）と予測I/F確認（OQ-05） → ②追加のみRLS雛形（site_id軸）を全新規テーブルに先行設計 → ③日報系（Sprint1）から順にマイグレーション。

---

## Open Questions への技術的見解

- **OQ-03（AIシフト制約の網羅・ハード/ソフト区別）**: ADR-005の最適化モデルの根幹。抜けは違法配置に直結（REQ-018/019 High）。`input-core/shift/constraints.ts` の型として初期固定し、Sprint3着手前にRYUGEN確認必須。
- **OQ-05（既存予測エンジンI/F）**: ADR-003の後方互換ラッパ設計に必須。未確認だと結合不能。Architect/DB Engineerが最優先で確認。
- **OQ-06（既存シフト/配置テーブル構造）**: ADR-006の「追加列で載るか/追加テーブルか」の分岐。DB Engineerが先行調査。
- **OQ-09（Tauri OSサポート範囲・WebView2配布）**: ADR-001の検証範囲。Windows単独＋WebView2配布方式（Evergreen/Fixed）をSprint4前に決定。
- **OQ-01/OQ-02（1分日報の必須集合・プリフィル優先順位）**: input-core（ADR-004）の prefill/validation 実装前にRYUGEN確認。

---

## 出力サマリー

```
Architect 完了 (v1.1 / Spec-Validator CONDITIONAL 是正反映)
プロジェクト初期化: 未実施（Database Engineer完了後、Sprint1のGenerator起動時に実施予定）
architecture.md: ADR 8件 記録（Tauri / 直結責務分界 / Node予測ゲートウェイ / input-core共通層 /
                 AIシフトHITLハイブリッド / 追加のみスキーマ / Realtime通知・教育記録 /
                 確定AIシフト→実運用 write-back[ADR-008 新規]）
技術スタック: Tauri v2(Win/WebView2) + React/Vite + Supabase直結(RLS) + Node/Express(AI秘匿GW)
             + OR-Tools CP-SAT + packages/input-core(UI/DB非依存)
責務分界: RLSで守れるCRUD/参照=Supabase直結、秘匿(Claude鍵)/課金/重い最適化=Node経由。
  v1.1: AI経路テーブル(最適化run/候補/割当/予測キャッシュ)はフロントSELECTのみ、
  書込・HITL確定・実運用反映はservice_role持つNode経由に限定(HIGH-2/HIGH-3)。
sprint-N-guide.md: 未生成（Database Engineer完了後にSprint1-guideとして生成予定）
→ Database Engineer(#08) へ申し送り送付 → reports/dept-status/dev-status.md 更新 → Chief Secretary へ報告
```

---

## v1.1 是正履歴（Spec-Validator CONDITIONAL 80点 差し戻し対応）

本版は spec/spec-validation-report.md の指摘を **追加のみ・破壊的変更なし** で是正した（architecture.md分）。

| 指摘 | 対応（architecture.md） |
|---|---|
| **HIGH-2**（AI経路テーブルへの一括RLS書込が過剰） | ADR-002 に「AI経路テーブルはフロントSELECTのみ／書込はNode(service_role)限定」の責務分界を追記。HITL確定・最適化結果永続化・予測キャッシュ更新・実運用反映を「Node経由（必須）」に格上げした表を追加。DB側の群A/群B分離（database-design.md §4）と対応。 |
| **HIGH-3**（確定AIシフト→実運用への反映経路未定義） | **ADR-008 を新設**。確定候補→`shift_overrides(source='ai_apply')` へのNode経由 write-back フロー（確定検知→apply→工程記録）、`(site_id,staff_id,work_date)` upsert による冪等性、再最適化・再反映時の `superseded`/手動編集保護ポリシーを定義。手動編集（HIGH-1）と同一テーブルに一本化。 |
| 補足 | §0の全体方針を「8件のADR」に更新。既存 `shifts` 実DDL未確認（HIGH-0/OQ-DB1・UQ-12）は本是正の対象外とし、ADR-008に「実DDL確定後に `shift_overrides` 維持か既存 `shifts` 追加列へ載せ替えか再判定」の残Open Questionを明記。 |
