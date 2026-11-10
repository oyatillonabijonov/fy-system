// The only way a connector tool reaches the database: a read-only transaction as the signed-in user, like PostgREST does for the web app.
import postgres from "postgres"
import type { TransactionSql } from "postgres"

export type UserSql = TransactionSql
export type AsUser = (<T>(uid: string, fn: (tx: UserSql) => Promise<T>) => Promise<T>) & { end: () => Promise<void> }

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

/** Its own small pool (max 4), so tool calls never wait behind the worker's two connections */
export function makeAsUser(databaseUrl: string): AsUser {
  const sql = postgres(databaseUrl, { max: 4, onnotice: () => {} })
  const run = async <T>(uid: string, fn: (tx: UserSql) => Promise<T>): Promise<T> => {
    if (!UUID.test(uid)) throw new Error("asUser: uid is not a UUID")
    return (await sql.begin("read only", async (tx) => {
      await tx`set local role authenticated`
      await tx`select
        set_config('request.jwt.claim.sub', ${uid}, true),
        set_config('request.jwt.claim.role', 'authenticated', true),
        set_config('request.jwt.claims', ${JSON.stringify({ sub: uid, role: "authenticated" })}, true),
        set_config('statement_timeout', '8s', true)`
      return fn(tx)
    })) as T
  }
  return Object.assign(run, { end: () => sql.end() })
}
