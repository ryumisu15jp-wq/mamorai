// [勤務員PWA] お知らせ・業務連絡。会社/現場からの連絡を受信し既読管理（デモ:ローカル）。
import { useState } from 'react'

interface Notice { id: string; cat: '業務連絡' | 'お知らせ' | '重要'; from: string; title: string; body: string; date: string; read: boolean }

const SEED: Notice[] = [
  { id: 'n1', cat: '重要', from: '会社', title: '台風接近に伴う勤務体制の変更', body: '9/5夜勤より、館内巡回を1時間毎に強化します。詳細は現場責任者の指示に従ってください。', date: '2026-09-02', read: false },
  { id: 'n2', cat: '業務連絡', from: '現場', title: '制服クリーニング回収日', body: '毎週水曜に回収します。所定の袋に入れて防災センターへ提出してください。', date: '2026-09-01', read: false },
  { id: 'n3', cat: 'お知らせ', from: '会社', title: '現任教育（法定10時間）申込受付中', body: '講習会タブから申込できます。年度内に必ず1回受講してください。', date: '2026-08-28', read: true },
]

const catCls = (c: Notice['cat']): string => (c === '重要' ? 'h-off' : c === '業務連絡' ? 'h-night' : 'h-ok')

export function Notices(): JSX.Element {
  const [rows, setRows] = useState<Notice[]>(SEED)
  const [open, setOpen] = useState<string | null>(null)
  const unread = rows.filter((r) => !r.read).length
  const toggle = (id: string): void => {
    setOpen((o) => (o === id ? null : id))
    setRows((p) => p.map((r) => (r.id === id ? { ...r, read: true } : r)))
  }

  return (
    <div className="pwa-page">
      <h1 className="pwa-title">お知らせ・連絡 {unread > 0 && <span className="pwa-badge">{unread}</span>}</h1>
      <ul className="pwa-list">
        {rows.map((r) => (
          <li key={r.id} className={`pwa-notice${r.read ? '' : ' unread'}`}>
            <button type="button" className="pwa-notice-h" onClick={() => toggle(r.id)}>
              <span className={`chip ${catCls(r.cat)}`}>{r.cat}</span>
              <span className="pwa-notice-title">{r.title}</span>
              <span className="pwa-notice-date">{r.date}</span>
            </button>
            {open === r.id && (
              <div className="pwa-notice-body">
                <p className="pwa-list-sub">{r.from}より</p>
                <p>{r.body}</p>
              </div>
            )}
          </li>
        ))}
      </ul>
    </div>
  )
}
