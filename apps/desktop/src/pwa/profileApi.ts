// [勤務員アプリ・設定] 個人情報のデータ層。Supabase 構成時は 0414〜0417 の RPC（端末シークレットで本人だけ）、未構成時はメモリ上のデモ。
//   ・承認が要る項目（氏名・現住所・本籍・顔写真・本人確認資料・資格）: submitRequest で申請 → 本社PC・管理者が承認して初めて反映
//   ・承認が要らない項目（電話・メール・緊急連絡先・学歴・業務経歴）: すぐに反映
import { isSupabaseConfigured } from '../lib/supabaseClient.js'
import { workerRpc } from '../shared/secureRpc.js'
import {
  normalizeEmail, normalizePhone, type CredentialKind, type DocType, type EducationItem, type RequestCategory, type RequestStatus, type WorkItem,
} from './profileLogic.js'

export interface Credential { id: string; kind: CredentialKind; label: string | null; obtained_on: string | null; expires_on: string | null; has_image: boolean }
export interface ProfileRequest {
  id: string; category: RequestCategory; status: RequestStatus; note: string | null
  submitted_at: string; decided_at: string | null; payload: Record<string, unknown>; has_image: boolean
}
export interface Profile {
  staff_no: string; name: string; dob: string | null
  phone: string | null; furigana: string | null; postal_code: string | null; address: string | null
  nearest_station: string | null; email: string | null; honseki_pref: string | null
  emergency: { name: string | null; relation: string | null; phone: string | null }
  education: EducationItem[]; work_history: WorkItem[]
  has_face: boolean; id_docs: DocType[]; credentials: Credential[]; requests: ProfileRequest[]
}
export interface ContactInput { phone: string; email: string; emergencyName: string; emergencyRelation: string; emergencyPhone: string }
export interface ImageData { mime: string; base64: string }

// ── デモ（DB未接続）。申請は「承認待ち」のまま残る（承認は本社PCの画面でしかできない）──
const demo: { profile: Profile; images: Map<string, ImageData> } = {
  profile: {
    staff_no: 'demo', name: 'デモ 太郎', dob: null, phone: null, furigana: null, postal_code: null, address: null, nearest_station: null, email: null,
    honseki_pref: null, emergency: { name: null, relation: null, phone: null }, education: [], work_history: [], has_face: false, id_docs: [], credentials: [], requests: [],
  },
  images: new Map(),
}
const blank = (s: string): string | null => (s.trim() === '' ? null : s.trim())

export async function loadProfile(): Promise<Profile> {
  if (!isSupabaseConfigured()) return structuredClone(demo.profile)
  return await workerRpc<Profile>('worker_profile_get')
}

/** 電話・メール・緊急連絡先（承認なし）。 */
export async function saveContact(i: ContactInput): Promise<void> {
  const phone = normalizePhone(i.phone); if (phone.error) throw new Error(phone.error)
  const email = normalizeEmail(i.email); if (email.error) throw new Error(email.error)
  const ephone = normalizePhone(i.emergencyPhone); if (ephone.error) throw new Error(`緊急連絡先の${ephone.error}`)
  if (!isSupabaseConfigured()) {
    Object.assign(demo.profile, { phone: phone.value, email: email.value, emergency: { name: blank(i.emergencyName), relation: blank(i.emergencyRelation), phone: ephone.value } }); return
  }
  await workerRpc('worker_contact_save', {
    p_phone: phone.value, p_email: email.value, p_emergency_name: blank(i.emergencyName), p_emergency_relation: blank(i.emergencyRelation), p_emergency_phone: ephone.value,
  })
}

/** 学歴・業務経歴（承認なし）。 */
export async function saveCareer(education: EducationItem[], work: WorkItem[]): Promise<void> {
  if (!isSupabaseConfigured()) { demo.profile.education = education; demo.profile.work_history = work; return }
  await workerRpc('worker_career_save', { p_education: education, p_work_history: work })
}

/** 申請する（承認が要る項目）。写真が要る項目は image を付ける。返り値は申請ID。 */
export async function submitRequest(category: RequestCategory, payload: Record<string, unknown>, image?: ImageData): Promise<string> {
  if (!isSupabaseConfigured()) {
    const id = `demo-${Date.now()}`
    const same = (r: ProfileRequest): boolean => r.category === category && (category !== 'id_doc' || r.payload['doc_type'] === payload['doc_type'])
    if (category !== 'credential') demo.profile.requests = demo.profile.requests.filter((r) => !(same(r) && r.status === 'pending'))
    demo.profile.requests.unshift({ id, category, status: 'pending', note: null, submitted_at: new Date().toISOString(), decided_at: null, payload, has_image: image !== undefined })
    return id
  }
  return await workerRpc<string>('worker_request_submit', { p_category: category, p_payload: payload, p_image_base64: image?.base64 ?? null, p_mime: image?.mime ?? null })
}

export async function withdrawRequest(id: string): Promise<void> {
  if (!isSupabaseConfigured()) { demo.profile.requests = demo.profile.requests.filter((r) => r.id !== id); return }
  await workerRpc('worker_request_withdraw', { p_id: id })
}

/** 承認済みの写真（顔写真・証書）を読む。本人確認資料は本人の画面では表示しない。 */
export async function loadImage(kind: 'face' | 'credential', credentialId: string | null): Promise<ImageData | null> {
  if (!isSupabaseConfigured()) return demo.images.get(`${kind}:${credentialId ?? ''}`) ?? null
  return await workerRpc<ImageData | null>('worker_image_get', { p_kind: kind, p_credential_id: credentialId })
}

/** 撮影・選択した写真を、長辺 max px の JPEG に縮小して base64 にする（端末内で処理。元画像は送らない）。 */
export async function fileToJpeg(file: File, max = 1024): Promise<ImageData> {
  const { fitSize } = await import('./profileLogic.js')
  const bmp = await createImageBitmap(file)
  const { w, h } = fitSize(bmp.width, bmp.height, max)
  const canvas = document.createElement('canvas'); canvas.width = w; canvas.height = h
  const ctx = canvas.getContext('2d'); if (!ctx) throw new Error('画像を処理できませんでした')
  ctx.drawImage(bmp, 0, 0, w, h); bmp.close()
  const url = canvas.toDataURL('image/jpeg', 0.82)
  return { mime: 'image/jpeg', base64: url.slice(url.indexOf(',') + 1) }
}
