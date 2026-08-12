import { useMemo, useState } from 'react'
import {
  buildPredictionInput,
  classifyRisk,
  listBusinessTypes,
  positionRiskLevels,
  riskRanking,
  timeslotRiskLevels,
  type RiskItem,
  type RiskLevel,
} from '@mamorai/input-core'
import { demoNotifications } from '../notify/demoNotify.js'
import {
  DEFAULT_BUSINESS_TYPE,
  TIMESLOTS,
  demoConditions,
  demoContext,
  demoDashboardItems,
} from './demoDashboard.js'

// [S5-3] 改良ダッシュボード。
// HaiTO構成（日付/天気/特殊条件バー・リスク件数・ランキングTOP5・ポジション別・時間帯別・情報共有）を再現し、
// MAMOR-AI の "見る→作る" 導線（配置表/月次・AIシフト下案）を加える。
// 集計・分類・入力正規化は @mamorai/input-core に委譲（層分離厳守）:
//   riskRanking / positionRiskLevels / timeslotRiskLevels / classifyRisk / buildPredictionInput / listBusinessTypes

/** App のタブキー（循環 import を避けるため文字列で受ける）。 */
export type DashboardNavKey = 'assign' | 'month' | 'ai' | 'shift'

interface DashboardProps {
  /** 差別化導線カードから他画面へ遷移するためのコールバック。 */
  onNavigate?: (tab: DashboardNavKey) => void
}

const SLOTS = [...TIMESLOTS]

