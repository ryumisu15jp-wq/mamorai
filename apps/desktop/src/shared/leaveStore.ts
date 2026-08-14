// [共有ストア] 有給申請を勤務員PWA(/app)と管理コンソール(/co,/s)で共有する。
// 同一オリジンのため localStorage を実データ源として使用（同一ブラウザ内で相互反映）。
// ※ 別端末間の反映・恒久化は Supabase 実DB結線（次段）で置換。関数I/Fは維持する。
import { COMPANY, SITE } from '../pilot/bulgari.js'

export type LeaveStatus = '申請中' | '現場承認' | '会社承認' | '却下'
export interface Approver { name: string; title: string; date: string }
export interface LeaveReq {
  id: string
  staffNo: string
  name: string
  company: string
  dept: string
  site: string
  from: string
  to: string
  days: number
  reason: string       // 「私用の為、」に続く理由
  status: LeaveStatus
  submittedAt: string
  siteApprover?: Approver
  companyApprover?: Approver
  rejectedBy?: string
}

const KEY = 'mamorai.leave.v1'
type Listener = () => void
const listeners = new Set<Listener>()

function read(): LeaveReq[] {
  try {
    const raw = globalThis.localStorage?.getItem(KEY)
    if (raw) return JSON.parse(raw) as LeaveReq[]
  } catch { /* ignore */ }
  return seed()
}
function write(rows: LeaveReq[]): void {
  try { globalThis.localStorage?.setItem(KEY, JSON.stringify(rows)) } catch { /* ignore */ }
  listeners.forEach((l) => l())
}

// 初期シード（空ストア時）。ブルガリ現場の申請例を1件用意し、画面が空にならないようにする。
function seed(): LeaveReq[] {
  const rows: LeaveReq[] = [
    {
      id: 'lv-seed-1', staffNo: '802', name: '中村 涼', company: COMPANY.name, dept: SITE.dept, site: SITE.name,
      from: '2026-09-12', to: '2026-09-13', days: 2, reason: '帰省の為', status: '申請中', submittedAt: '2026-09-01',
    },
  ]
  try { globalThis.localStorage?.setItem(KEY, JSON.stringify(rows)) } catch { /* ignore */ }
  return rows
}

export function listLeave(): LeaveReq[] {
  return read().slice().sort((a, b) => (a.submittedAt < b.submittedAt ? 1 : -1))
}
export function listLeaveForStaff(staffNo: string): LeaveReq[] {
  return listLeave().filter((r) => r.staffNo === staffNo.trim())
}

/** 勤務員PWAから申請を提出。 */
export function submitLeave(input: Omit<LeaveReq, 'id' | 'status' | 'submittedAt'>): LeaveReq {
  const rows = read()
  const req: LeaveReq = { ...input, id: `lv-${Date.now()}-${rows.length}`, status: '申請中', submittedAt: input.from }
  write([req, ...rows])
  return req
}

/** 現場一次承認（ログイン担当者の氏名で印・署名を後段生成）。 */
export function approveSite(id: string, approver: Approver): void {
  write(read().map((r) => (r.id === id ? { ...r, status: '現場承認', siteApprover: approver } : r)))
}
/** 会社最終承認。 */
export function approveCompany(id: string, approver: Approver): void {
  write(read().map((r) => (r.id === id ? { ...r, status: '会社承認', companyApprover: approver } : r)))
}
/** 却下（現場・会社いずれからでも）。 */
export function rejectLeave(id: string, by: string): void {
  write(read().map((r) => (r.id === id ? { ...r, status: '却下', rejectedBy: by } : r)))
}

export function subscribe(l: Listener): () => void {
  listeners.add(l)
  // 別タブ/別画面(PWA↔コンソール)からの更新も反映。
  const onStorage = (e: StorageEvent): void => { if (e.key === KEY) l() }
  try { globalThis.addEventListener?.('storage', onStorage) } catch { /* ignore */ }
  return () => { listeners.delete(l); try { globalThis.removeEventListener?.('storage', onStorage) } catch { /* ignore */ } }
}
