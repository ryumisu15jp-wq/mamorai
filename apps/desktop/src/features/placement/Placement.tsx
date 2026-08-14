// [現場] 配置予定表 と 配置表。
//   配置予定表(予定): 当月シフト(予定)から生成。当月1日までに確定・出力する予定表。
//   配置表(実績):     日報から抽出した実績（＋管制実績）。当月末までの実配置。
// 実績データは BHT日報(ブルガリ 2026年6月)の取込済みデータを使用。月次件数からリスクを算出する。
import { useEffect, useMemo, useState } from 'react'
import { loadShift, subscribe as subShift } from '../shift/shiftApi.js'
import type { ShiftSnapshot } from '../../shared/shiftStore.js'
import { BHT_JUNE } from '../../pilot/bhtJune.js'
import { printPlacementPlan, printPlacementActual, printMonthlyReport } from './placementPrint.js'

type View = 'plan' | 'actual'
const clsOf = (code: string): string => {
  const c = (code.split('/')[0] ?? '').trim()
  if (c.startsWith('責')) return 'sc-resp'
  if (c.startsWith('日')) return 'sc-day'
  if (c.startsWith('夜')) return 'sc-night'
  if (c === '当') return 'sc-touban'
  if (c === '研') return 'sc-train'
  if (c === '有') return 'sc-leave'
  if (c === '休' || c === '明') return 'sc-off'
  return ''
}
const DOW = ['日', '月', '火', '水', '木', '金', '土']
function dowOf(y: number, m: number, d: number): number { return new Date(y, m - 1, d).getDay() }

// 月次件数からリスクを算出（件数に応じて 高/中/低）。
interface RiskItem { label: string; count: number; level: '高' | '中' | '低' }
const RISK_KEYS: { key: string; hi: number; mid: number }[] = [
  { key: '巡回時未施錠', hi: 20, mid: 5 },
  { key: '自火報発報', hi: 3, mid: 1 },
  { key: '不審者対応', hi: 5, mid: 2 },
  { key: '不審物対応', hi: 3, mid: 1 },
  { key: '緊急呼出', hi: 5, mid: 2 },
  { key: 'エレベーター呼出', hi: 5, mid: 2 },
  { key: '誤進入', hi: 3, mid: 1 },
  { key: '未返却', hi: 5, mid: 2 },
  { key: '救急対応', hi: 3, mid: 1 },
]
function computeRisk(counts: Record<string, number>): RiskItem[] {
  return RISK_KEYS.map(({ key, hi, mid }) => {
    const count = counts[key] ?? 0
    const level: RiskItem['level'] = count >= hi ? '高' : count >= mid ? '中' : '低'
    return { label: key, count, level }
  }).sort((a, b) => b.count - a.count)
}
const riskCls = (l: RiskItem['level']): string => (l === '高' ? 'st-rejected' : l === '中' ? 'st-submitted' : 'st-approved')

