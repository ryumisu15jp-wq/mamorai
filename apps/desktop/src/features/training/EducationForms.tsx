// [現場/会社] 教育指導 6点セット管理（LPO教育指導）。様式の作成・管理・提出。
// ①月間教育計画書 ②教育実施簿(全体) ③指導(是正)指示書 ④個別指導実施簿 ⑤改善確認記録 ⑥教育指導管理台帳
import { useState } from 'react'

interface Form { no: string; key: string; name: string; desc: string }
const FORMS: Form[] = [
  { no: '①', key: 'plan', name: '月間教育計画書', desc: '月間の教育・指導を事前計画（前月に翌月分）' },
  { no: '②', key: 'group', name: '教育実施簿（全体）', desc: '朝礼・集合教育・手順書周知など全体教育の記録' },
  { no: '③', key: 'correct', name: '指導(是正)指示書', desc: '問題を全員へ周知・是正指示（署名）' },
  { no: '④', key: 'individual', name: '個別指導実施簿', desc: 'ミス・事故・苦情等での個別指導の記録' },
  { no: '⑤', key: 'improve', name: '改善確認記録', desc: '指導後の改善状況をフォローアップ確認' },
  { no: '⑥', key: 'ledger', name: '教育指導管理台帳', desc: '全記録を一元管理・進捗を追跡' },
]

interface Rec { no: number; date: string; name: string; content: string; kind: string; repeat: string; g: boolean; i: boolean; c: boolean; done: boolean }
const LEDGER: Rec[] = [
  { no: 18, date: 'R8.2.27', name: '末廣 信行', content: '巡回記録簿の虚偽記録・巡回ルート省略', kind: '是正', repeat: '2回目', g: true, i: true, c: true, done: true },
  { no: 19, date: 'R8.8.1', name: '（郵便物対応）', content: '郵便物回収後の施錠手順の是正', kind: '是正', repeat: '初回', g: false, i: true, c: false, done: false },
  { no: 20, date: 'R8.8.4', name: '全員', content: '鍵管理および未返却時対応の徹底', kind: '指導', repeat: '初回', g: true, i: false, c: true, done: true },
]

export function EducationForms(): JSX.Element {
  const [toast, setToast] = useState<string | null>(null)
  const create = (f: Form): void => setToast(`「${f.name}」を作成/PDF出力（本結線時にxlsx様式で生成）`)
  const undone = LEDGER.filter((r) => !r.done).length

  return (
    <div className="page">
      <header className="page-head">
        <h1 className="page-title">教育指導（6点セット）</h1>
        <span className="muted">未完了 {undone} 件</span>
      </header>

      <section className="card" aria-label="様式の作成">
        <div className="card-h"><h2>様式の作成・提出</h2><span className="muted">記録の流れ：①計画 → ②全体/④個別 → ③是正 → ⑤改善確認 → ⑥台帳</span></div>
        <div className="card-b">
          <div className="feat" style={{ gridTemplateColumns: 'repeat(3,1fr)', gap: 12, marginTop: 0 }}>
            {FORMS.map((f) => (
              <div key={f.key} className="card" style={{ margin: 0 }}>
                <div className="card-b" style={{ gap: 8 }}>
                  <div><span className="badge badge-meta">{f.no}</span> <b>{f.name}</b></div>
                  <p className="muted" style={{ margin: 0 }}>{f.desc}</p>
                  <div className="row-actions"><button type="button" className="btn btn-secondary" onClick={() => create(f)}>作成/出力</button></div>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section className="card" aria-label="教育指導管理台帳">
        <div className="card-h"><h2>教育指導 管理台帳</h2><span className="muted">{LEDGER.length} 件</span></div>
        <div className="card-b">
          <table className="tbl">
            <thead><tr><th>No</th><th>日付</th><th>氏名</th><th>内容（指導事項）</th><th>区分</th><th>再発</th><th>②全体</th><th>④個別</th><th>③是正</th><th>状態</th></tr></thead>
            <tbody>
              {LEDGER.map((r) => (
                <tr key={r.no}>
                  <td>{r.no}</td><td>{r.date}</td><td>{r.name}</td><td>{r.content}</td><td>{r.kind}</td><td>{r.repeat}</td>
                  <td>{r.g ? '実施済' : '—'}</td><td>{r.i ? '実施済' : '—'}</td><td>{r.c ? '実施済' : '—'}</td>
                  <td><span className={`status ${r.done ? 'st-approved' : 'st-submitted'}`}>{r.done ? '完了' : '未完了'}</span></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
      {toast && <div className="toast" role="status" aria-live="polite">{toast}</div>}
    </div>
  )
}