export function Dashboard({ onNavigate }: DashboardProps): JSX.Element {
  const businessTypes = useMemo(() => listBusinessTypes(), [])
  const [businessType, setBusinessType] = useState<string>(DEFAULT_BUSINESS_TYPE)

  const ctx = useMemo(() => demoContext(), [])
  const items = useMemo<RiskItem[]>(() => demoDashboardItems(), [])

  // [input-core] buildPredictionInput: 当該業態の conditionFields に定義されたキーのみ正規化。
  const predictionInput = useMemo(
    () => buildPredictionInput(businessType, ctx.date, demoConditions()),
    [businessType, ctx.date],
  )
  const usedConditionCount = Object.keys(predictionInput.conditions).length

  // KPI: リスク予想件数合計（予測件数）と 重要事項/業務指示 の件数。
  const notifications = useMemo(() => demoNotifications(), [])
  const importantCount = useMemo(
    () => notifications.filter((n) => n.kind === '重要事項').length,
    [notifications],
  )
  const opsCount = useMemo(
    () => notifications.filter((n) => n.kind === '業務指示').length,
    [notifications],
  )

  // [input-core] riskRanking: score降順・同点id昇順で TOP5。
  const top5 = useMemo(() => riskRanking(items, 5), [items])
  // [input-core] positionRiskLevels: ポジション毎の最大score(level)と件数。
  const positions = useMemo(() => positionRiskLevels(items), [items])
  // [input-core] timeslotRiskLevels: 指定時間帯順の最大score(level)と件数。
  const timeslots = useMemo(() => timeslotRiskLevels(items, SLOTS), [items])

  const maxPositionCount = Math.max(1, ...positions.map((p) => p.count))
  const maxSlotCount = Math.max(1, ...timeslots.map((t) => t.count))

  return (
    <div className="page">
      <header className="page-head dash-head">
        <h1 className="page-title">ダッシュボード</h1>
        <label className="fl dash-bt">
          業態
          <select
            className="input"
            aria-label="業態を切り替え"
            value={businessType}
            onChange={(e) => setBusinessType(e.target.value)}
          >
            {businessTypes.map((bt) => (
              <option key={bt} value={bt}>
                {bt}
              </option>
            ))}
          </select>
        </label>
      </header>

      {/* 上部バー: 日付・天気・特殊条件チップ・警備レベル */}
      <section className="card dash-bar" aria-label="当日の条件">
        <div className="card-b dash-bar-b">
          <div className="dash-bar-main">
            <span className="dash-date">{ctx.date}</span>
            <span className="dash-weather" aria-label="天気">
              {ctx.weather} / {ctx.temp}℃
            </span>
            <span className="dash-seclv" aria-label="警備レベル">
              警備レベル {ctx.securityLevel}
            </span>
          </div>
          <ul className="dash-chips" aria-label="特殊条件">
            {ctx.chips.map((c) => (
              <li key={c.kind} className="dash-chip">
                <span className="dash-chip-kind">{c.kind}</span>
                <span className="dash-chip-label">{c.label}</span>
              </li>
            ))}
          </ul>
          <p className="muted dash-bar-note">
            AI条件 {usedConditionCount} 項目を予測入力に正規化（buildPredictionInput / 業態: {predictionInput.businessType}）
          </p>
        </div>
      </section>

      {/* KPI: リスク予想件数合計 / 重要事項 / 業務指示 */}
      <section className="metrics dash-kpi" aria-label="サマリー">
        <div className="metric metric-r">
          <span className="metric-label">リスク予想件数合計</span>
          <span className="metric-value">{items.length} 件</span>
        </div>
        <div className="metric metric-am">
          <span className="metric-label">重要事項</span>
          <span className="metric-value">{importantCount} 件</span>
        </div>
        <div className="metric metric-g">
          <span className="metric-label">業務指示</span>
          <span className="metric-value">{opsCount} 件</span>
        </div>
      </section>

      <div className="dash-grid">
        {/* リスク度ランキング TOP5 */}
        <section className="card" aria-label="リスク度ランキング TOP5">
          <div className="card-h">
            <h2>リスク度ランキング TOP5</h2>
          </div>
          <div className="card-b">
            <ol className="risk-list">
              {top5.map((item, idx) => (
                <RiskRow key={item.id} rank={idx + 1} item={item} />
              ))}
            </ol>
          </div>
        </section>

        {/* ポジション別リスクレベル（横棒 中=橙/高=赤） */}
        <section className="card" aria-label="ポジション別リスクレベル">
          <div className="card-h">
            <h2>ポジション別リスクレベル</h2>
          </div>
          <div className="card-b">
            <ul className="pos-bars">
              {positions.map((p) => {
                const level = classifyRisk(p.level)
                return (
                  <li key={p.position} className="pos-row">
                    <span className="pos-label" title={p.position}>
                      {p.position}
                    </span>
                    <span className="pos-track">
                      <span
                        className={`pos-fill ${levelBarClass(level)}`}
                        style={{ width: `${(p.count / maxPositionCount) * 100}%` }}
                      />
                    </span>
                    <span className="pos-meta">
                      <LevelBadge level={level} />
                      <span className="pos-count">{p.count}件</span>
                    </span>
                  </li>
                )
              })}
            </ul>
          </div>
        </section>
      </div>

      {/* 時間帯別リスクレベル（積み上げ棒） */}
      <section className="card" aria-label="時間帯別リスクレベル">
        <div className="card-h">
          <h2>時間帯別リスクレベル</h2>
          <span className="muted">高＝赤 / 中＝橙 / 低＝緑</span>
        </div>
        <div className="card-b">
          <ul className="slot-bars">
            {timeslots.map((t) => {
              const breakdown = levelBreakdown(items, t.slot)
              const level = classifyRisk(t.level)
              return (
                <li key={t.slot} className="slot-col">
                  <span className="slot-stack" aria-label={`${t.slot} ${t.count}件`}>
                    <StackSeg count={breakdown.High} total={maxSlotCount} cls="seg-high" />
                    <StackSeg count={breakdown.Mid} total={maxSlotCount} cls="seg-mid" />
                    <StackSeg count={breakdown.Low} total={maxSlotCount} cls="seg-low" />
                  </span>
                  <span className="slot-count">{t.count}</span>
                  <span className="slot-label">{t.slot}</span>
                  <span className="slot-max">最大 {t.count === 0 ? '—' : level}</span>
                </li>
              )
            })}
          </ul>
        </div>
      </section>

      {/* ★差別化導線（HaiTOに無い）: 見る→作る */}
      <section className="card dash-cta-wrap" aria-label="MAMOR-AI 拡張導線">
        <div className="card-h">
          <h2>次のアクション</h2>
          <span className="ext-badge">MAMOR-AI 拡張</span>
        </div>
        <div className="card-b dash-cta">
          <button type="button" className="cta-card" onClick={() => onNavigate?.('assign')}>
            <span className="ext-badge">MAMOR-AI 拡張</span>
            <span className="cta-title">配置表 / 月次を見る</span>
            <span className="cta-desc">リスク予測を配置表・月次報告書へ。"見る"を成果物に接続。</span>
            <span className="cta-go">配置表へ →</span>
          </button>
          <button type="button" className="cta-card" onClick={() => onNavigate?.('ai')}>
            <span className="ext-badge">MAMOR-AI 拡張</span>
            <span className="cta-title">AIシフト下案を作る</span>
            <span className="cta-desc">高リスク時間帯・ポジションに人員を厚く。管制員確認で確定(HITL)。</span>
            <span className="cta-go">AIシフトへ →</span>
          </button>
        </div>
      </section>

      {/* 一斉共有 / 重要事項 / 業務指示 */}
      <section className="card" aria-label="一斉共有・重要事項・業務指示">
        <div className="card-h">
          <h2>一斉共有・重要事項・業務指示</h2>
        </div>
        <div className="card-b">
          {notifications.map((n) => (
            <div key={n.id} className="notif-item">
              <span className={`notif-kind ${kindClass(n.kind)}`}>{n.kind}</span>
              <div className="notif-info">
                <div className="notif-title">{n.title}</div>
                <div className="notif-meta">{n.createdBy ?? '—'}</div>
                {n.body != null && n.body !== '' && <div className="notif-body">{n.body}</div>}
              </div>
            </div>
          ))}
        </div>
      </section>
    </div>
  )
}

