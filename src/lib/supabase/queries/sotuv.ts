import type { SupabaseClient } from "@supabase/supabase-js"
import { supabase } from "../client"

// ponytail: untyped client until `bun run gen:types` picks up migration 072
// (same trick as tasks.ts); drop the cast once types.ts is regenerated.
const db = supabase as unknown as SupabaseClient

// ─── Types ──────────────────────────────────────────────────────────────────

export interface Pipeline { id: string; name: string; sort_order: number }

export interface Stage {
  id: string
  pipeline_id: string
  name: string
  color: string
  sort_order: number
  is_won: boolean
  is_lost: boolean
}

export type TaskKind = "call" | "meeting" | "email" | "other"
export const TASK_KINDS: { id: TaskKind; label: string }[] = [
  { id: "call", label: "Qo'ng'iroq" },
  { id: "meeting", label: "Uchrashuv" },
  { id: "email", label: "Xabar yozish" },
  { id: "other", label: "Boshqa" },
]
export const kindLabel = (k: TaskKind) => TASK_KINDS.find((x) => x.id === k)!.label

interface Person { full_name: string; avatar_url: string | null }

export interface LeadClient { id: string; full_name: string; phone: string | null; image: string | null }

export interface Lead {
  id: string
  name: string
  pipeline_id: string
  stage_id: string
  client_id: string | null
  price: number
  source: string | null
  responsible_user_id: string | null
  loss_reason: string | null
  is_won: boolean
  is_lost: boolean
  created_at: string
  stage_changed_at: string
  closed_at: string | null
  client: LeadClient | null
  responsible: Person | null
  /** the earliest open task, for the card */
  next_task: Pick<SalesTask, "due_date" | "kind" | "text"> | null
}

export type LeadPatch = Partial<Pick<Lead, "name" | "stage_id" | "pipeline_id" | "price" | "source" | "responsible_user_id" | "loss_reason">>

export interface SalesTask {
  id: string
  lead_id: string
  kind: TaskKind
  text: string
  due_date: string           // timestamptz
  assignee_id: string | null
  is_done: boolean
  done_at: string | null
  result: string | null
  created_by: string | null
  created_at: string
  assignee: Person | null
  lead?: { id: string; name: string; client: { full_name: string; phone: string | null } | null } | null
}

export interface FeedNote {
  id: string
  kind: "note" | "created" | "stage" | "lead"   // lead = a form request (073)
  text: string
  created_at: string
  created_by: string | null
  author: Person | null
}

export const SOURCES: { id: string; label: string }[] = [
  { id: "manual", label: "Qo'lda" },
  { id: "call", label: "Qo'ng'iroq" },
  { id: "instagram", label: "Instagram" },
  { id: "telegram", label: "Telegram" },
  { id: "facebook", label: "Facebook" },
  { id: "sayt", label: "Sayt" },
  { id: "tavsiya", label: "Tavsiya" },
  // form sources (073) — set by the intake, shown as is
  { id: "tilda", label: "Tilda" },
  { id: "framer", label: "Framer" },
  { id: "meta", label: "Facebook / Instagram" },
]
export const sourceLabel = (s: string | null) => SOURCES.find((x) => x.id === s)?.label ?? s ?? "—"

// ─── Voronkalar / bosqichlar (admin edits; RLS enforces it) ────────────────

export async function getPipelines(): Promise<Pipeline[]> {
  const { data, error } = await db.from("crm_pipelines").select("id, name, sort_order").order("sort_order").order("created_at")
  if (error) throw error
  return data as Pipeline[]
}

export async function getStages(pipelineId: string): Promise<Stage[]> {
  const { data, error } = await db.from("crm_stages").select("id, pipeline_id, name, color, sort_order, is_won, is_lost")
    .eq("pipeline_id", pipelineId).order("sort_order")
  if (error) throw error
  return data as Stage[]
}

const DEFAULT_STAGES = [
  { name: "Yangi lid", color: "#378ADD" },
  { name: "Bog'lanildi", color: "#BA7517" },
  { name: "Uchrashuv", color: "#7F77DD" },
  { name: "Taklif yuborildi", color: "#D4537E" },
  { name: "Yutildi", color: "#1D9E75", is_won: true },
  { name: "Yutqazildi", color: "#E24B4A", is_lost: true },
]

