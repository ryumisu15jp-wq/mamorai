## Spec Validation Report
評価者: Spec-Validator (#06)
対象: spec/behavioral-spec.md, spec/architecture.md, spec/database-design.md, spec/trend-research-report.md
日付: 2026-08-10

### スコア: 83/100 → **CONDITIONAL**（Sprint1着手前にPlannerによる修正が必要）

### 項目別評価

| 項目 | 得点 | 満点 | 評価 |
|------|------|------|------|
| EARS文法 | 25 | 25 | 全15件のREQがWHEN/THE/SHALLまたはTHE/SHALL形式で統一されており減点なし |
| テスト可能性 | 23 | 25 | 全REQにテスト方法の記載はあるが、REQ-010・REQ-011のRealtime/pg_cron部分は「結合テストで別途確認」とだけ書かれており、具体的な検証手段（どのツールで何を確認するか）が未記載 |
| REQ整合性 | 13 | 20 | 下記「修正必須箇所」参照。依存関係とスプリント順序に実質的な矛盾が2件見つかった |
| リスク付与 | 15 | 15 | 全REQにリスクレベルと具体的な理由が記載されている |
| 依存関係 | 7 | 15 | 依存関係マップと個別REQの依存記載に不一致があり、スプリント順序とも矛盾している箇所がある |

### 良い点

- trend-research-report.mdの競合分析・差別化ポイントがbehavioral-spec.mdのIn Scope/Out of Scopeに正確に反映されている（特に「ハードウェア連携を避ける」判断の一貫性が良い）
- REQ-014（追記型ログ・改ざん防止）とREQ-007（拠点別権限）というHighリスク要件が、architecture.md（ADR-005）・database-design.md（RLSポリシーでUPDATE/DELETEを意図的に未定義）まで一貫して具体化されており、仕様→設計→DBのトレーサビリティが取れている
- database-design.mdの部分インデックス設計（`exited_at IS NULL`）がarchitecture.mdのADR-004（pg_cronによる退場忘れ判定）のパフォーマンス要件を的確に汲んでいる
- Open Questionsが「なぜRYUGENの判断が必要か」まで含めて具体的（OQ-01〜06）で、次工程が止まらない粒度になっている

### 修正必須箇所（CONDITIONAL解除のため）

1. **REQ-004とREQ-013のスプリント順序矛盾**: REQ-004（Sprint1）は「過去に登録履歴のある業者」の候補提示機能だが、依存関係マップでは`REQ-001 → REQ-004 → REQ-013`と記載されており、REQ-013（業者マスタ管理、Sprint2）がREQ-004より後になっている。REQ-004の実装がcompaniesマスタを参照するのか、visitsの`company_name_snapshot`（手入力履歴）のみから候補を出すのかが仕様上明確でない。
   → 修正方法: REQ-004の説明に「Sprint1時点では`visits.company_name_snapshot`の入力履歴のみを候補とし、companiesマスタとの統合はREQ-013完了後のSprint2で行う」と明記するか、REQ-004自体をSprint2に繰り下げる

2. **依存関係マップとREQ-006個別記載の不一致**: 依存関係マップには`REQ-005 → REQ-006`と記載されているが、REQ-006本文の「依存」欄は「なし」となっている。
   → 修正方法: 実際にREQ-006（拠点登録）がREQ-005（visit/vehicleVisitへのsite_id必須化）に依存するのか独立しているのかを精査し、マップと本文のどちらかを修正して一致させる（技術的にはsitesテーブルが先に存在しないとsite_idの参照整合性が取れないため、REQ-006は独立要件、REQ-005側がREQ-006に依存する向きが正しい可能性が高い）

### 推奨改善点（任意）

- REQ-010・REQ-011のテスト可能性欄に、結合テストで使用する想定ツール（例: Supabase Realtimeのテスト用クライアント、pg_cronジョブの手動トリガー方法）を一言添えると、TDD-Writer(#09)が迷わない
- OQ-03（車両情報の必須項目）が未確定のままREQ-003が「ナンバーのみ必須」という暫定仕様で進んでいる点は妥当な判断だが、spec内に「OQ-03確定後に本REQを見直す」旨のフラグを明示しておくと後戻りコストが下がる

---
次アクション: 上記2件の修正をPlannerが行い、修正版behavioral-spec.mdを再提出。再審査で85点以上を確認後、Database Engineer/Architectへの再申し送り不要（今回の指摘はbehavioral-spec.md内の整合性の問題であり、architecture.md/database-design.mdの修正は不要と判断）。

---

## 再審査（v1.1、2026-08-10）

Plannerより修正版behavioral-spec.md（v1.1）を受領。以下を確認した。

1. REQ-004: 「Sprint1時点では`visits.company_name_snapshot`のみを候補とし、companiesマスタとの統合はSprint2」というスコープ注記が追加され、Sprint順序との矛盾が解消された ✅
2. REQ-006: 「依存: なし」の理由が明記され（sitesテーブル自体はスキーマとして先に存在し、REQ-006はUI操作を指すため機能的依存はない）、依存関係マップからも矛盾する`REQ-005 → REQ-006`が削除された ✅

### 再採点

| 項目 | 得点 | 満点 |
|------|------|------|
| EARS文法 | 25 | 25 |
| テスト可能性 | 24 | 25（推奨改善点は任意対応のため-1のみ残す） |
| REQ整合性 | 19 | 20（軽微な表記揺れの余地を残し-1） |
| リスク付与 | 15 | 15 |
| 依存関係 | 14 | 15（Sprint横断の拡張関係の表記がやや独自記法である点のみ-1） |

### スコア: 97/100 → **APPROVED**

Database Engineer(#08)・Architect(#07)の成果物と合わせ、Phase 1一式（trend-research-report.md, behavioral-spec.md v1.1, architecture.md, database-design.md）をAPPROVEDとする。Generator起動（Sprint1）へ進行可能。
