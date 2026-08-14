// [共有ストア] 講習会・研修の申込を 勤務員PWA(/app) と 現場(/s)・会社(/co) で共有する。
// 有給と同様、同一オリジンの localStorage を実データ源とする（次段で Supabase 実DB結線）。
import type { Approver } from './leaveStore.js'

export type TrainingKind = '新任教育' | '現任教育' | '一般'
export interface Seminar {
  id: string; title: string; kind: TrainingKind; date: string; place: string; capacity: number
}
// 会社(本社)が登録する講習会カタログ（現場・勤務員はこれに申込む）。本結線時はDB。
export const SEMINARS: Seminar[] = [
  { id: 't1', title: '新任教育（法定20時間）', kind: '新任教育', date: '2026-09-03', place: '本社研修室', capacity: 20 },
  { id: 't2', title: '現任教育（法定10時間）', kind: '現任教育', date: '2026-09-10', place: 'オンライン', capacity: 50 },
  { id: 't3', title: '上級救命講習', kind: '一般', date: '2026-09-18', place: '立川消防署', capacity: 15 },
]
export function seminarById(id: string): Seminar | undefined { return SEMINARS.find((s) => s.id === id) }

export type TrainingStatus = '申請中' | '現場承認' | '会社受理' | '却下'
export interface TrainingApp {
  id: string
  staffNo: string; name: string; dob: string; dept: string; site: string
  seminarId: string; seminarTitle: string; kind: TrainingKind
  status: TrainingStatus
  submittedAt: string
  siteApprover?: Approver
  rejectedBy?: string
}

const KEY = 'mamorai.training.v1'
type Listener = () => void
const listeners = new Set<Listener>()

function read(): TrainingApp[] {
  try { const raw = globalThis.localStorage?.getItem(KEY); if (raw) return JSON.parse(raw) as TrainingApp[] } catch { /* ignore */ }
  const seed: TrainingApp[] = [
    { id: 'tr-seed-1', staffNo: '791', name: '大野 修一', dob: '1978-12-20', dept: 'ビルサービス部セキュリティ２グループ', site: 'ブルガリホテル東京', seminarId: 't2', seminarTitle: '現任教育（法定10時間）', kind: '現任教育', status: '申請中', submittedAt: '2026-09-01' },
  ]
  try { globalThis.localStorage?.setItem(KEY, JSON.stringify(seed)) } catch { /* ignore */ }
  return seed
}
function write(rows: TrainingApp[]): void {
  try { globalThis.localStorage?.setItem(KEY, JSON.stringify(rows)) } catch { /* ignore */ }
  listeners.forEach((l) => l())
}

export function listTraining(): TrainingApp[] {
  return read().slice().sort((a, b) => (a.submittedAt < b.submittedAt ? 1 : -1))
}
export function listTrainingForStaff(no: string): TrainingApp[] {
  return listTraining().filter((r) => r.staffNo === no.trim())
}
export function submitTraining(input: Omit<TrainingApp, 'id' | 'status' | 'submittedAt'>): TrainingApp {
  const rows = read()
  const app: TrainingApp = { ...input, id: `tr-${Date.now()}-${rows.length}`, status: '申請中', submittedAt: '2026-09-15' }
  write([app, ...rows]); return app
}
export function approveSiteTraining(id: string, approver: Approver): void {
  write(read().map((r) => (r.id === id ? { ...r, status: '現場承認', siteApprover: approver } : r)))
}
export function acceptCompanyTraining(id: string): void {
  write(read().map((r) => (r.id === id ? { ...r, status: '会社受理' } : r)))
}
export function rejectTraining(id: string, by: string): void {
  write(read().map((r) => (r.id === id ? { ...r, status: '却下', rejectedBy: by } : r)))
}
export function subscribe(l: Listener): () => void {
  listeners.add(l)
  const onStorage = (e: StorageEvent): void => { if (e.key === KEY) l() }
  try { globalThis.addEventListener?.('storage', onStorage) } catch { /* ignore */ }
  return () => { listeners.delete(l); try { globalThis.removeEventListener?.('storage', onStorage) } catch { /* ignore */ } }
}
