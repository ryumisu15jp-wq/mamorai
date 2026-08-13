// [労務] 法令リスク/労務アラート コンソール。シフト表を労基・保険・会社の観点で自動点検。
// 判定は @mamorai/input-core.evaluateLaborAlerts に委譲（UIは表示専用・層分離厳守）。
import { useMemo } from 'react'
import { evaluateLaborAlerts, summarizeLaborAlerts, type ConstraintDef, type LaborAlert } from '@mamorai/input-core'
import { demoShiftGrid, demoStaff, demoConstraints } from './demoShift.js'

const CAT_LABEL: Record<string, string> = {
  legal: '法令（労基）', insurance: '保険', company: '会社規程', shift: '勤務条件', other: 'その他',
}
const KIND_LABEL: Record<string, string> = {
  max_consecutive_days: '連勤上限', min_rest_hours: '勤務間隔', max_weekly_hours: '週労働上限',
  insurance_weekly_hours: '社保加入目安',
  rest_day_after_long_shift: '当務後の休息', no_work_after_night: '夜勤後の休息',
  min_days_off_per_week: '週休配慮',
}

export function LaborAlerts({ constraints }: { constraints?: ConstraintDef[] } = {}): JSX.Element {
  const grid = useMemo(() => demoShiftGrid(), [])
  const staff = useMemo(() => demoStaff, [])
  const cons = constraints ?? demoConstraints()

  const alerts = useMemo(() => evaluateLaborAlerts(grid, staff, cons), [grid, staff, cons])
  const summary = useMemo(() => summarizeLaborAlerts(alerts), [alerts])
  const hard = alerts.filter((a) => a.severity === 'hard')
  const soft = alerts.filter((a) => a.severity === 'soft')

  return (
    <div className="page">
      <header className="page-head">
        <h1 className="page-title">労務アラート（法令リスク管理）</h1>
        <span className="muted">シフト表を労基・保険・会社規程で自動点検</span>
      </header>

      {/* サマリー */}
      <div className="la-tiles">
        <div className={`la-tile ${hard.length > 0 ? 'la-bad' : 'la-ok'}`}>
          <div className="la-n">{hard.length}</div><div className="la-l">法令違反リスク（要是正）</div>
        </div>
        <div className={`la-tile ${soft.length > 0 ? 'la-warn' : 'la-ok'}`}>
          <div className="la-n">{soft.length}</div><div className="la-l">注意（ソフト）</div>
        </div>
        <div className="la-tile">
          <div className="la-n">{staff.length}</div><div className="la-l">対象スタッフ</div>
        </div>
        <div className="la-tile">
          <div className="la-n">{cons.filter((c) => c.active !== false).length}</div><div className="la-l">有効ルール</div>
        </div>
      </div>

      {/* カテゴリ別 */}
      <section className="card" aria-label="カテゴリ別件数">
        <div className="card-b la-cats">
          {Object.keys(CAT_LABEL).map((k) => (
            <span key={k} className={`la-cat${(summary.byCategory[k] ?? 0) > 0 ? ' on' : ''}`}>
              {CAT_LABEL[k]} <b>{summary.byCategory[k] ?? 0}</b>
            </span>
          ))}
        </div>
      </section>

      {/* 明細 */}
      <section className="card" aria-label="アラート明細">
        <div className="card-h"><h2>アラート明細</h2><span className="muted">{alerts.length} 件</span></div>
        <div className="card-b">
          {alerts.length === 0 ? (
            <p className="muted">現在、法令リスク・注意事項はありません。</p>
          ) : (
            <table className="tbl">
              <thead><tr><th>区分</th><th>カテゴリ</th><th>対象</th><th>日/週</th><th>内容</th></tr></thead>
              <tbody>
                {alerts.map((a: LaborAlert, i) => (
                  <tr key={i}>
                    <td><span className={`status ${a.severity === 'hard' ? 'st-reject' : 'st-warn'}`}>{a.severity === 'hard' ? '違反' : '注意'}</span></td>
                    <td>{CAT_LABEL[a.category] ?? a.category}</td>
                    <td>{a.staffName ?? a.staffId}</td>
                    <td>{a.date ?? a.week ?? '—'}</td>
                    <td>{KIND_LABEL[a.kind] ?? a.kind}：{a.message}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </section>

      <p className="muted" style={{ marginTop: 12 }}>
        ※ 判定ルール（連勤・勤務間隔・週労働・社保）は「制約」タブで追加・調整できます。デモのシフト表で点検しています。
      </p>
    </div>
  )
}
