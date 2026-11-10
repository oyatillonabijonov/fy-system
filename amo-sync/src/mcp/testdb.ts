// Test helpers: the throwaway stand only (TEST_DATABASE_URL); never a real database.
import postgres from "postgres"
import type { Sql } from "postgres"

export const testSql: Sql | null = process.env.TEST_DATABASE_URL ? postgres(process.env.TEST_DATABASE_URL, { max: 2, onnotice: () => {} }) : null

/** A staff fixture with a fresh id (auth.users → the trigger makes the profile → permissions); returns the id. */
export async function staff(sql: Sql, o: { role?: "admin" | "manager" | "xodim"; modules?: string[]; active?: boolean; department?: string }): Promise<string> {
  const id = crypto.randomUUID()
  const meta = { full_name: `Fixture ${id.slice(0, 8)}`, role: o.role ?? "xodim" }
  await sql`insert into auth.users (id, email, raw_user_meta_data) values (${id}, ${`${id}@t.fy.uz`}, ${sql.json(meta)})`
  await sql`update public.profiles set is_active = ${o.active ?? true}, department = ${o.department ?? null} where id = ${id}`
  for (const module of o.modules ?? []) await sql`insert into public.user_permissions (user_id, module, can_view) values (${id}, ${module}, true)`
  return id
}
