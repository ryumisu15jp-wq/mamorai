// [勤務員PWA] 講習会・研修 参加申込。ログイン済みスタッフ情報を自動適用（氏名/生年月日/部署）。
// 申込は共有ストアへ保存され、現場承認→会社受理に回る。法定研修(新任/現任)を含む。
import { useEffect, useState } from 'react'
import type { Staff } from '../staff.js'
import { COMPANY } from '../../pilot/bulgari.js'
import { SEMINARS, submitTraining, listTrainingForStaff, subscribe, seminarById, type TrainingApp } from '../../shared/trainingStore.js'

const kindCls = (k: TrainingApp['kind']): string => (k === '新任教育' ? 'h-off' : k === '現任教育' ? 'h-night' : 'h-ok')
const statusCls = (s: TrainingApp['status']): string => (s === '会社受理' ? 'h-ok' : s === '却下' ? 'h-off' : 'h-night')

export function TrainingApplyPwa({ staff }: { staff: Staff }): JSX.Element {
  const [mine, setMine] = useState<TrainingApp[]>(() => listTrainingForStaff(staff.no))
  const [toast, setToast] = useState<string | null>(null)
  useEffect(() => subscribe(() => setMine(listTrainingForStaff(staff.no))), [staff.no])

  const appliedIds = new Set(mine.filter((m) => m.status !== '却下').map((m) => m.seminarId))
  const apply = (id: string): void => {
    const s = seminarById(id); if (!s) return
    submitTraining({
      staffNo: staff.no, name: staff.name, dob: staff.dob, dept: staff.dept, site: staff.sites[0] ?? '',
      seminarId: s.id, seminarTitle: s.title, kind: s.kind,
    })
    setMine(listTrainingForStaff(staff.no))
    setToast(`${s.title} に申し込みました（現場・会社の承認待ち）`)
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
        {SEMINARS.map((s) => {
          const applied = appliedIds.has(s.id)
          return (
            <li key={s.id} className="pwa-list-row">
              <div>
                <div className="pwa-list-main"><span className={`chip ${kindCls(s.kind)}`}>{s.kind}</span> {s.title}</div>
                <div className="pwa-list-sub">{s.date}／{s.place}／定員{s.capacity}</div>
              </div>
              {applied ? <span className="chip h-ok">申込済</span>
                : <button type="button" className="pwa-btn pwa-btn-sm" onClick={() => apply(s.id)}>申込む</button>}
            </li>
          )
        })}
      </ul>

      {mine.length > 0 && <>
        <h2 className="pwa-h2">申込履歴</h2>
        <ul className="pwa-list">
          {mine.map((m) => (
            <li key={m.id} className="pwa-list-row">
              <div><div className="pwa-list-main">{m.seminarTitle}</div><div className="pwa-list-sub">{m.kind}</div></div>
              <span className={`chip ${statusCls(m.status)}`}>{m.status}</span>
            </li>
          ))}
        </ul>
      </>}

      {toast && <div className="pwa-toast" role="status">{toast}</div>}
      <p className="pwa-note" style={{ marginTop: 12 }}>※ {COMPANY.name} 主催の法定研修は年度内に受講してください。</p>
    </div>
  )
}
