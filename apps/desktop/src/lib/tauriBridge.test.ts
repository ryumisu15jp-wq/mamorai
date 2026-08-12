// [REQ-025] Tauri 抽象層の振る舞い検証。
// DI で「注入 Tauri API のモック」を渡し、saveFile/print/checkUpdate が
// 対応コマンド(save_file/print/check_update)を正しい引数で呼ぶこと、
// および API 不在時に安全に no-op / フォールバックすることを検証する。
import { describe, it, expect, vi } from 'vitest'
import { createTauriBridge, type TauriCoreApi } from './tauriBridge.js'

/** invoke をスパイした最小モック API を生成する。 */
function mockApi(handler: (cmd: string, args?: Record<string, unknown>) => unknown): TauriCoreApi {
  return { invoke: vi.fn(async (cmd: string, args?: Record<string, unknown>) => handler(cmd, args)) as TauriCoreApi['invoke'] }
}

describe('[REQ-025] createTauriBridge — 注入APIへの委譲', () => {
  it('saveFile は save_file コマンドを正しい引数で呼び、結果を返す', async () => {
    const api = mockApi(() => '/home/user/report.pdf')
    const bridge = createTauriBridge(api)

    const result = await bridge.saveFile({
      fileName: 'monthly.pdf',
      contents: 'PDF-BYTES',
      mime: 'application/pdf',
    })

    expect(api.invoke).toHaveBeenCalledTimes(1)
    expect(api.invoke).toHaveBeenCalledWith('save_file', {
      fileName: 'monthly.pdf',
      contents: 'PDF-BYTES',
      mime: 'application/pdf',
    })
    expect(result).toEqual({ saved: true, path: '/home/user/report.pdf' })
    expect(bridge.isTauri).toBe(true)
  })

  it('saveFile はバイナリ contents を number[] へ正規化して渡す', async () => {
    const api = mockApi(() => null) // キャンセル相当
    const bridge = createTauriBridge(api)

    const result = await bridge.saveFile({
      fileName: 'a.xlsx',
      contents: new Uint8Array([1, 2, 3]),
    })

    expect(api.invoke).toHaveBeenCalledWith('save_file', {
      fileName: 'a.xlsx',
      contents: [1, 2, 3],
      mime: null,
    })
    // path=null（キャンセル）は saved=false
    expect(result).toEqual({ saved: false, path: null })
  })

  it('print は print コマンドを、checkUpdate は check_update コマンドを呼ぶ', async () => {
    const api = mockApi((cmd) =>
      cmd === 'check_update' ? { available: true, version: '1.2.0', notes: '修正' } : undefined,
    )
    const bridge = createTauriBridge(api)

    await bridge.print()
    const status = await bridge.checkUpdate()

    expect(api.invoke).toHaveBeenCalledWith('print')
    expect(api.invoke).toHaveBeenCalledWith('check_update')
    expect(status).toEqual({ available: true, version: '1.2.0', notes: '修正' })
  })

  it('API 不在(null)では例外を投げず no-op / フォールバックする', async () => {
    const bridge = createTauriBridge(null)

    expect(bridge.isTauri).toBe(false)
    // Node 環境では document 不在 → 保存は安全に no-op
    await expect(bridge.saveFile({ fileName: 'x.pdf', contents: 'z' })).resolves.toEqual({
      saved: false,
      path: null,
    })
    // print は window 不在で no-op（throw しない）
    await expect(bridge.print()).resolves.toBeUndefined()
    // 更新は「無し」を返す
    await expect(bridge.checkUpdate()).resolves.toEqual({
      available: false,
      version: null,
      notes: null,
    })
  })
})
