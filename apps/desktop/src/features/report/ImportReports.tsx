// [現場/会社] 過去日報の取込。BHT日報ブック(.xlsm/.xlsx)をアップロードして
// 月次の日別カウント＋事案をデータ化し蓄積する。蓄積データからリスク・事案ログを表示。
import { useEffect, useMemo, useState } from 'react'
import { parseBhtWorkbook } from '../../lib/bhtParser.js'
import { downloadCsv } from '../../lib/csv.js'
import { printMonthlyReport } from '../placement/placementPrint.js'
import { SITE } from '../../pilot/bulgari.js'
import {
  addMonth, removeMonth, listMonths, allIncidents, incidentTotals, monthlyIncidentTrend, subscribe,
  type ImportedMonth,
} from '../../shared/reportImportStore.js'

// 取込月から月次報告書PDFを出力。
function reportOf(m: ImportedMonth): { site: string; year: number; month: number; counts: Record<string, number> } {
  const [y, mo] = m.ym.split('-').map(Number)
  return { site: m.site, year: y ?? 0, month: mo ?? 0, counts: m.totals }
}

const riskLevel = (n: number): { l: string; cls: string } =>
  n >= 20 ? { l: '高', cls: 'st-rejected' } : n >= 5 ? { l: '中', cls: 'st-submitted' } : { l: '低', cls: 'st-approved' }