export async function createPipeline(name: string, sortOrder: number): Promise<Pipeline> {
  const { data, error } = await db.from("crm_pipelines").insert({ name, sort_order: sortOrder }).select("id, name, sort_order").single()
  if (error) throw error
  const p = data as Pipeline
  const { error: e2 } = await db.from("crm_stages").insert(DEFAULT_STAGES.map((s, i) => ({ ...s, pipeline_id: p.id, sort_order: i })))
  if (e2) throw e2
  return p
}

export async function renamePipeline(id: string, name: string): Promise<void> {
  const { error } = await db.from("crm_pipelines").update({ name }).eq("id", id)
  if (error) throw error
}

export async function deletePipeline(id: string): Promise<void> {
  const { error } = await db.from("crm_pipelines").delete().eq("id", id)
  if (error) throw error.code === "23503" ? new Error("Voronkada bitimlar bor — avval ularni boshqa voronkaga o'tkazing") : error
}

export async function saveStage(s: Partial<Stage> & { pipeline_id: string }): Promise<void> {
  const { error } = s.id
    ? await db.from("crm_stages").update({ name: s.name, color: s.color, sort_order: s.sort_order }).eq("id", s.id)
    : await db.from("crm_stages").insert(s)
  if (error) throw error
}

export async function deleteStage(id: string): Promise<void> {
  const { error } = await db.from("crm_stages").delete().eq("id", id)
  if (error) throw error.code === "23503" ? new Error("Bu bosqichda bitimlar bor — avval ularni boshqa bosqichga o'tkazing") : error
}

// ─── Bitimlar ───────────────────────────────────────────────────────────────

const LEAD_SELECT =
  "id, name, pipeline_id, stage_id, client_id, price, source, responsible_user_id, loss_reason, is_won, is_lost, created_at, stage_changed_at, closed_at, " +
  "client:client_id(id, full_name, phone, image), responsible:responsible_user_id(full_name, avatar_url), " +
  "tasks:crm_tasks(due_date, kind, text, is_done)"

type LeadRow = Omit<Lead, "next_task"> & { tasks: (Pick<SalesTask, "due_date" | "kind" | "text" | "is_done">)[] }
const toLead = ({ tasks, ...r }: LeadRow): Lead => {
  const open = (tasks ?? []).filter((t) => !t.is_done).sort((a, b) => a.due_date.localeCompare(b.due_date))
  return { ...r, next_task: open[0] ? { due_date: open[0].due_date, kind: open[0].kind, text: open[0].text } : null }
}

export async function getLeads(pipelineId: string): Promise<Lead[]> {
  // ponytail: whole voronka in one query; page by stage once a voronka holds thousands
  const { data, error } = await db.from("crm_leads").select(LEAD_SELECT).eq("pipeline_id", pipelineId).order("created_at", { ascending: false })
  if (error) throw error
  return ((data ?? []) as unknown as LeadRow[]).map(toLead)
}

export async function getLead(id: string): Promise<Lead | null> {
  const { data, error } = await db.from("crm_leads").select(LEAD_SELECT).eq("id", id).maybeSingle()
  if (error) throw error
  return data ? toLead(data as unknown as LeadRow) : null
}

export interface LeadDraft {
  pipeline_id: string
  stage_id: string
  name: string
  client_name: string
  phone: string
  price: number
  source: string
  responsible_user_id: string | null
}

/** Existing client by phone, or a new one (one client per phone) — see create_crm_lead */
export async function createLead(d: LeadDraft): Promise<string> {
  const { data, error } = await db.rpc("create_crm_lead", {
    p_pipeline: d.pipeline_id, p_stage: d.stage_id, p_name: d.name,
    p_client_name: d.client_name || null, p_phone: d.phone || null,
    p_price: d.price, p_source: d.source, p_responsible: d.responsible_user_id,
  })
  if (error) throw error
  return data as string
}

export async function updateLead(id: string, patch: LeadPatch): Promise<void> {
  const { error } = await db.from("crm_leads").update(patch).eq("id", id)
  if (error) throw error
}

