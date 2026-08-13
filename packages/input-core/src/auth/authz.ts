// [Auth] ロール別アクセス制御（純粋・UI/DB非依存）。
// 3系統ログイン(/co/ /s/ /tradmin/)のロールに応じて、利用できる機能(capability)を決める。
// UIのタブ出し分け・APIゲートウェイの認可の双方が、この単一の真実に依拠する。

export type AuthRole =
  | 'site_operator'   // 施設(現場) 共有端末オペレーター
  | 'company_manager' // 会社 権限者
  | 'company_admin'   // 会社 本社管理者
  | 'platform_admin'  // 運営(TRYANGROW)

/** 機能カテゴリ（タブ/APIの認可単位） */
export type Capability =
  | 'dashboard'
  | 'daily_report'   // 日報入力
  | 'output'         // 成果物出力(配置予定表/配置表/月次報告書)
  | 'monthly'        // 月報
  | 'report_list'    // 日報一覧
  | 'risk'           // リスク
  | 'shift'          // シフト
  | 'assignment'     // 配置表
  | 'ai_shift'       // AIシフト最適化
  | 'notify'         // 通知
  | 'education'      // 教育・資格
  | 'constraint'     // 制約エディタ
  | 'template'       // テンプレ設定
  | 'platform_admin' // 運営コンソール

// 段階的包含で権限を積み上げる（operator ⊂ manager ⊂ admin ⊂ platform）。
const OPERATOR: Capability[] = ['dashboard', 'daily_report', 'output']
const MANAGER_ADD: Capability[] = [
  'monthly', 'report_list', 'risk', 'shift', 'assignment', 'ai_shift', 'notify', 'education',
]
const ADMIN_ADD: Capability[] = ['constraint', 'template']
const PLATFORM_ADD: Capability[] = ['platform_admin']

/** ロールが利用できる capability の一覧（段階的包含）。 */
export function capabilitiesForRole(role: AuthRole): Capability[] {
  const caps: Capability[] = [...OPERATOR]
  if (role === 'company_manager' || role === 'company_admin' || role === 'platform_admin') {
    caps.push(...MANAGER_ADD)
  }
  if (role === 'company_admin' || role === 'platform_admin') {
    caps.push(...ADMIN_ADD)
  }
  if (role === 'platform_admin') {
    caps.push(...PLATFORM_ADD)
  }
  return caps
}

/** ロールが特定 capability にアクセスできるか。 */
export function canAccess(role: AuthRole, cap: Capability): boolean {
  return capabilitiesForRole(role).includes(cap)
}