export function ImportReports(): JSX.Element {
  const [months, setMonths] = useState<ImportedMonth[]>(() => listMonths())
  const [ym, setYm] = useState('2026-07')
  const [site, setSite] = useState('ブルガリホテル東京')
  const [preview, setPreview] = useState<ImportedMonth | null>(null)
  const [warn, setWarn] = useState<string[]>([])
  const [busy, setBusy] = useState(false)
  const [toast, setToast] = useState<string | null>(null)
  useEffect(() => subscribe(() => setMonths(listMonths())), [])

  const onFile = async (file: File | undefined): Promise<void> => {
    if (!file) return
    setBusy(true); setPreview(null); setWarn([])
    try {
      const buf = await file.arrayBuffer()
      const { month, warnings } = parseBhtWorkbook(buf, ym, site)
      setPreview(month); setWarn(warnings)
      setToast(`解析しました（日別${month.dailies.length}日・事案${month.incidents.length}件）`)
    } catch (e) {
      setToast(e instanceof Error ? e.message : '解析に失敗しました')
    } finally { setBusy(false) }
  }
  const save = (): void => {
    if (!preview) return
    addMonth(preview)
    setToast(`${preview.ym} を取込・蓄積しました`)
    setPreview(null); setWarn([])
  }

  const incidents = useMemo(() => allIncidents(), [months])
  const totals = useMemo(() => incidentTotals(), [months])
  const trend = useMemo(() => monthlyIncidentTrend(), [months])
  const maxTrend = Math.max(1, ...trend.map((t) => t.total))

  // 事案ログCSV（全月）
  const exportIncidentsCsv = (): void => {
    const rows: (string | number)[][] = [['日付', '現場', '事案', '件数', '備考']]
    for (const m of months) for (const i of m.incidents) rows.push([i.date, m.site, i.category, i.count, i.note ?? ''])
    rows.sort((a, b) => (String(a[0]) < String(b[0]) ? 1 : -1))
    downloadCsv(`事案ログ_${SITE.name}.csv`, [rows[0]!, ...rows.slice(1)])
    setToast(`事案ログ ${incidents.length}件 をCSV出力しました`)
  }
  // 累積リスクCSV
  const exportRiskCsv = (): void => {
    downloadCsv(`累積リスク_${SITE.name}.csv`, [['事案カテゴリ', '累積件数'], ...totals.map((t) => [t.category, t.count])])
    setToast('累積リスクをCSV出力しました')
  }

  return (
    <div className="page">
      <header className="page-head">
        <h1 className="page-title">日報取込（データ化・蓄積）</h1>
        <span className="muted">取込済 {months.length} ヶ月 / 事案 {incidents.length} 件</span>
      </header>

      <section className="card" aria-label="日報アップロード">
        <div className="card-h"><h2>日報ブックを取込</h2><span className="muted">BHT様式(.xlsm/.xlsx)の「カウント」を解析</span></div>
        <div className="card-b">
          <div className="filters">
            <label className="fl">対象年月<input className="input" type="month" value={ym} onChange={(e) => setYm(e.target.value)} /></label>
            <label className="fl">現場<input className="input" value={site} onChange={(e) => setSite(e.target.value)} /></label>
            <label className="fl">ファイル<input className="input" type="file" accept=".xlsm,.xlsx" onChange={(e) => void onFile(e.target.files?.[0])} /></label>
          </div>
          {busy && <p className="muted">解析中…</p>}
          {warn.length > 0 && <p className="muted" style={{ color: '#b8860b' }}>注意: {warn.join(' / ')}</p>}
          {preview && (
            <div className="card" style={{ marginTop: 10 }}>
              <div className="card-h"><h2>プレビュー（{preview.ym}）</h2>
                <button type="button" className="btn btn-primary" style={{ marginLeft: 'auto' }} onClick={save}>この内容で取込・蓄積</button>
              </div>
              <div className="card-b">
                <p>日別 {preview.dailies.length}日 ／ 事案 {preview.incidents.length}件 ／ 総数 {preview.totals['総数'] ?? 0} ／ 平均稼働率 {Math.round((preview.totals['稼働率平均'] ?? 0) * 1000) / 10}%</p>
                <p className="muted">未施錠 {preview.totals['巡回時未施錠'] ?? 0}／自火報 {preview.totals['自火報発報'] ?? 0}／不審者 {preview.totals['不審者対応'] ?? 0}／緊急呼出 {preview.totals['緊急呼出'] ?? 0}／ELV呼出 {preview.totals['エレベーター呼出'] ?? 0}／未返却 {preview.totals['未返却'] ?? 0}</p>
              </div>
            </div>
          )}
        </div>
      </section>

      <section className="card" aria-label="取込済み月">
        <div className="card-h"><h2>取込済みの月</h2><span className="muted">月次報告書を月別に出力できます</span></div>
        <div className="card-b">
          <table className="tbl">
            <thead><tr><th>対象月</th><th>現場</th><th>事案</th><th>総数</th><th>稼働率</th><th>取込</th><th></th></tr></thead>
            <tbody>
              {months.map((m) => (
                <tr key={m.ym}>
                  <td>{m.ym}</td><td>{m.site}</td><td>{m.incidents.length}件</td><td>{m.totals['総数'] ?? 0}</td>
                  <td>{Math.round((m.totals['稼働率平均'] ?? 0) * 1000) / 10}%</td><td className="muted">{m.importedAt}</td>
                  <td>
                    <span className="row-actions" style={{ gap: 6 }}>
                      <button type="button" className="btn-sm btn-approve" onClick={() => { if (!printMonthlyReport(reportOf(m))) setToast('ポップアップを許可してください') }}>月次報告書(PDF)</button>
                      <button type="button" className="btn-sm btn-reject" onClick={() => { removeMonth(m.ym); setToast(`${m.ym} を削除しました`) }}>削除</button>
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <section className="card" aria-label="リスク蓄積">
        <div className="card-h"><h2>事案リスク（累積）</h2>
          <button type="button" className="btn-sm" style={{ marginLeft: 'auto' }} onClick={exportRiskCsv}>累積リスクCSV</button>
        </div>
        <div className="card-b">
          <table className="tbl">
            <thead><tr><th>事案カテゴリ</th><th>累積件数</th><th>リスク</th></tr></thead>
            <tbody>
              {totals.map((t) => { const r = riskLevel(t.count); return (
                <tr key={t.category}><td>{t.category}</td><td>{t.count}</td><td><span className={`status ${r.cls}`}>{r.l}</span></td></tr>
              ) })}
            </tbody>
          </table>
          <h3 style={{ marginTop: 14 }}>月別 事案件数トレンド</h3>
          <div style={{ display: 'flex', alignItems: 'flex-end', gap: 10, height: 120, padding: '8px 0' }}>
            {trend.map((t) => (
              <div key={t.ym} style={{ textAlign: 'center', flex: '0 0 48px' }}>
                <div style={{ height: `${(t.total / maxTrend) * 90}px`, background: '#1746a2', borderRadius: '4px 4px 0 0' }} title={`${t.total}件`} />
                <div style={{ fontSize: 11, marginTop: 4 }}>{t.ym.slice(5)}月</div>
                <div style={{ fontSize: 11, fontWeight: 700 }}>{t.total}</div>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section className="card" aria-label="事案ログ">
        <div className="card-h"><h2>事案ログ（全月）</h2><span className="muted">{incidents.length} 件</span>
          <button type="button" className="btn-sm" style={{ marginLeft: 'auto' }} onClick={exportIncidentsCsv}>事案ログCSV</button>
        </div>
        <div className="card-b">
          <table className="tbl">
            <thead><tr><th>日付</th><th>事案</th><th>件数</th><th>備考</th></tr></thead>
            <tbody>
              {incidents.slice(0, 60).map((i, idx) => (
                <tr key={`${i.date}-${i.category}-${idx}`}>
                  <td>{i.date}</td><td>{i.category}</td><td>{i.count}</td><td className="muted">{i.note ?? ''}</td>
                </tr>
              ))}
            </tbody>
          </table>
          {incidents.length > 60 && <p className="muted">ほか {incidents.length - 60} 件</p>}
        </div>
      </section>
      {toast && <div className="toast" role="status" aria-live="polite">{toast}</div>}
    </div>
  )
}
