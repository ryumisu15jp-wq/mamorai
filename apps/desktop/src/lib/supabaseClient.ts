// Supabase 直結クライアント。anon キーでブラウザから直結し RLS でアクセス制御する。
// 秘匿処理(service_role/Claude鍵)はここには置かない（サーバ限定）。
// env 未設定なら null を返し、authService 側がデモ動作にフォールバックする。
import { createClient, type SupabaseClient } from '@supabase/supabase-js'

export interface SupabaseEnv {
  url: string
  anonKey: string
}

/** Vite の import.meta.env から anon/publishable 接続情報を読む（未設定なら null）。
 *  キー名は新旧どちらも許容: VITE_SUPABASE_ANON_KEY / VITE_SUPABASE_PUBLISHABLE_KEY。 */
export function readSupabaseEnv(): SupabaseEnv | null {
  const env = import.meta.env as Record<string, string | undefined>
  const url = env.VITE_SUPABASE_URL
  const anonKey = env.VITE_SUPABASE_ANON_KEY ?? env.VITE_SUPABASE_PUBLISHABLE_KEY
  if (typeof url !== 'string' || url === '' || typeof anonKey !== 'string' || anonKey === '') {
    return null
  }
  return { url, anonKey }
}

let _client: SupabaseClient | null = null

/** シングルトンの Supabase クライアント（env 未設定なら null）。 */
export function getSupabase(): SupabaseClient | null {
  if (_client !== null) return _client
  const env = readSupabaseEnv()
  if (env === null) return null
  _client = createClient(env.url, env.anonKey, {
    auth: { persistSession: true, autoRefreshToken: true, storageKey: 'mamorai-auth' },
  })
  return _client
}

/** Supabase が構成済みか（実認証を使うか、デモにフォールバックするか）。 */
export function isSupabaseConfigured(): boolean {
  return readSupabaseEnv() !== null
}
