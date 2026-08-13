import { useMemo, useState } from 'react'
import { Dashboard } from './features/dashboard/Dashboard.js'
import { QuickDailyReport } from './features/report/QuickDailyReport.js'
import { StructuredReport } from './features/report/StructuredReport.js'
import { MonthlyReport } from './features/month/MonthlyReport.js'
import { ReportList } from './features/report/ReportList.js'
import { RiskRanking } from './features/risk/RiskRanking.js'
import { ShiftGrid } from './features/shift/ShiftGrid.js'
import { DailyAssignment } from './features/shift/DailyAssignment.js'
import { ConstraintEditor } from './features/shift/ConstraintEditor.js'
import { AiOptimizer } from './features/shift/AiOptimizer.js'
import { LaborAlerts } from './features/shift/LaborAlerts.js'
import { Notifications } from './features/notify/Notifications.js'
import { Education } from './features/training/Education.js'
import { TemplateSettings } from './features/template/TemplateSettings.js'
import { OutputCenter } from './features/output/OutputCenter.js'
import { demoConstraints } from './features/shift/demoShift.js'
import { capabilitiesForRole, type Capability, type ConstraintDef } from '@mamorai/input-core'
import type { Session } from './features/auth/authTypes.js'

// MAMOR-AI デスクトップ MVP のシェル。
// WebView2 前提の PC 専用アプリ（Tauri v2 で dist/ をラップして配布）。
// 各画面の集計・ワークフロー・リスク・シフト最適化は @mamorai/input-core に委譲（層分離厳守）。

type Tab =
  | 'dashboard'
  | 'sreport'
  | 'report'
  | 'output'
  | 'month'
  | 'list'
  | 'risk'
  | 'shift'
  | 'assign'
  | 'constraint'
  | 'ai'
  | 'labor'
  | 'notify'
  | 'education'
  | 'template'

// 各タブは capability に紐づく。ログインロールが持つ capability のタブだけ表示する。
const TABS: { key: Tab; label: string; cap: Capability }[] = [
  { key: 'dashboard', label: 'ダッシュボード', cap: 'dashboard' },
  { key: 'sreport', label: '日報入力', cap: 'daily_report' },
  { key: 'report', label: '日報入力(簡易)', cap: 'daily_report' },
  { key: 'output', label: '出力センター', cap: 'output' },
  { key: 'month', label: '月報', cap: 'monthly' },
  { key: 'list', label: '日報一覧', cap: 'report_list' },
  { key: 'risk', label: 'リスク', cap: 'risk' },
  { key: 'shift', label: 'シフト', cap: 'shift' },
  { key: 'assign', label: '配置表', cap: 'assignment' },
  { key: 'constraint', label: '制約', cap: 'constraint' },
  { key: 'ai', label: 'AIシフト', cap: 'ai_shift' },
  { key: 'labor', label: '労務', cap: 'ai_shift' },
  { key: 'notify', label: '通知', cap: 'notify' },
  { key: 'education', label: '教育', cap: 'education' },
  { key: 'template', label: 'テンプレ設定', cap: 'template' },
]

export function App({ session, onLogout }: { session?: Session; onLogout?: () => void } = {}): JSX.Element {
  // ロール未指定（直接起動）は本社管理者相当で全機能表示（開発時の後方互換）。
  const role = session?.role ?? 'company_admin'
  const caps = useMemo(() => new Set(capabilitiesForRole(role)), [role])
  const tabs = useMemo(() => TABS.filter((t) => caps.has(t.cap)), [caps])

  const [tab, setTab] = useState<Tab>(() => tabs[0]?.key ?? 'sreport')
  // 制約は「制約」タブと「AIシフト」タブで共有する（NL構造化→エディタ反映を体現）。
  const [constraints, setConstraints] = useState<ConstraintDef[]>(() => demoConstraints())

  const roleLabel: Record<string, string> = {
    site_operator: '施設（現場）', company_manager: '会社（権限者）',
    company_admin: '会社（本社管理者）', platform_admin: '運営（TRYANGROW）',
  }
  const allow = (t: Tab): boolean => tabs.some((x) => x.key === t)

  return (
    <div className="app-shell">
      <nav className="app-nav" aria-label="サイドナビ">
        <img src="/logo-full.png" alt="MAMOR-AI" className="app-logo-img" />
        {session && (
          <div className="nav-session">
            <span className="nav-role">{roleLabel[role] ?? role}</span>
            {session.siteCode && <span className="nav-scope">現場 {session.siteCode}</span>}
            {session.email && <span className="nav-scope">{session.email}</span>}
            {onLogout && <button type="button" className="nav-logout" onClick={onLogout}>ログアウト</button>}
          </div>
        )}
        {tabs.map((t) => (
          <button
            key={t.key}
            type="button"
            className={`nav-item${tab === t.key ? ' active' : ''}`}
            aria-current={tab === t.key ? 'page' : undefined}
            onClick={() => setTab(t.key)}
          >
            {t.label}
          </button>
        ))}
        <span className="nav-note">MAMOR-AI / ロール別表示（{tabs.length}機能） / 集計・出力は @mamorai/input-core</span>
      </nav>
      <main className="app-main" id="main">
        {tab === 'dashboard' && allow('dashboard') && <Dashboard onNavigate={setTab} />}
        {tab === 'sreport' && allow('sreport') && <StructuredReport />}
        {tab === 'report' && allow('report') && <QuickDailyReport />}
        {tab === 'output' && allow('output') && <OutputCenter />}
        {tab === 'month' && allow('month') && <MonthlyReport />}
        {tab === 'list' && allow('list') && <ReportList />}
        {tab === 'risk' && allow('risk') && <RiskRanking />}
        {tab === 'shift' && allow('shift') && <ShiftGrid />}
        {tab === 'assign' && allow('assign') && <DailyAssignment />}
        {tab === 'constraint' && allow('constraint') && <ConstraintEditor constraints={constraints} onChange={setConstraints} />}
        {tab === 'ai' && allow('ai') && <AiOptimizer constraints={constraints} onChange={setConstraints} />}
        {tab === 'labor' && allow('labor') && <LaborAlerts constraints={constraints} />}
        {tab === 'notify' && allow('notify') && <Notifications />}
        {tab === 'education' && allow('education') && <Education />}
        {tab === 'template' && allow('template') && <TemplateSettings />}
      </main>
    </div>
  )
}