export async function deleteLead(id: string): Promise<void> {
  const { data, error } = await db.from("crm_leads").delete().eq("id", id).select("id")
  if (error) throw error
  if (!data?.length) throw new Error("Bitimni faqat administrator o'chira oladi")
}

export interface PhoneMatch {
  id: string
  full_name: string
  /** the client's deals that are still open — a new one would be a duplicate */
  open: { id: string; name: string; pipeline: string; stage: string }[]
}

/** A client already in the base with this phone, with their open deals (the "mavjud mijoz" hint) */
export async function findClientByPhone(phone: string): Promise<PhoneMatch | null> {
  const { data, error } = await db.from("clients")
    .select("id, full_name, crm_leads(id, name, is_won, is_lost, pipeline:pipeline_id(name), stage:stage_id(name))")
    .eq("phone", phone).maybeSingle()
  if (error) throw error
  if (!data) return null
  const c = data as unknown as { id: string; full_name: string; crm_leads: { id: string; name: string; is_won: boolean; is_lost: boolean; pipeline: { name: string } | null; stage: { name: string } | null }[] }
  return {
    id: c.id, full_name: c.full_name,
    open: c.crm_leads.filter((l) => !l.is_won && !l.is_lost).map((l) => ({ id: l.id, name: l.name, pipeline: l.pipeline?.name ?? "", stage: l.stage?.name ?? "" })),
  }
}

// ─── Lenta ───────────────────────────────────────────────────────────────────

export async function getNotes(leadId: string): Promise<FeedNote[]> {
  const { data, error } = await db.from("crm_notes")
    .select("id, kind, text, created_at, created_by, author:created_by(full_name, avatar_url)")
    .eq("lead_id", leadId).order("created_at")
  if (error) throw error
  return data as unknown as FeedNote[]
}

export async function addNote(leadId: string, text: string): Promise<void> {
  const { data: { user } } = await supabase.auth.getUser()
  const { error } = await db.from("crm_notes").insert({ lead_id: leadId, text: text.trim(), created_by: user?.id })
  if (error) throw error
}

export async function deleteNote(id: string): Promise<void> {
  const { error } = await db.from("crm_notes").delete().eq("id", id)
  if (error) throw error
}

// ─── Vazifalar ───────────────────────────────────────────────────────────────

const TASK_SELECT =
  "id, lead_id, kind, text, due_date, assignee_id, is_done, done_at, result, created_by, created_at, assignee:assignee_id(full_name, avatar_url)"

export async function getLeadTasks(leadId: string): Promise<SalesTask[]> {
  const { data, error } = await db.from("crm_tasks").select(TASK_SELECT).eq("lead_id", leadId).order("due_date")
  if (error) throw error
  return data as unknown as SalesTask[]
}

/** Every open task (the Vazifalar tab), with its deal */
export async function getOpenTasks(): Promise<SalesTask[]> {
  const { data, error } = await db.from("crm_tasks")
    .select(`${TASK_SELECT}, lead:lead_id(id, name, client:client_id(full_name, phone))`)
    .eq("is_done", false).order("due_date")
  if (error) throw error
  return data as unknown as SalesTask[]
}

export type TaskDraft = Pick<SalesTask, "lead_id" | "kind" | "text" | "due_date" | "assignee_id">

export async function addTask(t: TaskDraft): Promise<void> {
  const { data: { user } } = await supabase.auth.getUser()
  const { error } = await db.from("crm_tasks").insert({ ...t, created_by: user?.id })
  if (error) throw error
}

export async function updateTask(id: string, patch: Partial<Pick<SalesTask, "kind" | "text" | "due_date" | "assignee_id" | "is_done" | "result">>): Promise<void> {
  const { error } = await db.from("crm_tasks").update(patch).eq("id", id)
  if (error) throw error
}

export async function deleteTask(id: string): Promise<void> {
  const { data, error } = await db.from("crm_tasks").delete().eq("id", id).select("id")
  if (error) throw error
  if (!data?.length) throw new Error("Vazifani faqat uni yaratgan hodim yoki administrator o'chira oladi")
}

// ─── Realtime: someone else moves a card ────────────────────────────────────

