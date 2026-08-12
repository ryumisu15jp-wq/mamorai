// Supabase 直結の土台（Sprint1 段階では未接続）。
//
// 方針:
// - 画面(WebView2)からは Supabase に anon キーで直結し、RLS でアクセス制御する。
// - 秘匿ロジック（Claude API 等の APIキー利用や、権限昇格が必要な処理）は
//   ここ（フロント）には置かない。Node/Express のサーバ経由で呼び出す（service_role はサーバ限定）。
// - 実接続は実 DDL / RLS 提供後（Sprint 後半）に有効化する。それまで client は null。
//
// 使い方（有効化後）:
//   import { getSupabase } from './lib/supabaseClient.js'
//   const sb = getSupabase(); if (sb) { ... }

export interface SupabaseEnv {
  url: string
  anonKey: string
}

/** Vite の import.meta.env から anon 接続情報を読む（未設定なら null）。 */
export function readSupabaseEnv(): SupabaseEnv | null {
  const env = import.meta.env
  const url = env.VITE_SUPABASE_URL
  const anonKey = env.VITE_SUPABASE_ANON_KEY
  if (typeof url !== 'string' || url === '' || typeof anonKey !== 'string' || anonKey === '') {
    return null
  }
  return { url, anonKey }
}

/**
 * Supabase クライアント雛形。
 * 実接続は @supabase/supabase-js 導入後に下記コメントを有効化する。
 * 現状は依存未導入 & env 未設定のため常に null を返す（DB非依存で UI を検証可能に保つ）。
 */
export function getSupabase(): unknown | null {
  const env = readSupabaseEnv()
  if (env === null) return null

  // --- 実接続（Sprint 後半 / 実 DDL 提供後に有効化） ---
  // import { createClient } from '@supabase/supabase-js'
  // return createClient(env.url, env.anonKey, { auth: { persistSession: true } })
  return null
}