export function Placement(): JSX.Element {
  const [view, setView] = useState<View>('plan')
  const [ym, setYm] = useState('2026-09')
  const [snap, setSnap] = useState<ShiftSnapshot | undefined>(undefined)
  const [toast, setToast] = useState<string | null>(null)
  useEffect(() => {
    const refresh = (): void => { void loadShift(ym).then(setSnap) }
    refresh()
    return subShift(refresh)
  }, [ym])

  const june = BHT_JUNE
  const risk = useMemo(() => computeRisk(june.counts), [june])
  const [py, pm] = ym.split('-').map(Number)
  const planDays = useMemo(() => Array.from({ length: new Date(py!, pm!, 0).getDate() }, (_, i) => i + 1), [py, pm])
  const actualDays = useMemo(() => Array.from({ length: june.days }, (_, i) => i + 1), [june.days])

  return (
    <div className="page">
      <header className="page-head">
        <h1 className="page-title">配置予定表 / 配置表</h1>
        <span className="muted">ブルガリホテル東京</span>
      </header>

      <section className="card" aria-label="表示切替">
        <div className="card-b" style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
          <button type="button" className={`btn ${view === 'plan' ? 'btn-primary' : 'btn-secondary'}`} onClick={() => setView('plan')}>配置予定表（予定）</button>
          <button type="button" className={`btn ${view === 'actual' ? 'btn-primary' : 'btn-secondary'}`} onClick={() => setView('actual')}>配置表（実績・日報抽出）</button>
          {view === 'plan'
            ? <label className="fl" style={{ marginLeft: 'auto' }}>対象月<input className="input" type="month" value={ym} onChange={(e) => setYm(e.target.value)} /></label>
            : <span className="muted" style={{ marginLeft: 'auto' }}>実績: {june.year}年{june.month}月（日報取込）</span>}
        </div>
      </section>

      {view === 'plan' && (
        <section className="card" aria-label="配置予定表">
          <div className="card-h">
            <h2>配置予定表（{ym}・予定）</h2>
            <span className="muted">当月シフトから生成／当月1日までに確定</span>
            <button type="button" className="btn btn-secondary" style={{ marginLeft: 'auto' }} disabled={!snap || snap.staff.length === 0} onClick={() => { if (snap) { if (!printPlacementPlan(snap)) setToast('ポップアップを許可してください') } }}>配置予定表を出力(PDF)</button>
          </div>
          <div className="card-b" style={{ padding: 0 }}>
            {snap && snap.staff.length > 0 ? (
              <div className="sm-scroll">
                <table className="sm-tbl">
                  <thead>
                    <tr><th className="sm-name sm-sticky">氏名</th>{planDays.map((d) => <th key={d} className={`sm-d ${dowOf(py!, pm!, d) === 0 ? 'sm-sun' : dowOf(py!, pm!, d) === 6 ? 'sm-sat' : ''}`}>{d}</th>)}</tr>
                    <tr><th className="sm-name sm-sticky"></th>{planDays.map((d) => <th key={d} className="sm-dow">{DOW[dowOf(py!, pm!, d)]}</th>)}</tr>
                  </thead>
                  <tbody>
                    {snap.staff.map((s) => (
                      <tr key={s.no}>
                        <td className="sm-name sm-sticky">{s.name}</td>
                        {planDays.map((d, i) => {
                          const code = snap.grid[s.no]?.[i] ?? ''
                          return <td key={d} className={`sm-cell ${clsOf(code)}`}><span className="sm-btn">{code}</span></td>
                        })}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : <p className="muted" style={{ padding: 16 }}>この月のシフトが未作成です。「シフト」画面で作成すると配置予定表に反映されます。</p>}
          </div>
        </section>
      )}

      {view === 'actual' && (
        <>
          <section className="card" aria-label="配置表(実績)">
            <div className="card-h">
              <h2>配置表（{june.year}年{june.month}月・実績）</h2>
              <span className="muted">日報から抽出（{june.staff.length}名・延べ{Object.values(june.worktypeTotals).reduce((a, b) => a + b, 0)}人日）</span>
              <span style={{ marginLeft: 'auto', display: 'inline-flex', gap: 8 }}>
                <button type="button" className="btn btn-secondary" onClick={() => { if (!printPlacementActual(june)) setToast('ポップアップを許可してください') }}>配置表を出力(PDF)</button>
                <button type="button" className="btn btn-primary" onClick={() => { if (!printMonthlyReport(june)) setToast('ポップアップを許可してください') }}>月次報告書を出力(PDF)</button>
              </span>
            </div>
            <div className="card-b" style={{ padding: 0 }}>
              <div className="sm-scroll">
                <table className="sm-tbl">
                  <thead>
                    <tr><th className="sm-name sm-sticky">氏名</th>{actualDays.map((d) => <th key={d} className={`sm-d ${dowOf(june.year, june.month, d) === 0 ? 'sm-sun' : dowOf(june.year, june.month, d) === 6 ? 'sm-sat' : ''}`}>{d}</th>)}<th className="sm-sum">勤務</th></tr>
                    <tr><th className="sm-name sm-sticky"></th>{actualDays.map((d) => <th key={d} className="sm-dow">{DOW[dowOf(june.year, june.month, d)]}</th>)}<th className="sm-sum"></th></tr>
                  </thead>
                  <tbody>
                    {june.staff.map((name) => (
                      <tr key={name}>
                        <td className="sm-name sm-sticky">{name}</td>
                        {actualDays.map((d) => {
                          const code = june.roster[name]?.[d] ?? ''
                          return <td key={d} className={`sm-cell ${clsOf(code)}`}><span className="sm-btn" style={{ fontSize: 10 }}>{code}</span></td>
                        })}
                        <td className="sm-sum">{june.workdays[name] ?? 0}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          </section>

          <section className="card" aria-label="区分別 延べ人日">
            <div className="card-h"><h2>区分別 延べ人日（実績）</h2></div>
            <div className="card-b sc-legend">
              {Object.entries(june.worktypeTotals).map(([k, v]) => (
                <span key={k} className={`sc-chip ${clsOf(k)}`}>{k}<i>{v}人日</i></span>
              ))}
            </div>
          </section>

          <section className="card" aria-label="日報実績リスク">
            <div className="card-h"><h2>日報実績リスク（{june.year}年{june.month}月）</h2><span className="muted">件数から自動算出</span></div>
            <div className="card-b">
              <table className="tbl">
                <thead><tr><th>項目</th><th>件数</th><th>リスク</th></tr></thead>
                <tbody>
                  {risk.map((r) => (
                    <tr key={r.label}><td>{r.label}</td><td>{r.count}</td><td><span className={`status ${riskCls(r.level)}`}>{r.level}</span></td></tr>
                  ))}
                </tbody>
              </table>
              <p className="muted" style={{ marginTop: 8 }}>
                入館者 {june.counts['入館者'] ?? 0}／外部スタッフ {june.counts['外部スタッフ'] ?? 0}／平均稼働率 {Math.round((june.counts['稼働率平均'] ?? 0) * 1000) / 10}%
              </p>
            </div>
          </section>
        </>
      )}
      {toast && <div className="toast" role="status" aria-live="polite">{toast}</div>}
    </div>
  )
}