export function subscribeLeads(pipelineId: string, onChange: () => void): () => void {
  const ch = supabase.channel(`sotuv_${pipelineId}`)
    .on("postgres_changes", { event: "*", schema: "public", table: "crm_leads", filter: `pipeline_id=eq.${pipelineId}` }, onChange)
    .subscribe()
  return () => { supabase.removeChannel(ch) }
}

/** A call on this deal was logged (the PBX publishes it ~1 min after it ends) — also its call-back task */
export function subscribeLeadCalls(leadId: string, onChange: () => void): () => void {
  const ch = supabase.channel(`sotuv_calls_${leadId}`)
    .on("postgres_changes", { event: "INSERT", schema: "public", table: "crm_calls", filter: `lead_id=eq.${leadId}` }, onChange)
    .subscribe()
  return () => { supabase.removeChannel(ch) }
}

// ─── Time: tasks carry a Tashkent wall-clock deadline ───────────────────────

/** "YYYY-MM-DD" + optional "HH:MM" (Tashkent) → timestamptz; no time = end of day ("kun davomida") */
export const toDue = (date: string, time: string | null) => `${date}T${time ?? "23:59"}:00+05:00`

/** timestamptz → Tashkent { date, time|null } (23:59 = no time) */
export function fromDue(iso: string): { date: string; time: string | null } {
  const t = new Date(new Date(iso).getTime() + 5 * 3600_000).toISOString()
  const time = t.slice(11, 16)
  return { date: t.slice(0, 10), time: time === "23:59" ? null : time }
}

// ─── Telefoniya (074): OnlinePBX calls ──────────────────────────────────────

export interface Call {
  uuid: string
  direction: "in" | "out"
  phone: string | null
  ext: string | null
  started_at: string
  duration: number
  talk_time: number
  staff: Person | null
}

export async function getLeadCalls(leadId: string): Promise<Call[]> {
  const { data, error } = await db.from("crm_calls")
    .select("uuid, direction, phone, ext, started_at, duration, talk_time, staff:staff_id(full_name, avatar_url)")
    .eq("lead_id", leadId).order("started_at")
  if (error) throw error
  return data as unknown as Call[]
}

/** "+998 90 123 45 67", "901234567", "998901234567" → "+998901234567" (other countries: digits) */
export function canonPhone(raw: string): string {
  const d = raw.replace(/\D/g, "")
  if (d.length === 9) return `+998${d}`
  if (d.length === 12 && d.startsWith("998")) return `+${d}`
  return d ? `+${d}` : ""
}

/** Who is on the line: the client with this phone and their latest open deal */
export async function findCallContact(phone: string): Promise<{ name: string; leadId: string | null; leadName: string | null } | null> {
  const { data, error } = await db.from("clients")
    .select("full_name, crm_leads(id, name, is_won, is_lost, updated_at)").eq("phone", canonPhone(phone)).maybeSingle()
  if (error || !data) return null
  const c = data as { full_name: string; crm_leads: { id: string; name: string; is_won: boolean; is_lost: boolean; updated_at: string }[] }
  const open = c.crm_leads.filter((l) => !l.is_won && !l.is_lost).sort((a, b) => b.updated_at.localeCompare(a.updated_at))[0]
  return { name: c.full_name, leadId: open?.id ?? null, leadName: open?.name ?? null }
}

/** amo-sync's /hooks/pbx/* with the signed-in session (the PBX key never reaches the browser) */
export async function pbxApi<T>(path: string): Promise<T> {
  const { data: { session } } = await supabase.auth.getSession()
  const res = await fetch(`${(import.meta.env.VITE_SUPABASE_URL as string).replace(/\/$/, "")}/hooks/pbx/${path}`, {
    headers: { Authorization: `Bearer ${session?.access_token ?? ""}` },
  })
  const body = (await res.json().catch(() => ({}))) as T & { error?: string }
  if (!res.ok) throw new Error(body.error ?? `HTTP ${res.status}`)
  return body
}

// ─── Qo'ng'iroqlar page (075): every call, newest first, 20 per page ────────

