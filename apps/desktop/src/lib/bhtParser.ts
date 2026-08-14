// [取込] BHT日報ブック(.xlsm/.xlsx)の「カウント」シートを解析し、月次の日別カウント＋事案を抽出する。
// SheetJS(xlsx)でクライアント側パース。ヘッダ行のラベルで列を特定するため、月が変わっても頑健。
import * as XLSX from 'xlsx'
import { COUNT_KEYS, INCIDENT_KEYS, type ImportedMonth, type DailyCount, type Incident } from '../shared/reportImportStore.js'

export interface ParseResult { month: ImportedMonth; warnings: string[] }

export function parseBhtWorkbook(data: ArrayBuffer, ym: string, site: string): ParseResult {
  const warnings: string[] = []
  const wb = XLSX.read(data, { type: 'array' })
  const ws = wb.Sheets['カウント']
  if (!ws) throw new Error('「カウント」シートが見つかりません。BHT日報ブックを選択してください。')
  const rows = XLSX.utils.sheet_to_json<unknown[]>(ws, { header: 1, raw: true, defval: null })
  const header = (rows[0] ?? []) as unknown[]
  const col: Record<string, number> = {}
  header.forEach((v, i) => { if (v != null && String(v).trim() !== '') col[String(v).trim()] = i })
  const need = ['総数', '稼働率']
  for (const n of need) if (col[n] == null) warnings.push(`列「${n}」が見つかりません`)

  const [y, m] = ym.split('-').map(Number)
  const num = (v: unknown): number => (typeof v === 'number' ? v : 0)
  const dailies: DailyCount[] = []
  const incidents: Incident[] = []
  let totalRow: unknown[] | null = null

  for (let r = 1; r < rows.length; r++) {
    const row = (rows[r] ?? []) as unknown[]
    const a = row[0]
    if (typeof a === 'string' && a.trim() === '合計') { totalRow = row; continue }
    if (typeof a !== 'number' || a < 1 || a > 31) continue
    const day = Math.trunc(a)
    const counts: Record<string, number> = {}
    for (const k of COUNT_KEYS) { const ci = col[k]; counts[k] = ci != null ? num(row[ci]) : 0 }
    const rc = col['稼働率']; const rate = rc != null && typeof row[rc] === 'number' ? (row[rc] as number) : null
    const date = `${y}-${String(m).padStart(2, '0')}-${String(day).padStart(2, '0')}`
    dailies.push({ day, counts, rate })
    for (const k of INCIDENT_KEYS) { const n = counts[k] ?? 0; if (n > 0) incidents.push({ date, category: k, count: n }) }
    const eq = col['地震']
    if (eq != null) { const yv = row[eq]; if (yv != null && yv !== '' && yv !== 0 && yv !== '0') incidents.push({ date, category: '地震', count: 1, note: String(yv) }) }
  }
  if (dailies.length === 0) warnings.push('日別データが読み取れませんでした')

  const totals: Record<string, number> = {}
  if (totalRow) {
    for (const k of COUNT_KEYS) { const ci = col[k]; totals[k] = ci != null ? num(totalRow[ci]) : 0 }
    const tc = col['総数']; totals['総数'] = tc != null ? num(totalRow[tc]) : 0
    const rc = col['稼働率']; totals['稼働率平均'] = rc != null ? num(totalRow[rc]) : 0
  } else {
    for (const k of COUNT_KEYS) totals[k] = dailies.reduce((s, d) => s + (d.counts[k] ?? 0), 0)
    const rates = dailies.map((d) => d.rate).filter((x): x is number => x != null && x > 0)
    totals['稼働率平均'] = rates.length ? rates.reduce((a, b) => a + b, 0) / rates.length : 0
    totals['総数'] = COUNT_KEYS.reduce((s, k) => s + (totals[k] ?? 0), 0)
    warnings.push('合計行が無いため日別から集計しました')
  }
  return { month: { site, ym, totals, dailies, incidents }, warnings }
}
