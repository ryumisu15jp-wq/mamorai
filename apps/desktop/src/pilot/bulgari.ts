// [本番パイロット] ブルガリホテル東京 運用の実データ土台。
//   会社: ヒトトヒト株式会社 / 現場: ブルガリホテル東京 / 部署: ビルサービス部セキュリティ２グループ
// アプリ内の各画面（勤務員登録・有給・講習会・シフト・配置）はこの実データを参照する。
// ※ Supabase実DBへの永続化は次段。本モジュールが「単一の実データソース」。

export interface PilotCompany { name: string; code: string }
export interface PilotSite { name: string; code: string; company: string; dept: string }

export const COMPANY: PilotCompany = { name: 'ヒトトヒト株式会社', code: 'HTH-0001' }
export const SITE: PilotSite = {
  name: 'ブルガリホテル東京',
  code: 'BVL-01',
  company: 'ヒトトヒト株式会社',
  dept: 'ビルサービス部セキュリティ２グループ',
}

export interface PilotStaff {
  no: string          // SEスタッフNo
  name: string        // 氏名
  dob: string         // 生年月日 YYYY-MM-DD
  dept: string        // 所属
  site: string        // 所属現場
  role: '現場責任者' | '副責任者' | '隊員'
  active: boolean
  pin?: string           // 現在PIN（初期は生年月日 MMDD）。現場が復旧用に参照可。
  pinMustChange?: boolean // 初回ログイン時に変更を強制
}

/** 生年月日(YYYY-MM-DD)から初期PIN(MMDD)を生成。 */
export function pinFromDob(dob: string): string {
  const [, m, d] = dob.split('-')
  return (m && d) ? `${m}${d}` : '0000'
}

// ブルガリホテル東京 セキュリティ２グループ 勤務員マスタ（実運用の初期登録）。
export const STAFF: PilotStaff[] = [
  { no: '783', name: '三角 龍彦', dob: '1985-04-12', dept: SITE.dept, site: SITE.name, role: '現場責任者', active: true },
  { no: '784', name: '藤井 隆幸', dob: '1990-09-03', dept: SITE.dept, site: SITE.name, role: '副責任者', active: true },
  { no: '791', name: '大野 修一', dob: '1978-12-20', dept: SITE.dept, site: SITE.name, role: '隊員', active: true },
  { no: '802', name: '中村 涼', dob: '1995-06-08', dept: SITE.dept, site: SITE.name, role: '隊員', active: true },
  { no: '815', name: '小林 大地', dob: '1988-02-27', dept: SITE.dept, site: SITE.name, role: '隊員', active: true },
  { no: '826', name: '渡辺 亮', dob: '1992-11-15', dept: SITE.dept, site: SITE.name, role: '隊員', active: true },
]

// 会社（本社）承認者。会社コンソールでの最終承認に用いる担当者。
export interface PilotCompanyStaff { name: string; title: string }
export const COMPANY_APPROVERS: PilotCompanyStaff[] = [
  { name: '山田 誠', title: '課長' },
  { name: '佐々木 健一', title: '部長' },
  { name: '田原 睦子', title: '管理本部本部長' },
]

export function staffByNo(no: string): PilotStaff | undefined {
  return STAFF.find((s) => s.no === no.trim())
}
export function siteManager(): PilotStaff {
  return STAFF.find((s) => s.role === '現場責任者') ?? STAFF[0]!
}