export type CallFilter = "all" | "in" | "out" | "missed"
export interface CallRow extends Call {
  lead_id: string | null
  client: { full_name: string } | null
  lead: { name: string } | null
}

export async function getCalls(o: { page: number; filter: CallFilter; staffId: string | null }): Promise<{ rows: CallRow[]; total: number }> {
  let q = db.from("crm_calls")
    .select("uuid, direction, phone, ext, started_at, duration, talk_time, lead_id, staff:staff_id(full_name, avatar_url), client:client_id(full_name), lead:lead_id(name)", { count: "exact" })
    .order("started_at", { ascending: false })
    .range(o.page * 20, o.page * 20 + 19)
  if (o.filter === "in" || o.filter === "out") q = q.eq("direction", o.filter)
  if (o.filter === "missed") q = q.eq("talk_time", 0)
  if (o.staffId) q = q.eq("staff_id", o.staffId)
  const { data, error, count } = await q
  if (error) throw error
  return { rows: data as unknown as CallRow[], total: count ?? 0 }
}

/** Any new call → the list refreshes */
export function subscribeCalls(onChange: () => void): () => void {
  const ch = supabase.channel("sotuv_calls_all")
    .on("postgres_changes", { event: "INSERT", schema: "public", table: "crm_calls" }, onChange)
    .subscribe()
  return () => { supabase.removeChannel(ch) }
}

/** Open bitimlar grouped by client — 2+ in a group is a duplicate (Dublikatlar) */
export interface DupLead { id: string; name: string; price: number; created_at: string; updated_at: string; pipeline: string; stage: string; responsible: string | null }
export async function getDuplicateLeads(): Promise<{ client: { id: string; full_name: string; phone: string | null }; leads: DupLead[] }[]> {
  // ponytail: all open bitimlar grouped in the browser; a SQL group-by when there are thousands
  const { data, error } = await db.from("crm_leads")
    .select("id, name, price, created_at, updated_at, client_id, client:client_id(id, full_name, phone), pipeline:pipeline_id(name), stage:stage_id(name), responsible:responsible_user_id(full_name)")
    .eq("is_won", false).eq("is_lost", false).not("client_id", "is", null)
  if (error) throw error
  type Row = { id: string; name: string; price: number; created_at: string; updated_at: string; client_id: string
    client: { id: string; full_name: string; phone: string | null }; pipeline: { name: string } | null; stage: { name: string } | null; responsible: { full_name: string } | null }
  const groups = new Map<string, { client: Row["client"]; leads: DupLead[] }>()
  for (const r of data as unknown as Row[]) {
    const g = groups.get(r.client_id) ?? { client: r.client, leads: [] }
    g.leads.push({ id: r.id, name: r.name, price: r.price, created_at: r.created_at, updated_at: r.updated_at,
      pipeline: r.pipeline?.name ?? "", stage: r.stage?.name ?? "", responsible: r.responsible?.full_name ?? null })
    groups.set(r.client_id, g)
  }
  return [...groups.values()].filter((g) => g.leads.length > 1)
    .map((g) => ({ ...g, leads: g.leads.sort((a, b) => a.created_at.localeCompare(b.created_at)) }))
}

export async function mergeLeads(keep: string, drop: string): Promise<void> {
  const { error } = await db.rpc("merge_crm_leads", { p_keep: keep, p_drop: drop })
  if (error) throw error
}

/** My open sales tasks, for the in-app reminder (075) */
export async function getMyOpenTasks(userId: string): Promise<(Pick<SalesTask, "id" | "lead_id" | "kind" | "text" | "due_date"> & { lead: { name: string } | null })[]> {
  const { data, error } = await db.from("crm_tasks").select("id, lead_id, kind, text, due_date, lead:lead_id(name)")
    .eq("assignee_id", userId).eq("is_done", false).order("due_date")
  if (error) throw error
  return data as unknown as (Pick<SalesTask, "id" | "lead_id" | "kind" | "text" | "due_date"> & { lead: { name: string } | null })[]
}

/** The operator names a client that came in as a bare phone number (075) */
export async function renameClient(id: string, fullName: string): Promise<void> {
  const { error } = await db.from("clients").update({ full_name: fullName }).eq("id", id)
  if (error) throw error
}
