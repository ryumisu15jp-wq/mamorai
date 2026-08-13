import { describe, it, expect } from 'vitest'
import { capabilitiesForRole, canAccess } from '../index.js'

describe('[Auth] コンソール別 capability', () => {
  it('現場(site)は運用系＋有給申請/講習会参加が可能・運営系は不可', () => {
    const c = capabilitiesForRole('site_operator')
    for (const x of ['daily_report', 'monthly', 'shift', 'assignment', 'labor', 'notify', 'education', 'leave_request', 'training_apply', 'output'] as const) {
      expect(c).toContain(x)
    }
    expect(c).not.toContain('company_management')
    expect(c).not.toContain('contract_status')
    expect(c).not.toContain('platform_admin')
    expect(c).not.toContain('leave_approval') // 承認は会社側
  })

  it('会社(company)は管理/設定/確認系のみ・日報入力やシフト作成は持たない', () => {
    const c = capabilitiesForRole('company_admin')
    for (const x of ['constraint', 'template', 'notify', 'leave_approval', 'education', 'training_manage'] as const) {
      expect(c).toContain(x)
    }
    expect(c).not.toContain('daily_report')
    expect(c).not.toContain('shift')
    expect(c).not.toContain('platform_admin')
    expect(capabilitiesForRole('company_manager')).toEqual(capabilitiesForRole('company_admin'))
  })

  it('運営(platform)は会社管理・契約・アプリ管理のみ・現場運用は不可', () => {
    const c = capabilitiesForRole('platform_admin')
    for (const x of ['company_management', 'contract_status', 'platform_admin'] as const) {
      expect(c).toContain(x)
    }
    for (const x of ['daily_report', 'shift', 'assignment', 'labor', 'output'] as const) {
      expect(c).not.toContain(x)
    }
  })
})

describe('[Auth] canAccess', () => {
  it('現場はAIシフト可・有給承認は不可', () => {
    expect(canAccess('site_operator', 'ai_shift')).toBe(true)
    expect(canAccess('site_operator', 'leave_approval')).toBe(false)
  })
  it('会社は講習会管理可・日報入力は不可', () => {
    expect(canAccess('company_admin', 'training_manage')).toBe(true)
    expect(canAccess('company_admin', 'daily_report')).toBe(false)
  })
  it('運営は会社管理可・シフト不可', () => {
    expect(canAccess('platform_admin', 'company_management')).toBe(true)
    expect(canAccess('platform_admin', 'shift')).toBe(false)
  })
})
