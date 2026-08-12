// [REQ-001][NFR-03] 実DB データアクセス層: 最小権限ロール接続プール & RLSセッションヘルパー。
//
// 設計（ADR-002/005/008・0200_rls.sql/0201_app_role.sql 準拠）:
//   ・接続は必ず最小権限ロール app_client（nosuperuser / nobypassrls）で行う。
//     postgres(superuser) は RLS をバイパスするため、RLS を実効化するには app_client 必須。
//   ・現場判定は各接続の `app.user_id`（= auth.uid() 相当）で行う。RLS が効くよう、
//     1接続を取りトランザクション内で `set_config('app.user_id', ..., true)`（=SET LOCAL）
//     を張ってからクエリする。COMMIT/ROLLBACK でリセットされ、プール返却後に漏れない。
//   ・service 相当（群B=AI経路の書込）は【専用ロール app_service の別接続プール】で行う。
//     0202_rls_hardening.sql により service 判定は GUC `app.role` ではなく current_user='app_service'
//     になったため、app_client 接続がどんな GUC を立てても群B書込は不可（HIGH-1 恒久遮断）。
//
// 接続情報は env のみ（既定は trust 認証のためパスワード無し）。Secrets ハードコード無し。
import { Pool } from 'pg'
import type { PoolClient, QueryResult, QueryResultRow } from 'pg'

/** app_client（最小権限）接続文字列。既定は trust ローカル接続（パスワード無し）。 */
const CONNECTION_STRING =
  process.env['DATABASE_URL'] ?? 'postgres://app_client@127.0.0.1:5433/mamorai'

/** app_service（群B書込専用ロール）接続文字列。app_client とは別ロール＝別接続で分離。 */
const SERVICE_CONNECTION_STRING =
  process.env['DATABASE_URL_SERVICE'] ?? 'postgres://app_service@127.0.0.1:5433/mamorai'

/** アプリ用プール（app_client 固定）。プロセス内で単一。 */
export const pool = new Pool({ connectionString: CONNECTION_STRING })

/** サービス用プール（app_service 固定）。群B書込のみに使用。 */
export const servicePool = new Pool({ connectionString: SERVICE_CONNECTION_STRING })

/**
 * リポジトリに渡す最小のクエリ実行インターフェース。
 * トランザクション制御（begin/commit）はヘルパー側に隠蔽し、リポジトリは query のみ使う。
 */
export interface DbExec {
  query<R extends QueryResultRow = QueryResultRow>(
    text: string,
    params?: readonly unknown[]
  ): Promise<QueryResult<R>>
}

/** PoolClient を DbExec へ適合させる（型 as を使わず readonly params を配列化して委譲）。 */
function asExec(client: PoolClient): DbExec {
  return {
    query: <R extends QueryResultRow>(text: string, params?: readonly unknown[]) =>
      client.query<R>(text, params ? [...params] : undefined),
  }
}

/**
 * 現場スコープ RLS 下で fn を実行する。
 * 1接続を取り BEGIN → `SET LOCAL app.user_id` → fn → COMMIT。例外時は ROLLBACK。
 * userId は set_config のパラメータとして渡すため SQL インジェクション安全。
 */
export async function withUser<T>(userId: string, fn: (db: DbExec) => Promise<T>): Promise<T> {
  const client = await pool.connect()
  try {
    await client.query('begin')
    await client.query('select set_config($1, $2, true)', ['app.user_id', userId])
    const result = await fn(asExec(client))
    await client.query('commit')
    return result
  } catch (err) {
    await client.query('rollback')
    throw err
  } finally {
    client.release()
  }
}

/**
 * service 相当（群B=AI経路の書込）で fn を実行する。
 * 専用ロール app_service の別接続（servicePool）で BEGIN → fn → COMMIT。
 * RLS の app_is_service()（= current_user='app_service'）が true になるため群B書込が成立する。
 * GUC は一切張らない（app_client 接続では current_user が app_client のままで昇格不能）。
 */
export async function withService<T>(fn: (db: DbExec) => Promise<T>): Promise<T> {
  const client = await servicePool.connect()
  try {
    await client.query('begin')
    const result = await fn(asExec(client))
    await client.query('commit')
    return result
  } catch (err) {
    await client.query('rollback')
    throw err
  } finally {
    client.release()
  }
}

/** テスト/シャットダウン用: 両プールを閉じる。 */
export async function closePool(): Promise<void> {
  await pool.end()
  await servicePool.end()
}
