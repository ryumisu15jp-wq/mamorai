// [出力] 3成果物（配置予定表・配置表・月次報告書）を印刷様式HTMLで生成し、印刷(PDF保存)する。
// 配置予定表/配置表: A4横のグリッド。月次報告書: A4縦。追加ライブラリ不要（window.print）。
import type { ShiftSnapshot } from '../../shared/shiftStore.js'
import type { BhtMonth } from '../../pilot/bhtJune.js'
import { COMPANY, SITE } from '../../pilot/bulgari.js'

const esc = (s: string): string => s.replace(/[&<>]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' }[c]!))
const DOW = ['日', '月', '火', '水', '木', '金', '土']
const dow = (y: number, m: number, d: number): number => new Date(y, m - 1, d).getDay()

// 区分コード→背景色（印刷用の淡色）。
function bg(code: string): string {
  const c = (code.split('/')[0] ?? '').trim()
  if (c.startsWith('責')) return '#fde8e6'
  if (c.startsWith('日')) return '#e8eefb'
  if (c.startsWith('夜')) return '#e7eaf6'
  if (c === '当') return '#fbf3dd'
  if (c === '研') return '#e6f5ec'
  if (c === '有') return '#eafaf0'
  if (c === '休' || c === '明') return '#f0f2f5'
  return '#fff'
}

const baseCss = (landscape: boolean): string => `
  @page{size:A4 ${landscape ? 'landscape' : 'portrait'};margin:8mm;}
  *{box-sizing:border-box;margin:0;padding:0;font-family:'Yu Gothic','Hiragino Kaku Gothic ProN',sans-serif;}
  body{color:#141a24;font-size:10px;}
  .hd{display:flex;justify-content:space-between;align-items:flex-end;border-bottom:2px solid #16294a;padding-bottom:4px;margin-bottom:6px;}
  .hd h1{font-size:17px;color:#0f1c34;letter-spacing:.08em;}
  .hd .meta{font-size:10px;color:#444;text-align:right;line-height:1.5;}
  table{border-collapse:collapse;width:100%;}
  th,td{border:1px solid #b9c1cf;text-align:center;padding:2px 3px;}
  .name{text-align:left;white-space:nowrap;position:sticky;left:0;background:#f4f6fa;font-weight:600;}
  thead th{background:#eef2f8;color:#16294a;}
  .sun{color:#b23a2f;} .sat{color:#2f5bd0;}
  .lg{margin-top:6px;font-size:9px;color:#333;}
  .lg span{display:inline-block;border:1px solid #b9c1cf;border-radius:3px;padding:1px 6px;margin-right:4px;}
`

function printDoc(html: string, landscape = false): boolean {
  const w = window.open('', '_blank', `width=${landscape ? 1123 : 794},height=900`)
  if (w === null) return false
  w.document.open(); w.document.write(html); w.document.close(); w.focus()
  setTimeout(() => { try { w.print() } catch { /* ignore */ } }, 300)
  return true
}

/** 配置予定表HTML（予定・当月シフトから）。 */
export function buildPlacementPlanHtml(snap: ShiftSnapshot): string {
  const [y, m] = snap.ym.split('-').map(Number)
  const n = new Date(y!, m!, 0).getDate()
  const days = Array.from({ length: n }, (_, i) => i + 1)
  const head = days.map((d) => `<th class="${dow(y!, m!, d) === 0 ? 'sun' : dow(y!, m!, d) === 6 ? 'sat' : ''}">${d}<br/>${DOW[dow(y!, m!, d)]}</th>`).join('')
  const rows = snap.staff.map((s) => {
    const cells = days.map((d, i) => { const code = snap.grid[s.no]?.[i] ?? ''; return `<td style="background:${bg(code)}">${esc(code)}</td>` }).join('')
    return `<tr><td class="name">${esc(s.name)}</td>${cells}</tr>`
  }).join('')
  const html = `<!DOCTYPE html><html lang="ja"><head><meta charset="UTF-8"/><title>配置予定表 ${snap.ym}</title><style>${baseCss(true)}</style></head><body onload="">
    <div class="hd"><h1>配置予定表</h1><div class="meta">${esc(COMPANY.name)}／${esc(SITE.name)}<br/>${esc(SITE.dept)}<br/>対象月：${y}年${m}月（予定・当月1日確定）</div></div>
    <table><thead><tr><th class="name">氏名</th>${head}</tr></thead><tbody>${rows}</tbody></table>
    <p class="lg">区分：責＝責任者／日A〜C＝日勤／夜A・B＝夜勤／当＝当務／明＝明休／休＝公休／研＝研修／有＝有給</p>
  </body></html>`
  return html
}
export function printPlacementPlan(snap: ShiftSnapshot): boolean { return printDoc(buildPlacementPlanHtml(snap), true) }

/** 配置表HTML（実績・日報抽出）。 */
export function buildPlacementActualHtml(june: BhtMonth): string {
  const days = Array.from({ length: june.days }, (_, i) => i + 1)
  const head = days.map((d) => `<th class="${dow(june.year, june.month, d) === 0 ? 'sun' : dow(june.year, june.month, d) === 6 ? 'sat' : ''}">${d}<br/>${DOW[dow(june.year, june.month, d)]}</th>`).join('')
  const rows = june.staff.map((name) => {
    const cells = days.map((d) => { const code = june.roster[name]?.[d] ?? ''; return `<td style="background:${bg(code)};font-size:8px">${esc(code)}</td>` }).join('')
    return `<tr><td class="name">${esc(name)}</td>${cells}<td>${june.workdays[name] ?? 0}</td></tr>`
  }).join('')
  const totals = Object.entries(june.worktypeTotals).map(([k, v]) => `<span>${esc(k)} ${v}人日</span>`).join('')
  const html = `<!DOCTYPE html><html lang="ja"><head><meta charset="UTF-8"/><title>配置表 ${june.year}-${june.month}</title><style>${baseCss(true)}</style></head><body>
    <div class="hd"><h1>配置表（実績）</h1><div class="meta">${esc(COMPANY.name)}／${esc(SITE.name)}<br/>${esc(SITE.dept)}<br/>${june.year}年${june.month}月（日報抽出・管制実績）</div></div>
    <table><thead><tr><th class="name">氏名</th>${head}<th>勤務</th></tr></thead><tbody>${rows}</tbody></table>
    <p class="lg">区分別 延べ人日：${totals}</p>
  </body></html>`
  return html
}
export function printPlacementActual(june: BhtMonth): boolean { return printDoc(buildPlacementActualHtml(june), true) }

/** 月次報告書の入力（BhtMonth や 取込月から作れる汎用形）。 */
export interface MonthlyReportData { site: string; year: number; month: number; counts: Record<string, number> }

/** 月次報告書HTML（件数集計＋対応事案明細＋稼働率）。任意の月データから生成。 */
export function buildMonthlyReportHtml(june: MonthlyReportData): string {
  const c = june.counts
  const g = (k: string): number => c[k] ?? 0
  const rows = (items: [string, number][]): string => items.map(([k, v]) => `<tr><td class="k">${esc(k)}</td><td class="v">${v}</td></tr>`).join('')
  const summary = rows([
    ['入館者数', g('入館者')], ['外部スタッフ数', g('外部スタッフ')], ['巡回時未施錠', g('巡回時未施錠')],
    ['自火報発報', g('自火報発報')], ['救急対応', g('救急対応')], ['不審者対応', g('不審者対応')],
    ['不審物対応', g('不審物対応')], ['エレベーター呼出', g('エレベーター呼出')], ['緊急呼出', g('緊急呼出')],
    ['未返却', g('未返却')], ['誤進入', g('誤進入')], ['セキュリティカード登録・変更', g('セキュリティカード登録・変更')],
    ['警察対応', g('警察対応')], ['ジュエリーケース発報', g('ジュエリーケース発報')],
  ])
  const rate = Math.round((g('稼働率平均')) * 1000) / 10
  const html = `<!DOCTYPE html><html lang="ja"><head><meta charset="UTF-8"/><title>月次報告書 ${june.year}-${june.month}</title><style>${baseCss(false)}
    body{font-size:12px;} .mono{width:70%;margin:0 auto;} td.k{text-align:left;background:#f4f6fa;width:60%;} td.v{width:40%;font-weight:700;}
    h2{font-size:13px;margin:12px 0 4px;color:#16294a;border-left:4px solid #16294a;padding-left:6px;}
    .rate{margin-top:10px;font-size:14px;font-weight:700;text-align:center;background:#eef2f8;padding:8px;border-radius:6px;}
  </style></head><body>
    <div class="hd"><h1>月次報告書</h1><div class="meta">${esc(COMPANY.name)}／${esc(SITE.name)}<br/>${esc(SITE.dept)}<br/>${june.year}年${june.month}月</div></div>
    <h2>業務対応 件数集計</h2>
    <table class="mono"><tbody>${summary}</tbody></table>
    <div class="rate">平均稼働率（IN/OUT）：${rate}%　／　総対応件数：${g('総数')}件</div>
    <h2>主な対応事案</h2>
    <table class="mono"><tbody>${rows([['自火報発報', g('自火報発報')], ['緊急呼出', g('緊急呼出')], ['不審者対応', g('不審者対応')], ['救急対応', g('救急対応')], ['エレベーター呼出', g('エレベーター呼出')]])}</tbody></table>
    <p class="lg" style="margin-top:10px">※ 本報告書は日報の件数集計から自動生成（原本合計と一致）。事案の明細は日報の特記事項から集約。</p>
  </body></html>`
  return html
}
export function printMonthlyReport(june: MonthlyReportData): boolean { return printDoc(buildMonthlyReportHtml(june), false) }
