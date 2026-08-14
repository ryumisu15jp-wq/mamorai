// [有給] 有給休暇申請書（ISO A5・アップロード様式準拠）をHTML生成し印刷(PDF保存)する。
// 承認時は、現場責任者・会社担当者の印影＋署名を自動押印する（氏名から自動生成）。
// 用紙: ISO A5 (148×210mm)。ブラウザ標準の印刷ダイアログで「A5・PDFに保存」できる。
import { buildSealSvg, buildSignatureSvg } from '../../lib/sealSignature.js'

export interface LeaveApprover { name: string; title: string; date?: string }

export interface LeaveForm {
  filedDate: string   // 届出年月日 YYYY-MM-DD
  company: string     // 会社（例: ヒトトヒト株式会社）
  dept: string        // 所属部署（例: ビルサービス部セキュリティ２グループ）
  site: string        // 現場（例: ブルガリホテル東京）
  staffNo: string
  name: string
  fromDate: string    // 取得開始日 YYYY-MM-DD
  toDate: string      // 取得終了日 YYYY-MM-DD
  startTime?: string  // 時間 例 09:00
  days: number
  reason: string      // 理由（私用の為、… の続き）
  siteApprover?: LeaveApprover     // 現場一次承認者（現場責任者）
  companyApprover?: LeaveApprover  // 会社最終承認者
}

const reiwa = (y: number): number => y - 2018
function ymd(d: string): { y: number; m: number; d: number } {
  const [y, m, dd] = d.split('-').map(Number)
  return { y: y ?? 0, m: m ?? 0, d: dd ?? 0 }
}
const esc = (s: string): string => s.replace(/[&<>]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' }[c]!))

// 承認欄（1マス）。承認者が居れば印影＋署名を描画。
function approvalCell(title: string, ap?: LeaveApprover): string {
  const body = ap
    ? `<div class="apx">${buildSealSvg(ap.name, 40)}<div class="apsig">${buildSignatureSvg(ap.name, 76, 16)}</div></div>`
    : '<div class="apx"></div>'
  return `<div class="apc"><div class="apt">${esc(title)}</div>${body}</div>`
}

/** 有給休暇申請書のHTML（A5・印刷様式）。 */
export function buildLeaveFormHtml(f: LeaveForm): string {
  const fd = ymd(f.filedDate), from = ymd(f.fromDate), to = ymd(f.toDate)
  const ca = f.companyApprover
  // 会社承認は役職に応じて該当マスへ。該当役職以外は空欄（上位承認は手押し想定）。
  const boxKacho = ca && ca.title.includes('課長') ? ca : undefined
  const boxBucho = ca && ca.title.includes('部長') && !ca.title.includes('本部') ? ca : undefined
  const boxHonbu = ca && ca.title.includes('本部') ? ca : undefined
  return `<!DOCTYPE html><html lang="ja"><head><meta charset="UTF-8"/><title>有給休暇申請書</title>
<style>
  @page{size:A5;margin:8mm;}
  *{box-sizing:border-box;margin:0;padding:0;font-family:'Yu Mincho','Hiragino Mincho ProN',serif;}
  html,body{width:132mm;}
  body{color:#111;font-size:10.5px;line-height:1.5;}
  .top{display:flex;justify-content:flex-end;gap:0;margin-bottom:3mm;}
  .apc{width:17mm;border:1px solid #333;border-left:none;display:flex;flex-direction:column;}
  .apc:first-child{border-left:1px solid #333;}
  .apt{font-size:8.5px;text-align:center;border-bottom:1px solid #333;padding:1px 0;background:#f4f4f4;white-space:nowrap;}
  .apx{height:15mm;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:1px;}
  .apsig{line-height:0;}
  h1{text-align:center;font-size:19px;letter-spacing:.4em;margin:2mm 0 4mm;font-weight:700;}
  table{width:100%;border-collapse:collapse;}
  td{border:1px solid #333;padding:4px 6px;vertical-align:middle;}
  .lbl{background:#f4f4f4;width:24mm;text-align:center;font-weight:600;white-space:pre-line;}
  .r{display:inline-block;min-width:1.4em;text-align:center;border-bottom:1px solid #555;padding:0 3px;}
  .lead{padding:3mm 0 1mm;}
  .note{margin-top:3mm;font-size:9px;color:#333;}
  .foot{margin-top:2mm;font-size:8.5px;color:#666;text-align:right;}
</style></head><body>
  <div class="top">
    ${approvalCell('現場責任者', f.siteApprover)}
    ${approvalCell('課　長', boxKacho)}
    ${approvalCell('部　長', boxBucho)}
    ${approvalCell('本部長', boxHonbu)}
  </div>
  <h1>有給休暇申請書</h1>
  <table>
    <tr>
      <td class="lbl">届出年月日</td>
      <td>令和 <span class="r">${reiwa(fd.y)}</span> 年 <span class="r">${fd.m}</span> 月 <span class="r">${fd.d}</span> 日</td>
      <td class="lbl">所　属</td>
      <td>${esc(f.company)}<br/>${esc(f.dept)}<br/>${esc(f.site)}</td>
    </tr>
    <tr>
      <td class="lbl">SEスタッフNo</td>
      <td>${esc(f.staffNo)}</td>
      <td class="lbl">氏　名</td>
      <td>${esc(f.name)}</td>
    </tr>
  </table>
  <p class="lead">下記の通り申請いたします。</p>
  <table>
    <tr>
      <td class="lbl">日　時</td>
      <td>令和 <span class="r">${reiwa(from.y)}</span> 年 <span class="r">${from.m}</span> 月 <span class="r">${from.d}</span> 日 ～ <span class="r">${to.m}</span> 月 <span class="r">${to.d}</span> 日</td>
    </tr>
    <tr><td class="lbl">時　間</td><td>${esc(f.startTime ?? '09:00')} ～</td></tr>
    <tr><td class="lbl">日　数</td><td><span class="r">${f.days}</span> 日</td></tr>
    <tr><td class="lbl">理　由</td><td>私用の為、${esc(f.reason)}</td></tr>
  </table>
  <p class="note">※上記届は、原則として前日迄に提出</p>
  ${f.siteApprover ? `<p class="foot">現場承認: ${esc(f.siteApprover.name)}${f.siteApprover.date ? '（' + esc(f.siteApprover.date) + '）' : ''}${ca ? ' ／ 会社承認: ' + esc(ca.title) + ' ' + esc(ca.name) + (ca.date ? '（' + esc(ca.date) + '）' : '') : ''}</p>` : ''}
</body></html>`
}

/** 別ウィンドウで様式を開き、印刷(PDF保存)ダイアログを出す。 */
export function printLeaveForm(f: LeaveForm): boolean {
  const html = buildLeaveFormHtml(f)
  const w = window.open('', '_blank', 'width=760,height=1040')
  if (w === null) return false
  w.document.open()
  w.document.write(html)
  w.document.close()
  w.focus()
  setTimeout(() => { try { w.print() } catch { /* ignore */ } }, 300)
  return true
}
