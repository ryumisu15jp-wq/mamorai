// [取込] 隊員(勤務員)情報を Excel(.xlsx/.xlsm) / CSV から一括取込する。
// ヘッダ行のラベルで列を特定（表記ゆれに寛容）。生年月日は各形式を YYYY-MM-DD に正規化。
import * as XLSX from 'xlsx'
import { SITE, type PilotStaff } from '../pilot/bulgari.js'

export interface StaffParseResult { rows: PilotStaff[]; warnings: string[] }

// ラベル→内部キーの対応（小文字化・記号除去して照合）。
const norm = (s: string): string => String(s).toLowerCase().replace(/[\s　_・（）()]/g, '')
const HEADER: Record<string, string[]> = {
  no: ['スタッフno', 'no', '社員番号', 'staffno', 'seスタッフno', '番号'],
  name: ['氏名', '名前', 'name', '氏名漢字'],
  dob: ['生年月日', 'dob', '誕生日', 'birthday', '生年月'],
  dept: ['部署', '所属', 'dept', '所属部署'],
  role: ['役割', 'role', '職位', '区分'],
  site: ['所属現場', '現場', 'site', '勤務地'],
}
function keyOf(label: string): string | null {
  const n = norm(label)
  for (const [key, aliases] of Object.entries(HEADER)) if (aliases.some((a) => norm(a) === n)) return key
  return null
}

// 役割の正規化。
function roleOf(v: unknown): PilotStaff['role'] {
  const s = String(v ?? '')
  if (s.includes('責任') && !s.includes('副')) return '現場責任者'
  if (s.includes('副')) return '副責任者'
  return '隊員'
}

// 生年月日の正規化（Date / Excelシリアル / 文字列 → YYYY-MM-DD）。
function dobOf(v: unknown): string {
  if (v == null || v === '') return ''
  if (v instanceof Date) return `${v.getFullYear()}-${String(v.getMonth() + 1).padStart(2, '0')}-${String(v.getDate()).padStart(2, '0')}`
  if (typeof v === 'number') {
    const ms = Date.UTC(1899, 11, 30) + v * 86400000
    const d = new Date(ms)
    return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}-${String(d.getUTCDate()).padStart(2, '0')}`
  }
  const s = String(v).trim().replace(/[./]/g, '-')
  const m = s.match(/^(\d{4})-(\d{1,2})-(\d{1,2})/)
  if (m) return `${m[1]}-${m[2]!.padStart(2, '0')}-${m[3]!.padStart(2, '0')}`
  return String(v).trim()
}

export function parseStaffFile(data: ArrayBuffer): StaffParseResult {
  const warnings: string[] = []
  const wb = XLSX.read(data, { type: 'array', cellDates: true })
  const ws = wb.Sheets[wb.SheetNames[0]!]
  if (!ws) throw new Error('シートが見つかりません')
  const grid = XLSX.utils.sheet_to_json<unknown[]>(ws, { header: 1, raw: false, defval: null })
  if (grid.length < 2) throw new Error('データ行がありません（1行目はヘッダ）')
  const header = (grid[0] ?? []) as unknown[]
  const col: Record<string, number> = {}
  header.forEach((h, i) => { if (h != null) { const k = keyOf(String(h)); if (k && col[k] == null) col[k] = i } })
  if (col['no'] == null || col['name'] == null) throw new Error('「スタッフNo」「氏名」の列が必要です')

  const rows: PilotStaff[] = []
  const seen = new Set<string>()
  for (let r = 1; r < grid.length; r++) {
    const row = (grid[r] ?? []) as unknown[]
    const no = String(row[col['no']!] ?? '').trim()
    const name = String(row[col['name']!] ?? '').trim()
    if (no === '' && name === '') continue
    if (no === '' || name === '') { warnings.push(`${r + 1}行目: スタッフNoまたは氏名が空のため除外`); continue }
    if (seen.has(no)) { warnings.push(`${r + 1}行目: スタッフNo ${no} が重複（後勝ち）`) }
    seen.add(no)
    rows.push({
      no, name,
      dob: col['dob'] != null ? dobOf(row[col['dob']!]) : '',
      dept: col['dept'] != null ? String(row[col['dept']!] ?? SITE.dept).trim() || SITE.dept : SITE.dept,
      site: col['site'] != null ? String(row[col['site']!] ?? SITE.name).trim() || SITE.name : SITE.name,
      role: col['role'] != null ? roleOf(row[col['role']!]) : '隊員',
      active: true,
    })
  }
  if (rows.length === 0) warnings.push('取り込める行がありませんでした')
  return { rows, warnings }
}

/** 取込テンプレートのCSV行（ヘッダ＋記入例）。 */
export function staffTemplateRows(): (string | number)[][] {
  return [
    ['スタッフNo', '氏名', '生年月日', '部署', '役割', '所属現場'],
    ['831', '山田 太郎', '1990-05-21', SITE.dept, '隊員', SITE.name],
    ['832', '佐藤 花子', '1988-11-03', SITE.dept, '副責任者', SITE.name],
  ]
}
