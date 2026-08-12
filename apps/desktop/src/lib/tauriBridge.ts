// [REQ-025] Tauri デスクトップ統合の抽象層（保存 / 印刷 / 自動更新）。
//
// 設計方針: Tauri API を「依存注入(DI)」する。UI はこの抽象 (TauriBridge) だけに依存し、
// 実行時に @tauri-apps/api（Tauri が window へ注入する core.invoke）があればそれを使い、
// 無ければブラウザ fallback / no-op で安全に動く。これにより
//   - Vitest では本物の Tauri 無しでモック API を注入して振る舞いを検証でき、
//   - Vite の通常ビルド（ブラウザ/開発）でも例外を出さずに動作する。
// 実バイナリ生成・OSダイアログ・自動更新の本実装は Rust 側 #[tauri::command]（Tauri 結合時）。

/** [REQ-025] 保存要求（PDF/Excel 等）。contents は文字列 or バイト列。 */
export interface SaveFileRequest {
  /** 既定ファイル名（保存ダイアログの初期値） */
  fileName: string
  /** ファイル本体。テキスト or バイナリ（Uint8Array） */
  contents: string | Uint8Array
  /** MIME 種別（任意。例 application/pdf） */
  mime?: string
}

/** [REQ-025] 保存結果。saved=false はキャンセル/フォールバック未保存。 */
export interface SaveFileResult {
  saved: boolean
  /** 保存先パス（Tauri のみ。ブラウザ/no-op では null） */
  path: string | null
}

/** [REQ-025] 自動更新チェック結果。 */
export interface UpdateStatus {
  available: boolean
  version?: string | null
  notes?: string | null
}

/**
 * [REQ-025] 注入する Tauri API の最小面。
 * Tauri v2 の `@tauri-apps/api/core` の invoke(cmd, args) 形と一致させ、
 * Rust 側 #[tauri::command] (save_file / print / check_update) を呼び分ける。
 */
export interface TauriCoreApi {
  invoke<T = unknown>(cmd: string, args?: Record<string, unknown>): Promise<T>
}

/** [REQ-025] UI が依存する抽象。実装は Tauri or ブラウザ fallback で切替。 */
export interface TauriBridge {
  /** 本物の Tauri ランタイム上か（UI のラベル表示等に使用） */
  readonly isTauri: boolean
  /** ローカル保存（PDF/Excel）。Tauri なら save_file コマンドへ委譲。 */
  saveFile(req: SaveFileRequest): Promise<SaveFileResult>
  /** 現在のビューを印刷。Tauri なら print コマンド、無ければ window.print()。 */
  print(): Promise<void>
  /** アプリ自動更新の有無を確認。Tauri なら check_update コマンドへ委譲。 */
  checkUpdate(): Promise<UpdateStatus>
}

/** contents を invoke へ渡せる形（string or number[]）へ正規化。 */
function normalizeContents(contents: string | Uint8Array): string | number[] {
  return typeof contents === 'string' ? contents : Array.from(contents)
}

/** Tauri 不在時の保存フォールバック。ブラウザなら Blob ダウンロード、それ以外は no-op。 */
function browserSaveFallback(req: SaveFileRequest): SaveFileResult {
  if (
    typeof document === 'undefined' ||
    typeof URL === 'undefined' ||
    typeof URL.createObjectURL !== 'function'
  ) {
    // Node/SSR/テスト環境: 安全に no-op（例外を投げない）
    return { saved: false, path: null }
  }
  const part: BlobPart = typeof req.contents === 'string' ? req.contents : new Uint8Array(req.contents)
  const blob = new Blob([part], { type: req.mime ?? 'application/octet-stream' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = req.fileName
  a.click()
  URL.revokeObjectURL(url)
  return { saved: true, path: req.fileName }
}

/**
 * [REQ-025] 注入 API から TauriBridge を生成する（DI の中核）。
 * api が null/undefined のときは Tauri 不在とみなし、ブラウザ fallback / no-op で動く。
 */
export function createTauriBridge(api: TauriCoreApi | null | undefined): TauriBridge {
  const hasApi = api != null
  return {
    isTauri: hasApi,

    async saveFile(req: SaveFileRequest): Promise<SaveFileResult> {
      if (api == null) return browserSaveFallback(req)
      const path = await api.invoke<string | null>('save_file', {
        fileName: req.fileName,
        contents: normalizeContents(req.contents),
        mime: req.mime ?? null,
      })
      return { saved: path != null, path: path ?? null }
    },

    async print(): Promise<void> {
      if (api == null) {
        if (typeof window !== 'undefined' && typeof window.print === 'function') {
          window.print()
        }
        return
      }
      await api.invoke('print')
    },

    async checkUpdate(): Promise<UpdateStatus> {
      if (api == null) return { available: false, version: null, notes: null }
      const res = await api.invoke<UpdateStatus>('check_update')
      return {
        available: Boolean(res?.available),
        version: res?.version ?? null,
        notes: res?.notes ?? null,
      }
    },
  }
}

/**
 * Tauri v2 が window へ注入する core.invoke を検出する。
 * ビルド時に @tauri-apps/api へ静的依存しないため、実行時グローバル経由で解決する。
 */
function detectInjectedTauriApi(): TauriCoreApi | null {
  if (typeof window === 'undefined') return null
  const w = window as unknown as {
    __TAURI__?: { core?: { invoke?: (cmd: string, args?: Record<string, unknown>) => Promise<unknown> } }
  }
  const core = w.__TAURI__?.core
  const invoke = core?.invoke
  if (typeof invoke === 'function') {
    return { invoke: invoke.bind(core) as TauriCoreApi['invoke'] }
  }
  return null
}

/** [REQ-025] 実行環境から自動解決した既定ブリッジ（UI はこれを使う）。 */
export function getDefaultTauriBridge(): TauriBridge {
  return createTauriBridge(detectInjectedTauriApi())
}