/** 時間帯 slot 内の High/Mid/Low 件数内訳（分類は classifyRisk に委譲）。 */
function levelBreakdown(items: RiskItem[], slot: string): Record<RiskLevel, number> {
  const acc: Record<RiskLevel, number> = { High: 0, Mid: 0, Low: 0 }
  for (const it of items) {
    if (it.timeslot === slot) {
      acc[classifyRisk(it.score)] += 1
    }
  }
  return acc
}

function StackSeg({ count, total, cls }: { count: number; total: number; cls: string }): JSX.Element | null {
  if (count <= 0) return null
  return <span className={`stack-seg ${cls}`} style={{ height: `${(count / total) * 100}%` }} />
}

function levelBarClass(level: RiskLevel): string {
  return level === 'High' ? 'pf-high' : level === 'Mid' ? 'pf-mid' : 'pf-low'
}

function kindClass(kind: string): string {
  return kind === '重要事項' ? 'nk-imp' : kind === '業務指示' ? 'nk-ops' : 'nk-hq'
}

function RiskRow({ rank, item }: { rank: number; item: RiskItem }): JSX.Element {
  const level = classifyRisk(item.score)
  return (
    <li className="risk-row">
      <span className="risk-rank">{rank}</span>
      <div className="risk-main">
        <div className="risk-line">
          <LevelBadge level={level} />
          <span className="risk-type">{item.type}</span>
          <span className="risk-pos">{item.position}</span>
          {item.timeslot != null && <span className="risk-slot">{item.timeslot}</span>}
        </div>
      </div>
      <div className="risk-metrics">
        <span className="risk-score" aria-label={`スコア ${item.score}`}>
          {item.score}
        </span>
        <span className="risk-prob">発生確率 {Math.round(item.probability * 100)}%</span>
      </div>
    </li>
  )
}

function LevelBadge({ level }: { level: RiskLevel }): JSX.Element {
  const cls = level === 'High' ? 'lv-high' : level === 'Mid' ? 'lv-mid' : 'lv-low'
  return <span className={`lv ${cls}`}>{level}</span>
}
