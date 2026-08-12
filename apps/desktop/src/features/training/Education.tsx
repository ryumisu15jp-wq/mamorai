import { useMemo, useState } from 'react'
import {
  listQualificationViews,
  trainingAchievement,
  type QualificationStatus,
  type QualificationView,
  type TrainingRecord,
} from '@mamorai/input-core'
import {
  DEFAULT_REFERENCE_DATE,
  DEFAULT_THRESHOLD_DAYS,
  demoQualifications,
  demoTrainingRecords,
} from './demoTraining.js'

// [REQ-023] 教育記録・資格者管理と更新間近アラート。
// 「有効/更新間近/期限切れ」の分類（listQualificationViews）と
// 研修達成率（trainingAchievement）は @mamorai/input-core に委譲（層分離厳守）。

const STATUS_CLASS: Record<QualificationStatus, string> = {
  有効: 'ql-ok',
  更新間近: 'ql-soon',
  期限切れ: 'ql-expired',
}

export function Education(): JSX.Element {
  const quals = useMemo(() => demoQualifications(), [])
  const records = useMemo<TrainingRecord[]>(() => demoTrainingRecords(), [])

  const [referenceDate, setReferenceDate] = useState<string>(DEFAULT_REFERENCE_DATE)
  const [threshold, setThreshold] = useState<number>(DEFAULT_THRESHOLD_DAYS)

  // [input-core] listQualificationViews: 基準日・しきい値から status/daysToExpiry を付与
  const views = useMemo<QualificationView[]>(
    () => listQualificationViews(quals, referenceDate, threshold),
    [quals, referenceDate, threshold],
  )

  // 集計（更新間近を強調するためのカウント）。
  const counts = useMemo(() => {
    const c: Record<QualificationStatus, number> = { 有効: 0, 更新間近: 0, 期限切れ: 0 }
    for (const v of views) c[v.status] += 1
    return c
  }, [views])

  // 更新間近を先頭に寄せて注意喚起（並び替えは表示都合。分類は input-core が確定済）。
  const orderedViews = useMemo(() => {
    const rank: Record<QualificationStatus, number> = { 期限切れ: 0, 更新間近: 1, 有効: 2 }
    return [...views].sort((a, b) => rank[a.status] - rank[b.status])
  }, [views])

  return (
    <div className="page">
      <header className="page-head">
        <h1 className="page-title">教育・資格管理</h1>
        <span className="muted">分類・達成率は @mamorai/input-core</span>
      </header>

      {/* 基準日・しきい値 */}
      <section className="card" aria-label="判定条件">
        <div className="card-b filters">
          <label className="fl">
            基準日
            <input
              className="input"
              type="date"
              aria-label="基準日"
              value={referenceDate}
              onChange={(e) => setReferenceDate(e.target.value)}
            />
          </label>
          <label className="fl">
            更新間近しきい値（日）
            <input
              className="input"
              type="number"
              aria-label="更新間近しきい値（日数）"
              min={0}
              value={threshold}
              onChange={(e) => setThreshold(Math.max(0, Number(e.target.value) || 0))}
            />
          </label>
        </div>
      </section>

      {/* 資格状態サマリー */}
      <section className="metrics" aria-label="資格者サマリー">
        <div className="metric metric-g">
          <span className="metric-label">有効</span>
          <span className="metric-value">{counts.有効}</span>
        </div>
        <div className="metric metric-am">
          <span className="metric-label">更新間近</span>
          <span className="metric-value">{counts.更新間近}</span>
        </div>
        <div className="metric">
          <span className="metric-label">期限切れ</span>
          <span className="metric-value" style={{ color: 'var(--r)' }}>
            {counts.期限切れ}
          </span>
        </div>
      </section>

      {/* 資格一覧（バッジ＋更新間近の強調） */}
      <section className="card" aria-label="資格者一覧">
        <div className="card-h">
          <h2>資格者一覧</h2>
        </div>
        <div className="card-b">
          <table className="tbl">
            <thead>
              <tr>
                <th>対象者</th>
                <th>資格</th>
                <th>有効期限</th>
                <th className="num">残日数</th>
                <th>状態</th>
              </tr>
            </thead>
            <tbody>
              {orderedViews.map((v) => (
                <tr key={`${v.staffId}-${v.name}`} className={v.status === '更新間近' ? 'row-soon' : ''}>
                  <td>{v.staffId}</td>
                  <td>{v.name}</td>
                  <td>{v.expiresOn}</td>
                  <td className="num">{v.daysToExpiry}</td>
                  <td>
                    <span className={`status ${STATUS_CLASS[v.status]}`}>{v.status}</span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      {/* 研修進捗（達成率バー） */}
      <section className="card" aria-label="研修進捗">
        <div className="card-h">
          <h2>教育記録・研修進捗</h2>
        </div>
        <div className="card-b">
          {records.map((r) => {
            const ratio = trainingAchievement(r)
            const pct = Math.round(ratio * 100)
            const done = ratio >= 1
            return (
              <div key={`${r.staffId}-${r.type}`} className="training-row">
                <div className="training-head">
                  <span className="training-name">
                    {r.staffId} — {r.type}
                  </span>
                  <span className="muted">
                    {r.completedHours}/{r.requiredHours}h（{pct}%）
                    {done ? (
                      <span className="status st-approved" style={{ marginLeft: 8 }}>
                        完了
                      </span>
                    ) : (
                      <span className="status st-submitted" style={{ marginLeft: 8 }}>
                        研修中
                      </span>
                    )}
                  </span>
                </div>
                <div className="prog" role="img" aria-label={`${r.type} 進捗 ${pct}%`}>
                  <div className={`prog-fill${done ? ' prog-done' : ''}`} style={{ width: `${pct}%` }} />
                </div>
              </div>
            )
          })}
        </div>
      </section>
    </div>
  )
}
