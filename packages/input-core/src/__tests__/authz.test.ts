import { describe, it, expect } from 'vitest'
import { capabilitiesForRole, canAccess, type Capability } from '../index.js'

describe('[Auth] capabilitiesForRole', () => {
  it('現場オペレーターは日報入力・出力・ダッシュボードのみ', () => {
    const caps = capabilitiesForRole('site_operator')
    expect(caps).toContain('daily_report')
    expect(caps).toContain('output')
    expect(caps).toContain('dashboard')
    // 管理系は不可
    expect(caps).not.toContain('template')
    expect(caps).not.toContain('constraint')
    expect(caps).not.toContain('platform_admin')
    expect(caps).not.toContain('ai_shift')
  })
  it('権限者(manager)は運用系フル、ただしテンプレ/制約/運営は不可', () => {
    const caps = capabilitiesForRole('company_manager')
    expect(caps).toContain('ai_shift')
    expect(caps).toContain('notify')
    expect(caps).toContain('output')
    expect(caps).not.toContain('template')
    expect(caps).not.toContain('constraint')
    expect(caps).not.toContain('platform_admin')
  })
  it('本社管理者(admin)はテンプレ/制約も可、運営は不可', () => {
    const caps = capabilitiesForRole('company_admin')
    expect(caps).toContain('template')
    expect(caps).toContain('constraint')
    expect(caps).not.toContain('platform_admin')
  })
  it('運営(platform_admin)は運営コンソール含め全部', () => {
    const caps = capabilitiesForRole('platform_admin')
    expect(caps).toContain('platform_admin')
    expect(caps).toContain('template')
    expect(caps).toContain('daily_report')
  })
  it('段階的包含: operator ⊂ manager ⊂ admin ⊂ platform', () => {
    const o = new Set(capabilitiesForRole('site_operator'))
    const m = new Set(capabilitiesForRole('company_manager'))
    const a = new Set(capabilitiesForRole('company_admin'))
    const p = new Set(capabilitiesForRole('platform_admin'))
    for (const c of o) expect(m.has(c)).toBe(true)
    for (const c of m) expect(a.has(c)).toBe(true)
    for (const c of a) expect(p.has(c)).toBe(true)
  })
})

describe('[Auth] canAccess', () => {
  it('現場オペレーターはAIシフトにアクセス不可', () => {
    expect(canAccess('site_operator', 'ai_shift')).toBe(false)
    expect(canAccess('site_operator', 'daily_report')).toBe(true)
  })
  it('運営は任意のcapに到達', () => {
    const caps: Capability[] = ['daily_report', 'template', 'platform_admin', 'ai_shift']
    for (const c of caps) expect(canAccess('platform_admin', c)).toBe(true)
  })
})
