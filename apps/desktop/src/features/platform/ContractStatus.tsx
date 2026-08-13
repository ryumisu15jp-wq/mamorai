// [運営/TRYANGROW] 契約状況。会社ごとの契約プラン・期間・請求状況を確認（デモ:ローカル状態）。
interface Contract {
  id: string
  company: string
  plan: string
  seats: number
  start: string
  end: string
  monthly: number
  billing: '正常' | '請求予定' | '未入金'
}

const ROWS: Contract[] = [
  { id: 'k1', company: '三角警備保障', plan: 'Standard', seats: 150, start: '2025-04-01', end: '2027-03-31', monthly: 180000, billing: '正常' },
  { id: 'k2', company: '立飛セキュリティ', plan: 'Lite（試用）', seats: 70, start: '2026-08-01', end: '2026-08-31', monthly: 0, billing: '請求予定' },
  { id: 'k3', company: 'ミライ警備', plan: 'Enterprise', seats: 250, start: '2024-10-01', end: '2026-09-30', monthly: 420000, billing: '未入金' },
]

function yen(n: number): string { return n === 0 ? '—' : `¥${n.toLocaleString('en-US')}` }

export function ContractStatus(): JSX.Element {
  const mrr = ROWS.reduce((s, r) => s + r.monthly, 0)
  const overdue = ROWS.filter((r) => r.billing === '未入金').length
  return (
    <div className="page">
      <header className="page-head">
        <h1 className="page-title">契約状況</h1>
        <span className="muted">月次合計 {yen(mrr)} / 未入金 {overdue} 件</span>
      </header>
      <div className="la-tiles">
        <div className="la-tile"><div className="la-n">{ROWS.length}</div><div className="la-l">契約数</div></div>
        <div className="la-tile"><div className="la-n">{ROWS.reduce((s, r) => s + r.seats, 0)}</div><div className="la-l">総シート数</div></div>
        <div className="la-tile la-ok"><div className="la-n" style={{ fontSize: 22 }}>{yen(mrr)}</div><div className="la-l">月次売上(MRR)</div></div>
        <div className={`la-tile ${overdue > 0 ? 'la-bad' : 'la-ok'}`}><div className="la-n">{overdue}</div><div className="la-l">未入金</div></div>
      </div>
      <section className="card" aria-label="契約一覧">
        <div className="card-h"><h2>契約一覧</h2></div>
        <div className="card-b">
          <table className="tbl">
            <thead><tr><th>会社</th><th>プラン</th><th>シート</th><th>契約期間</th><th>月額</th><th>請求</th></tr></thead>
            <tbody>
              {ROWS.map((r) => (
                <tr key={r.id}>
                  <td>{r.company}</td><td>{r.plan}</td><td>{r.seats}</td><td>{r.start} 〜 {r.end}</td><td>{yen(r.monthly)}</td>
                  <td><span className={`status ${r.billing === '正常' ? 'st-approved' : r.billing === '請求予定' ? 'st-submitted' : 'st-rejected'}`}>{r.billing}</span></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  )
}
