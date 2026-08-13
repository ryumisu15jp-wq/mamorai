// [勤務員PWA] 講習会・研修 参加申込。ログイン済みスタッフ情報を自動適用（氏名/生年月日/部署）。
// 法定研修(新任/現任)を含む。申込は会社「講習会管理」に反映される想定。
import { useState } from 'react'
import type { Staff } from '../staff.js'

interface Seminar { id: string; title: string; kind: '新任教育' | '現任教育' | '一般'; date: string; place: string; capacity: number; applied: number; mine: boolean }
const kindCls = (k: Seminar['kind']): string => (k === '新任教育' ? 'h-off' : k === '現任教育' ? 'h-night' : 'h-ok')

const SEED: Seminar[] = [
  { id: 't1', title: '新任教育（法定20時間）', kind: '新任教育', date: '2026-09-03', place: '本社研修室', capacity: 20, applied: 12, mine: false },
  { id: 't2', title: '現任教育（法定10時間）', kind: '現任教育', date: '2026-09-10', place: 'オンライン', capacity: 50, applied: 31, mine: false },
  { id: 't3', title: '上級救命講習', kind: '一般', date: '2026-09-18', place: '立川消防署', capacity: 15, applied: 15, mine: false },
]

export function TrainingApplyPwa({ staff }: { staff: Staff }): JSX.Element {
  const [rows, setRows] = useState<Seminar[]>(SEED)
  const [toast, setToast] = useState<string | null>(null)
  const apply = (id: string): void => {
    setRows((p) => p.map((s) => (s.id === id && !s.mine && s.applied < s.capacity ? { ...s, applied: s.applied + 1, mine: true } : s)))
    setToast(`${staff.name} さんで申し込みました`)
  }

  return (
    <div className="pwa-page">
      <h1 className="pwa-title">講習会・研修 申込</h1>
      <div className="pwa-card pwa-staffcard">
        <div><span className="pwa-k">氏名</span>{staff.name}</div>
        <div><span className="pwa-k">生年月日</span>{staff.dob}</div>
        <div><span className="pwa-k">部署</span>{staff.dept}</div>
        <p className="pwa-note">※ ログイン情報が自動適用されます</p>
      </div>

      <h2 className="pwa-h2">開催予定（法定研修を含む）</h2>
      <ul className="pwa-list">
        {rows.map((s) => {
          const full = s.applied >= s.capacity && !s.mine
          return (
            <li key={s.id} className="pwa-list-row">
              <div>
                <div className="pwa-list-main"><span className={`chip ${kindCls(s.kind)}`}>{s.kind}</span> {s.title}</div>
                <div className="pwa-list-sub">{s.date}／{s.place}／{s.applied}/{s.capacity}</div>
              </div>
              {s.mine ? <span className="chip h-ok">申込済</span>
                : full ? <span className="chip h-off">満席</span>
                : <button type="button" className="pwa-btn pwa-btn-sm" onClick={() => apply(s.id)}>申込む</button>}
            </li>
          )
        })}
      </ul>
      {toast && <div className="pwa-toast" role="status">{toast}</div>}
    </div>
  )
}
