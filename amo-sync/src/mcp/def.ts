// What a connector tool is, and the helpers every file of tools shares (kept apart from tools.ts so a second file of tools can import them without a cycle).
import * as z from "zod"
import type { UserSql } from "./db"

export interface Me { id: string; name: string; role: string; isAdmin: boolean; modules: string[] }
export type Shape = Record<string, z.ZodType>
export type Module = "dashboard" | "sotuv-crmn" | "tadbirlar" | "tadbirlar-moliya"
export interface ToolDef {
  name: string; title: string; description: string
  module: Module | null   // null = any signed-in staff
  input: Shape
  run: (tx: UserSql, args: Record<string, unknown>, me: Me) => Promise<unknown>
  write?: true         // runs in a read-write transaction
  destructive?: true   // hint for the client: deletes or overwrites
  adminOnly?: true     // hidden from, and refused to, non-admins
}
export type ToolResult = { ok: true; data: unknown } | { ok: false; error: string }

/** An error whose text is meant for the model */
export class ToolError extends Error {}

export const LABEL: Record<Module, string> = { dashboard: "Dashboard", "sotuv-crmn": "Sotuv bo'limi", tadbirlar: "Tadbirlar", "tadbirlar-moliya": "Moliya" }

export const date = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "must be YYYY-MM-DD")
  .refine((s) => { const d = new Date(`${s}T00:00:00Z`); return !isNaN(d.getTime()) && d.toISOString().slice(0, 10) === s }, "not a calendar date")
export const uuid = z.string().uuid()
export const limit = (max: number, def: number) => z.number().int().min(1).max(max).default(def)
export const offset = z.number().int().min(0).default(0)

/** Types `args` from the zod shape, so each tool reads its own arguments without casts */
export function tool<S extends Shape>(d: Omit<ToolDef, "input" | "run"> & { input: S; run: (tx: UserSql, a: z.infer<z.ZodObject<S>>, me: Me) => Promise<unknown> }): ToolDef {
  return d as unknown as ToolDef
}
