import { useEffect, useMemo, useState } from 'react'
import {
  classifyRisk,
  filterRisks,
  fromPredictionResponse,
  rankRisks,
  type RiskFilter,
  type RiskItem,
  type RiskLevel,
} from '@mamorai/input-core'
import { fetchRisk } from './riskClient.js'

// リスク度ランキング画面。
// ゲートウェイから取得した生データを input-core で整形→ランキング→絞り込み（層分離厳守）。
// サーバ未起動時は riskClient がデモ生データにフォールバックする。

const SITE_ID = 'site-bht'

export function RiskRanking(): JSX.Element {
  const [raw, setRaw] = useState<unknown>(null)
  const [note, setNote] = useState<string>('読み込み中…')
  const [fallback, setFallback] = useState<boolean>(false)
  const [typeFilter, setTypeFilter] = useState<string>('')
  const [positionFilter, setPositionFilter] = useState<string>('')

  useEffect(() => {
    let alive = true
    fetchRisk(SITE_ID).then((r) => {
      if (!alive) return
      setRaw(r.raw)
      setNote(r.note)
      setFallback(r.fromFallback)
    })
    return () => {
      alive = false
    }
  }, [])

  // [input-core] fromPredictionResponse: 生レスポンス(unknown)→RiskItem[]（level 付与）
  const items: RiskItem[] = useMemo(() => fromPredictionResponse(raw), [raw])

  // 種別/ポジションのフィルタ候補（取得データから一意抽出）。
  const types = useMemo(() => [...new Set(items.map((i) => i.type))].filter((t) => t !== ''), [items])
  const positions = useMemo(
    () => [...new Set(items.map((i) => i.position))].filter((p) => p !== ''),
    [items]
  )

  const filter: RiskFilter = useMemo(() => {
    const f: RiskFilter = { sortBy: 'score', order: 'desc' }
    if (typeFilter !== '') f.type = typeFilter
    if (positionFilter !== '') f.position = positionFilter
    return f
  }, [typeFilter, positionFilter])

  // [input-core] rankRisks で降順整列 → filterRisks で種別/ポジション絞り込み（既定 score desc）
  const ranked = useMemo(() => rankRisks(items), [items])
  const view = useMemo(() => filterRisks(ranked, filter), [ranked, filter])

  return (
    <div className="page">
      <header className="page-head">
        <h1 className="page-title">リスク度ランキング</h1>
        <span className={`src-badge${fallback ? ' src-fallback' : ' src-live'}`} role="status">
          {fallback ? 'デモ' : 'LIVE'} / {note}
        </span>
      </header>

      <section className="card" aria-label="フィルタ">
        <div className="card-b filters">
          <label className="fl">
            種別
            <select className="input" aria-label="種別で絞り込み" value={typeFilter} onChange={(e) => setTypeFilter(e.target.value)}>
              <option value="">すべて</option>
              {types.map((t) => (
                <option key={t} value={t}>
                  {t}
                </option>
              ))}
            </select>
          </label>
          <label className="fl">
            ポジション
            <select
              className="input"
              aria-label="ポジションで絞り込み"
              value={positionFilter}
              onChange={(e) => setPositionFilter(e.target.value)}
            >
              <option value="">すべて</option>
              {positions.map((p) => (
                <option key={p} value={p}>
                  {p}
                </option>
              ))}
            </select>
          </label>
          <span className="muted">該当 {view.length} 件</span>
        </div>
      </section>

      <section className="card" aria-label="リスクランキング">
        <div className="card-b">
          {view.length === 0 ? (
            <p className="muted">該当するリスク項目がありません。</p>
          ) : (
            <ol className="risk-list">
              {view.map((item, idx) => (
                <RiskRow key={item.id} rank={idx + 1} item={item} />
              ))}
            </ol>
          )}
        </div>
      </section>
    </div>
  )
}

function RiskRow({ rank, item }: { rank: number; item: RiskItem }): JSX.Element {
  // level は取得済みだが、分類ロジックの一貫性を示すため classifyRisk で再確認可能。
  const level: RiskLevel = classifyRisk(item.score)
  return (
    <li className="risk-row">
      <span className="risk-rank">{rank}</span>
      <div className="risk-main">
        <div className="risk-line">
          <LevelBadge level={level} />
          <span className="risk-type">{item.type}</span>
          <span className="risk-pos">{item.position}</span>
        </div>
        {item.factors.length > 0 && (
          <ul className="risk-factors">
            {item.factors.map((f, i) => (
              <li key={i}>{f}</li>
            ))}
          </ul>
        )}
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
