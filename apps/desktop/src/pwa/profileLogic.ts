// [勤務員アプリ・設定] 入力の整え方と画像の縮小サイズ（純粋関数）。期限の判定は input-core の classifyQualification を使う。
import { classifyQualification, type QualificationStatus } from '@mamorai/input-core'

export const CREDENTIAL_KINDS = [
  { key: 'kentei', label: '警備員検定' },
  { key: 'shido', label: '指導教育責任者' },
  { key: 'shinnin', label: '新任教育' },
  { key: 'genin', label: '現任教育' },
  { key: 'kenshin', label: '健康診断' },
  { key: 'other', label: 'その他' },
] as const
export type CredentialKind = (typeof CREDENTIAL_KINDS)[number]['key']
export const kindLabel = (k: string): string => CREDENTIAL_KINDS.find((x) => x.key === k)?.label ?? 'その他'

/** 電話番号: ハイフン・空白を除く。空なら null。形式が正しくなければ null と理由。 */
export function normalizePhone(raw: string): { value: string | null; error?: string } {
  const v = raw.replace(/[-\s]/g, '')
  if (v === '') return { value: null }
  if (!/^(\+[1-9][0-9]{7,14}|0[0-9]{9,10})$/.test(v)) return { value: null, error: '電話番号の形式が正しくありません（例: 09012345678）' }
  return { value: v }
}

export function normalizePostal(raw: string): { value: string | null; error?: string } {
  const v = raw.replace(/[-\s]/g, '')
  if (v === '') return { value: null }
  if (!/^[0-9]{7}$/.test(v)) return { value: null, error: '郵便番号は7桁の数字です（例: 100-0001）' }
  return { value: `${v.slice(0, 3)}-${v.slice(3)}` }
}

/** 有効期限の状態（期限なしは null）。30日以内を「更新間近」とする。 */
export function expiryStatus(expiresOn: string | null, today: string): QualificationStatus | null {
  if (!expiresOn) return null
  return classifyQualification(expiresOn, today, 30)
}

/** 長辺が max を超えるときだけ縮小したサイズ（拡大はしない）。 */
export function fitSize(w: number, h: number, max: number): { w: number; h: number } {
  const longest = Math.max(w, h)
  if (longest <= max) return { w, h }
  const k = max / longest
  return { w: Math.max(1, Math.round(w * k)), h: Math.max(1, Math.round(h * k)) }
}

/** PIN変更の入力チェック（4〜8桁の数字・確認が一致・現在と同じでない）。問題なければ null。 */
export function checkNewPin(oldPin: string, p1: string, p2: string): string | null {
  if (!/^\d{4,8}$/.test(p1)) return '新しいPINは4〜8桁の数字です'
  if (p1 !== p2) return '確認用のPINが一致しません'
  if (p1 === oldPin) return '現在と同じPINには変更できません'
  return null
}

// ── 申請（承認が要る項目）と、承認なしで保存できる項目 ──
export type RequestCategory = 'name' | 'address' | 'honseki' | 'face' | 'id_doc' | 'credential'
export type RequestStatus = 'pending' | 'approved' | 'rejected' | 'withdrawn'
export const CATEGORY_LABEL: Record<RequestCategory, string> = {
  name: '氏名', address: '現住所', honseki: '本籍', face: '顔写真', id_doc: '本人確認資料', credential: '資格・教育・健診',
}
export const STATUS_LABEL: Record<RequestStatus, string> = {
  pending: '承認待ち', approved: '承認済み', rejected: '差し戻し', withdrawn: '取り下げ',
}
export const DOC_TYPES = [
  { key: 'license', label: '運転免許証' },
  { key: 'passport', label: 'パスポート' },
  { key: 'health_insurance', label: '健康保険証' },
  { key: 'other', label: 'その他' },
] as const
export type DocType = (typeof DOC_TYPES)[number]['key']
export const docLabel = (k: string): string => DOC_TYPES.find((d) => d.key === k)?.label ?? k

export const PREFECTURES = [
  '北海道', '青森県', '岩手県', '宮城県', '秋田県', '山形県', '福島県', '茨城県', '栃木県', '群馬県', '埼玉県', '千葉県', '東京都', '神奈川県',
  '新潟県', '富山県', '石川県', '福井県', '山梨県', '長野県', '岐阜県', '静岡県', '愛知県', '三重県', '滋賀県', '京都府', '大阪府', '兵庫県',
  '奈良県', '和歌山県', '鳥取県', '島根県', '岡山県', '広島県', '山口県', '徳島県', '香川県', '愛媛県', '高知県', '福岡県', '佐賀県', '長崎県',
  '熊本県', '大分県', '宮崎県', '鹿児島県', '沖縄県',
] as const

export function normalizeEmail(raw: string): { value: string | null; error?: string } {
  const v = raw.trim()
  if (v === '') return { value: null }
  if (v.length > 100 || !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(v)) return { value: null, error: 'メールアドレスの形式が正しくありません' }
  return { value: v }
}

export interface EducationItem { school: string; entered_year: number | null; graduated_year: number | null }
export interface WorkItem { company: string; detail: string | null; from: string | null; to: string | null }

/** 学歴の入力チェック（画面側の早期チェック。最終的な検査はDB）。問題なければ null。 */
export function checkEducation(list: { school: string; entered: string; graduated: string }[]): string | null {
  if (list.length > 10) return '学歴は10件までです'
  for (const e of list) {
    if (e.school.trim() === '') return '学校名を入力してください'
    for (const y of [e.entered, e.graduated]) if (y.trim() !== '' && !/^(19|20)\d{2}$/.test(y.trim())) return '入学年・卒業年は西暦4桁で入力してください'
  }
  return null
}
export function checkWork(list: { company: string; from: string; to: string }[]): string | null {
  if (list.length > 20) return '業務経歴は20件までです'
  for (const w of list) {
    if (w.company.trim() === '') return '勤務先・業種を入力してください'
    for (const m of [w.from, w.to]) if (m.trim() !== '' && !/^\d{4}-(0[1-9]|1[0-2])$/.test(m.trim())) return '期間は「2020-04」の形式で入力してください'
  }
  return null
}

/** 申請の内容を1行にする（承認待ちの表示・承認画面で使う。写真そのものは含まない）。 */
export function summarizeRequest(category: RequestCategory, p: Record<string, unknown>): string {
  const s = (k: string): string => (typeof p[k] === 'string' ? (p[k] as string) : '')
  switch (category) {
    case 'name': return [s('name'), s('furigana') && `（${s('furigana')}）`].filter(Boolean).join('')
    case 'address': return [s('postal_code'), s('address'), s('nearest_station') && `最寄駅 ${s('nearest_station')}`].filter(Boolean).join(' ')
    case 'honseki': return s('pref')
    case 'face': return '顔写真を変更'
    case 'id_doc': return `${docLabel(s('doc_type'))}の写真`
    case 'credential':
      return p['action'] === 'delete' ? '記録を削除' : [kindLabel(s('kind')), s('label'), s('expires_on') && `期限 ${s('expires_on')}`].filter(Boolean).join(' ')
  }
}
