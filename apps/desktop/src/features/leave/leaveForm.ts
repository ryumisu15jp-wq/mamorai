// [有給] 有給休暇申請書の様式（アップロード xlsx 準拠）でHTMLを生成し、印刷(PDF保存)する。
// ブラウザ標準の印刷ダイアログで「PDFに保存」できるため追加ライブラリ不要。
export interface LeaveForm {
  filedDate: string   // 届出年月日 YYYY-MM-DD
  dept: string        // 所属（例: セキュリティサービス4）
  site: string        // 現場（例: ブルガリホテル東京(施設)）
  staffNo: string
  name: string
  fromDate: string    // 取得開始日 YYYY-MM-DD
  toDate: string      // 取得終了日 YYYY-MM-DD
  startTime?: string  // 時間 例 09:00
  days: number
  reason: string      // 理由（私用の為、… の続き）
}

const reiwa = (y: number): number => y - 2018
function ymd(d: string): { y: number; m: number; d: number } {
  const [y, m, dd] = d.split('-').map(Number)
  return { y: y ?? 0, m: m ?? 0, d: dd ?? 0 }
}

/** 有給休暇申請書のHTML（A4・印刷様式）。 */
export function buildLeaveFormHtml(f: LeaveForm): string {
  const fd = ymd(f.filedDate); const from = ymd(f.fromDate); const to = ymd(f.toDate)
  const esc = (s: string): string => s.replace(/[&<>]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' }[c]!))
  return `<!DOCTYPE html><html lang="ja"><head><meta charset="UTF-8"/><title>有給休暇申請書</title>
<style>
  @page{size:A4;margin:16mm;}
  *{box-sizing:border-box;margin:0;padding:0;font-family:'Yu Mincho','Hiragino Mincho ProN',serif;}
  body{color:#111;font-size:13px;}
  .stamps{display:flex;justify-content:flex-end;gap:0;margin-bottom:10mm;}
  .stamp{width:22mm;height:22mm;border:1px solid #333;display:flex;flex-direction:column;}
  .stamp .t{font-size:10px;text-align:center;border-bottom:1px solid #333;padding:2px 0;}
  .stamp .b{flex:1;}
  h1{text-align:center;font-size:24px;letter-spacing:.5em;margin:4mm 0 8mm;font-weight:700;}
  table{width:100%;border-collapse:collapse;}
  td,th{border:1px solid #333;padding:6px 8px;vertical-align:middle;}
  .lbl{background:#f2f2f2;width:26mm;text-align:center;font-weight:600;white-space:pre-line;}
  .note{margin-top:6mm;font-size:11px;}
  .honbu{float:right;margin-top:-30mm;width:26mm;height:26mm;border:1px solid #333;display:flex;flex-direction:column;}
  .honbu .t{font-size:10px;text-align:center;border-bottom:1px solid #333;padding:2px;}
  .r{display:inline-block;min-width:1.6em;text-align:center;border-bottom:1px solid #333;padding:0 4px;}
</style></head><body onload="window.print()">
  <div class="stamps">
    <div class="stamp"><div class="t">部　長</div><div class="b"></div></div>
    <div class="stamp"><div class="t">次　長</div><div class="b"></div></div>
    <div class="stamp"><div class="t">課　長</div><div class="b"></div></div>
  </div>
  <h1>有給休暇申請書</h1>
  <table>
    <tr>
      <td class="lbl">届出年月日</td>
      <td>令和 <span class="r">${reiwa(fd.y)}</span> 年 <span class="r">${fd.m}</span> 月 <span class="r">${fd.d}</span> 日</td>
      <td class="lbl">所　属</td>
      <td>${esc(f.dept)}<br/>${esc(f.site)}</td>
    </tr>
    <tr>
      <td class="lbl">SE\nスタッフNo</td>
      <td>${esc(f.staffNo)}</td>
      <td class="lbl">氏　名</td>
      <td>${esc(f.name)}</td>
    </tr>
    <tr><td colspan="4" style="border:none;padding-top:6mm;">下記の通り申請いたします。</td></tr>
    <tr>
      <td class="lbl">日　時</td>
      <td colspan="3">令和 <span class="r">${reiwa(from.y)}</span> 年 <span class="r">${from.m}</span> 月 <span class="r">${from.d}</span> 日 ～ <span class="r">${to.m}</span> 月 <span class="r">${to.d}</span> 日</td>
    </tr>
    <tr><td class="lbl">時　間</td><td colspan="3">${esc(f.startTime ?? '09:00')} ～</td></tr>
    <tr><td class="lbl">日　数</td><td colspan="3"><span class="r">${f.days}</span> 日</td></tr>
    <tr><td class="lbl">理　由</td><td colspan="3">私用の為、${esc(f.reason)}</td></tr>
  </table>
  <div class="honbu"><div class="t">管理本部\n本部長</div><div class="b" style="flex:1;"></div></div>
  <p class="note">※上記届は、原則として前日迄に提出</p>
</body></html>`
}

/** 別ウィンドウで様式を開き、印刷(PDF保存)ダイアログを出す。 */
export function printLeaveForm(f: LeaveForm): boolean {
  const html = buildLeaveFormHtml(f)
  const w = window.open('', '_blank', 'width=900,height=1000')
  if (w === null) return false
  w.document.open()
  w.document.write(html)
  w.document.close()
  return true
}
