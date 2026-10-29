import { useEffect, useMemo, useState } from "react"
import { motion, AnimatePresence } from "framer-motion"
import { MagnifyingGlass, X, ArrowRight, SlidersHorizontal, CaretRight } from "@phosphor-icons/react"
import { formatDate, formatNumber } from "@/lib/format"
import { useActivityLogs } from "@/hooks/useActivity"
import { useUsers } from "@/hooks/useUsers"
import type {
  ActivityLog,
  ActivityFilters,
  ActivityAction,
  ActivityEntityType,
} from "@/lib/supabase/queries/activity"
import { tbl } from "@/components/ui/table"
import { Pager, PAGE_SIZE } from "@/components/ui/Pager"
import { Sheet } from "@/components/ui/Sheet"   // explicit .tsx: on a case-insensitive disk "Sheet" resolves to sheet.ts
import { useMedia } from "@/hooks/useMedia"

// ─── Labels ──────────────────────────────────────────────────────────────────

const ENTITY_LABELS: Record<ActivityEntityType, string> = {
  client: "Mijoz",
  event: "Tadbir",
  participant: "Ishtirokchi",
  profile: "Hodim",
  permission: "Ruxsat",
  kpi: "KPI",
  cashback: "Cashback",
}

const ACTIONS: Record<ActivityAction, { label: string; dot: string }> = {
  created: { label: "yaratdi", dot: "bg-success" },
  updated: { label: "tahrirladi", dot: "bg-info" },
  deleted: { label: "o'chirdi", dot: "bg-danger" },
}

// Row snapshots carry every column; these are the ones worth showing a human.
const FIELD_LABELS: Record<string, string> = {
  full_name: "Ism", name: "Nomi", phone: "Telefon", email: "Email", company: "Kompaniya",
  role: "Rol", position: "Lavozim", department: "Bo'lim", activity: "Faoliyat",
  avatar_url: "Rasm", image_url: "Rasm", cover_image: "Muqova",
  price: "Narx", paid: "To'langan", amount: "Summa", tariff: "Tarif", revenue: "Aylanma",
  cashback_balance: "Cashback balansi", cashback_earned: "Yig'ilgan cashback", cashback_used: "Ishlatilgan cashback",
  events_count: "Tadbirlar soni", attended: "Qatnashdi", status: "Holat",
  date: "Sana", end_date: "Tugash sanasi", location: "Joy", notes: "Izoh", description: "Tavsif",
  birth_date: "Tug'ilgan sana", hire_date: "Ishga kirgan sana", address: "Manzil", telegram: "Telegram", bio: "Bio",
  is_active: "Faol", module: "Modul", can_view: "Ko'rish", can_edit: "Tahrirlash", can_delete: "O'chirish",
  type: "Turi", reason: "Sabab",
}
const HIDDEN_FIELDS = new Set(["id", "created_at", "updated_at"])

const fieldLabel = (k: string) => FIELD_LABELS[k] ?? k

const PERIODS = [
  { id: "today", label: "Bugun", days: 0 },
  { id: "7d", label: "7 kun", days: 6 },
  { id: "30d", label: "30 kun", days: 29 },
  { id: "all", label: "Hammasi", days: null },
] as const
type PeriodId = (typeof PERIODS)[number]["id"]

function periodFrom(id: PeriodId): string | undefined {
  const days = PERIODS.find((p) => p.id === id)!.days
  if (days === null) return undefined
  const d = new Date()
  d.setHours(0, 0, 0, 0)
  d.setDate(d.getDate() - days)
  return d.toISOString()
}

// ─── Diff helpers ────────────────────────────────────────────────────────────

type Snapshot = Record<string, unknown>
interface Change { key: string; before?: unknown; after?: unknown }

function asSnapshot(v: unknown): Snapshot | null {
  return v && typeof v === "object" && !Array.isArray(v) ? (v as Snapshot) : null
}

/** updated → only the fields that changed; created/deleted → the filled fields of the row */
function changesOf(log: ActivityLog): Change[] {
  const c = asSnapshot(log.changes)
  if (!c) return []
  if (log.action === "updated") {
    const before = asSnapshot(c.before) ?? {}
    const after = asSnapshot(c.after) ?? {}
    return Object.keys(after)
      .filter((k) => !HIDDEN_FIELDS.has(k) && JSON.stringify(before[k]) !== JSON.stringify(after[k]))
      .map((k) => ({ key: k, before: before[k], after: after[k] }))
  }
  return Object.entries(c)
    .filter(([k, v]) => !HIDDEN_FIELDS.has(k) && !k.endsWith("_id") && v !== null && v !== "" && FIELD_LABELS[k])
    .map(([k, v]) => (log.action === "created" ? { key: k, after: v } : { key: k, before: v }))
}

const ISO_DATE = /^\d{4}-\d{2}-\d{2}(T|$)/

function formatValue(v: unknown): string {
  if (v === null || v === undefined || v === "") return "—"
  if (typeof v === "boolean") return v ? "Ha" : "Yo'q"
  if (typeof v === "number") return formatNumber(v)
  if (typeof v === "string") return ISO_DATE.test(v) ? formatDate(v) : v
  return JSON.stringify(v)
}

function when(iso: string): string {
  const d = new Date(iso)
  const time = d.toLocaleTimeString("uz-UZ", { hour: "2-digit", minute: "2-digit" })
  const day = new Date(d)
  day.setHours(0, 0, 0, 0)
  const today = new Date()
  today.setHours(0, 0, 0, 0)
  const diff = Math.round((today.getTime() - day.getTime()) / 86400000)
  if (diff === 0) return `Bugun, ${time}`
  if (diff === 1) return `Kecha, ${time}`
  return `${formatDate(d).slice(0, 5)}, ${time}`
}

/** Phone list: the day on top ("Bugun" / "Kecha" / dd.mm), the clock under it */
function whenParts(iso: string): [string, string] {
  const [day, time] = when(iso).split(", ")
  return [day, time]
}

const initials = (name: string | null) =>
  (name ?? "Tizim").split(" ").map((w) => w[0]).filter(Boolean).slice(0, 2).join("").toUpperCase()

// ─── Page ────────────────────────────────────────────────────────────────────

const sheetSelect = "h-12 px-4 rounded-control bg-surface-sunken text-base font-normal text-ink border border-transparent outline-none focus:border-line-focus"

const selectCls =
  "h-control-md pl-3 pr-8 min-w-0 flex-1 basis-[calc(50%-4px)] sm:flex-none sm:basis-auto rounded-control bg-surface-sunken text-base text-ink border border-transparent outline-none focus:border-line-focus"

export function Faollik() {
  const [period, setPeriod] = useState<PeriodId>("7d")
  const [actorId, setActorId] = useState("")
  const [entity, setEntity] = useState<ActivityEntityType | "">("")
  const [action, setAction] = useState<ActivityAction | "">("")
  const [searchInput, setSearchInput] = useState("")
  const [search, setSearch] = useState("")
  const [page, setPage] = useState(0)
  const [openLog, setOpenLog] = useState<ActivityLog | null>(null)
  const [filterOpen, setFilterOpen] = useState(false)

  // Search as you type, without a request per keystroke
  useEffect(() => {
    const t = setTimeout(() => { setSearch(searchInput.trim()); setPage(0) }, 300)
    return () => clearTimeout(t)
  }, [searchInput])

  const filters = useMemo<ActivityFilters>(() => ({
    date_from: periodFrom(period),
    actor_id: actorId || undefined,
    entity_type: entity || undefined,
    action: action || undefined,
    search: search || undefined,
  }), [period, actorId, entity, action, search])

  const { data, isLoading } = useActivityLogs(filters, page, PAGE_SIZE)
  const { data: users = [] } = useUsers()
  const avatars = useMemo(() => new Map(users.map((u) => [u.id, u.avatar_url])), [users])

  const items = data?.items ?? []
  const total = data?.total ?? 0
  const filtered = Boolean(actorId || entity || action || search)
  const clearAll = () => { setActorId(""); setEntity(""); setAction(""); setSearchInput(""); setPage(0) }
  const chips = [
    actorId && { key: "actor", label: users.find((u) => u.id === actorId)?.full_name ?? "Hodim", clear: () => reset(setActorId)("") },
    entity && { key: "entity", label: ENTITY_LABELS[entity], clear: () => reset(setEntity)("") },
    action && { key: "action", label: ACTIONS[action].label[0].toUpperCase() + ACTIONS[action].label.slice(1), clear: () => reset(setAction)("") },
  ].filter((c): c is { key: string; label: string; clear: () => void } => Boolean(c))
  const activeCount = chips.length

  function reset<T>(set: (v: T) => void) {
    return (v: T) => { set(v); setPage(0) }
  }

  return (
    <div className="flex flex-col gap-4 pb-10">
      {/* Phone toolbar: search + filter button, period chips, active filters as removable chips */}
      <div className="lg:hidden flex flex-col gap-2">
        <div className="flex items-center gap-2">
          <div className="relative flex-1 min-w-0">
            <MagnifyingGlass size={18} className="absolute left-4 top-1/2 -translate-y-1/2 text-ink-faint pointer-events-none" />
            <input type="search" value={searchInput} onChange={(e) => setSearchInput(e.target.value)} placeholder="Ism yoki obyekt" aria-label="Qidirish"
              className="w-full h-11 pl-11 pr-4 rounded-full bg-surface-sunken text-base text-ink placeholder:text-ink-faint border border-transparent outline-none focus:border-line-focus" />
          </div>
          <button type="button" onClick={() => setFilterOpen(true)} aria-label="Filtrlar" aria-haspopup="dialog"
            className="relative size-11 shrink-0 rounded-full bg-surface-sunken text-ink flex items-center justify-center">
            <SlidersHorizontal size={20} />
            {activeCount > 0 && <span className="absolute -top-0.5 -right-0.5 min-w-5 h-5 px-1 rounded-full bg-accent text-ink-on-accent text-xs font-semibold tabular-nums flex items-center justify-center">{activeCount}</span>}
          </button>
        </div>
        <div className="flex gap-1.5 overflow-x-auto no-scrollbar -mx-4 px-4 sm:-mx-6 sm:px-6">
          {PERIODS.map((p) => (
            <button key={p.id} type="button" onClick={() => reset(setPeriod)(p.id)} aria-pressed={period === p.id}
              className={`shrink-0 h-9 px-3.5 rounded-full text-sm font-medium whitespace-nowrap transition-colors ${period === p.id ? "bg-accent text-ink-on-accent" : "bg-surface-sunken text-ink"}`}>
              {p.label}
            </button>
          ))}
          {chips.map((c) => (
            <button key={c.key} type="button" onClick={c.clear} aria-label={`${c.label} — olib tashlash`}
              className="shrink-0 h-9 pl-3.5 pr-2.5 rounded-full bg-mute-soft text-sm font-medium text-ink whitespace-nowrap inline-flex items-center gap-1.5">
              {c.label}<X size={12} weight="bold" className="text-ink-muted" />
            </button>
          ))}
        </div>
      </div>
      <Sheet open={filterOpen} onClose={() => setFilterOpen(false)} title="Filtrlar"
        footer={<>
          <button type="button" onClick={() => { clearAll(); setFilterOpen(false) }} disabled={!filtered}
            className="h-12 px-5 rounded-full bg-surface-sunken text-base font-medium text-ink disabled:text-ink-faint">Tozalash</button>
          <button type="button" onClick={() => setFilterOpen(false)}
            className="h-12 flex-1 rounded-full bg-accent text-ink-on-accent text-base font-semibold">Tayyor</button>
        </>}>
        <div className="flex flex-col gap-4">
          <label className="flex flex-col gap-1.5 text-sm font-medium text-ink-muted">Hodim
            <select value={actorId} onChange={(e) => reset(setActorId)(e.target.value)} className={sheetSelect}>
              <option value="">Barcha hodimlar</option>
              {users.map((u) => <option key={u.id} value={u.id}>{u.full_name}</option>)}
            </select>
          </label>
          <label className="flex flex-col gap-1.5 text-sm font-medium text-ink-muted">Bo'lim
            <select value={entity} onChange={(e) => reset(setEntity)(e.target.value as ActivityEntityType | "")} className={sheetSelect}>
              <option value="">Barcha bo'limlar</option>
              {(Object.keys(ENTITY_LABELS) as ActivityEntityType[]).map((k) => <option key={k} value={k}>{ENTITY_LABELS[k]}</option>)}
            </select>
          </label>
          <label className="flex flex-col gap-1.5 text-sm font-medium text-ink-muted">Amal
            <select value={action} onChange={(e) => reset(setAction)(e.target.value as ActivityAction | "")} className={sheetSelect}>
              <option value="">Barcha amallar</option>
              <option value="created">Yaratish</option>
              <option value="updated">Tahrirlash</option>
              <option value="deleted">O'chirish</option>
            </select>
          </label>
        </div>
      </Sheet>

      {/* Toolbar */}
      <div className="max-lg:hidden flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-1 w-full sm:w-auto overflow-x-auto no-scrollbar">
          {PERIODS.map((p) => (
            <button
              key={p.id}
              type="button"
              onClick={() => reset(setPeriod)(p.id)}
              aria-pressed={period === p.id}
              className={`shrink-0 whitespace-nowrap px-3 sm:px-3.5 h-control-md rounded-full text-base font-medium transition-colors ${period === p.id ? "bg-mute-soft text-ink" : "text-ink-muted hover:bg-mute-ghost-hover hover:text-ink"}`}
            >
              {p.label}
            </button>
          ))}
        </div>
        <div className="flex flex-wrap items-center gap-2 w-full sm:w-auto">
          <div className="relative w-full sm:w-auto">
            <MagnifyingGlass size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-ink-faint pointer-events-none" />
            <input
              type="search"
              value={searchInput}
              onChange={(e) => setSearchInput(e.target.value)}
              placeholder="Ism yoki obyekt bo'yicha"
              aria-label="Qidirish"
              className="w-full sm:w-64 h-control-md pl-9 pr-3 rounded-control bg-surface-sunken text-base text-ink placeholder:text-ink-faint border border-transparent outline-none focus:border-line-focus"
            />
          </div>
          <select value={actorId} onChange={(e) => reset(setActorId)(e.target.value)} aria-label="Hodim" className={selectCls}>
            <option value="">Barcha hodimlar</option>
            {users.map((u) => <option key={u.id} value={u.id}>{u.full_name}</option>)}
          </select>
          <select value={entity} onChange={(e) => reset(setEntity)(e.target.value as ActivityEntityType | "")} aria-label="Bo'lim" className={selectCls}>
            <option value="">Barcha bo'limlar</option>
            {(Object.keys(ENTITY_LABELS) as ActivityEntityType[]).map((k) => <option key={k} value={k}>{ENTITY_LABELS[k]}</option>)}
          </select>
          <select value={action} onChange={(e) => reset(setAction)(e.target.value as ActivityAction | "")} aria-label="Amal" className={selectCls}>
            <option value="">Barcha amallar</option>
            <option value="created">Yaratish</option>
            <option value="updated">Tahrirlash</option>
            <option value="deleted">O'chirish</option>
          </select>
          {filtered && (
            <button
              type="button"
              onClick={() => { setActorId(""); setEntity(""); setAction(""); setSearchInput(""); setPage(0) }}
              className="h-control-md px-3 shrink-0 whitespace-nowrap rounded-full text-base text-ink-muted hover:bg-mute-ghost-hover hover:text-ink transition-colors"
            >
              Tozalash
            </button>
          )}
        </div>
      </div>

      {/* Phone list: who · did what · object, the time on the right */}
      <div className="lg:hidden bg-surface-sunken rounded-surface overflow-hidden">
        {isLoading ? (
          <p className="px-4 py-12 text-center text-base text-ink-muted">Yuklanmoqda…</p>
        ) : items.length === 0 ? (
          <p className="px-4 py-12 text-center text-base text-ink-muted">{filtered ? "Filtrga mos amal topilmadi" : "Bu davrda amal bo'lmagan"}</p>
        ) : items.map((log) => {
          const [day, time] = whenParts(log.created_at)
          return (
            <button key={log.id} type="button" onClick={() => setOpenLog(log)}
              className="w-full min-h-16 px-4 py-3 flex items-center gap-3 text-left border-b border-line last:border-0 active:bg-mute-ghost-hover">
              <span className="relative shrink-0">
                <Avatar name={log.actor_name} url={log.actor_id ? avatars.get(log.actor_id) : null} size={40} />
                <span className={`absolute -bottom-0.5 -right-0.5 size-3.5 rounded-full border-2 border-surface-sunken ${ACTIONS[log.action].dot}`} />
              </span>
              <span className="flex-1 min-w-0">
                <span className="block text-base font-medium text-ink truncate">{log.actor_name ?? "Tizim"} <span className="font-normal text-ink-muted">{ACTIONS[log.action].label}</span></span>
                <span className="block text-sm text-ink-muted truncate">{ENTITY_LABELS[log.entity_type] ?? log.entity_type} · {log.entity_name ?? "—"}</span>
              </span>
              <span className="shrink-0 flex flex-col items-end text-sm tabular-nums leading-snug">
                <span className="text-ink whitespace-nowrap">{day}</span>
                <span className="text-ink-faint whitespace-nowrap">{time}</span>
              </span>
              <CaretRight size={16} className="shrink-0 text-ink-faint -ml-1" />
            </button>
          )
        })}
      </div>

      {/* Log table */}
      <div className={`${tbl.scroll} max-lg:hidden`}>
        <table className={tbl.table}>
          <thead>
            <tr>
              <th className={`${tbl.th} w-36`}>Vaqt</th>
              <th className={`${tbl.th} w-56`}>Hodim</th>
              <th className={`${tbl.th} w-36`}>Amal</th>
              <th className={tbl.th}>Obyekt</th>
              <th className={tbl.th}>O'zgarish</th>
            </tr>
          </thead>
          <tbody>
            {isLoading ? (
              <tr><td colSpan={5} className={tbl.empty}>Yuklanmoqda…</td></tr>
            ) : items.length === 0 ? (
              <tr><td colSpan={5} className={tbl.empty}>{filtered ? "Filtrga mos amal topilmadi" : "Bu davrda amal bo'lmagan"}</td></tr>
            ) : items.map((log) => {
              const changes = log.action === "updated" ? changesOf(log) : []
              const selected = openLog?.id === log.id
              const td = `${tbl.td} ${selected ? tbl.tdSelected : ""}`
              return (
                <tr key={log.id} className={`${tbl.tr} cursor-pointer`} onClick={() => setOpenLog(log)}>
                  <td className={`${td} text-ink-muted tabular-nums whitespace-nowrap`}>{when(log.created_at)}</td>
                  <td className={td}>
                    <span className="flex items-center gap-2.5 min-w-0">
                      <Avatar name={log.actor_name} url={log.actor_id ? avatars.get(log.actor_id) : null} />
                      <span className="truncate">{log.actor_name ?? "Tizim"}</span>
                    </span>
                  </td>
                  <td className={td}>
                    <span className="flex items-center gap-2 whitespace-nowrap">
                      <span className={`size-2 rounded-full ${ACTIONS[log.action].dot}`} />
                      {ACTIONS[log.action].label}
                    </span>
                  </td>
                  <td className={td}>
                    <span className="text-ink-muted">{ENTITY_LABELS[log.entity_type] ?? log.entity_type}</span>
                    <span className="text-ink-faint"> · </span>
                    <span>{log.entity_name ?? "—"}</span>
                  </td>
                  <td className={td}>
                    {log.action === "updated" ? (
                      changes.length === 0 ? <span className="text-ink-faint">Texnik yangilanish</span> : (
                        <span className="flex flex-wrap gap-1">
                          {changes.slice(0, 3).map((c) => (
                            <span key={c.key} className="px-2 py-0.5 rounded-item bg-surface-sunken text-sm text-ink-muted">{fieldLabel(c.key)}</span>
                          ))}
                          {changes.length > 3 && <span className="px-1 py-0.5 text-sm text-ink-faint">+{changes.length - 3}</span>}
                        </span>
                      )
                    ) : <span className="text-ink-faint">{log.action === "created" ? "Yangi yozuv" : "Yozuv o'chirildi"}</span>}
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>
      <Pager page={page} pageCount={Math.ceil(total / PAGE_SIZE)} total={total} onPage={setPage} />

      <LogDrawer log={openLog} onClose={() => setOpenLog(null)} avatarUrl={openLog?.actor_id ? avatars.get(openLog.actor_id) : null} />
    </div>
  )
}

function Avatar({ name, url, size }: { name: string | null; url: string | null | undefined; size?: number }) {
  return (
    <span className={`${size ? "" : "size-7 "}rounded-full flex-shrink-0 overflow-hidden bg-mute-soft flex items-center justify-center text-xs font-semibold text-ink-muted`}
      style={size ? { width: size, height: size } : undefined}>
      {url ? <img src={url} alt="" className="w-full h-full object-cover" /> : initials(name)}
    </span>
  )
}

// ─── Detail drawer ───────────────────────────────────────────────────────────

function LogDrawer({ log, onClose, avatarUrl }: { log: ActivityLog | null; onClose: () => void; avatarUrl: string | null | undefined }) {
  useEffect(() => {
    if (!log) return
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") onClose() }
    window.addEventListener("keydown", onKey)
    return () => window.removeEventListener("keydown", onKey)
  }, [log, onClose])

  const changes = log ? changesOf(log) : []
  const phone = useMedia("(width < 40rem)")
  const [kept, setKept] = useState(log)   // the sheet keeps its content while it slides out
  if (log && log !== kept) setKept(log)

  // A phone gets a bottom sheet; from sm up the side drawer stays as it was
  if (phone) {
    const shown = log ?? kept
    return (
      <Sheet open={Boolean(log)} onClose={onClose} title={shown ? `${shown.actor_name ?? "Tizim"} ${ACTIONS[shown.action].label}` : ""}>
        {shown && (
          <div className="flex flex-col gap-6">
            <p className="text-sm text-ink-muted">{ENTITY_LABELS[shown.entity_type] ?? shown.entity_type} · {shown.entity_name ?? "—"}</p>
            <LogBody log={shown} changes={changesOf(shown)} />
          </div>
        )}
      </Sheet>
    )
  }

  return (
    <AnimatePresence>
      {log && (
        <>
          <motion.div
            initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={{ duration: 0.2 }}
            className="fixed inset-0 bg-surface-overlay z-40"
            onClick={onClose}
          />
          <motion.aside
            role="dialog"
            aria-modal="true"
            aria-label="Amal tafsilotlari"
            initial={{ x: 460 }} animate={{ x: 0 }} exit={{ x: 460 }}
            transition={{ type: "spring", damping: 30, stiffness: 300 }}
            className="fixed top-0 right-0 bottom-0 w-[440px] max-w-full bg-surface-raised border-l border-line z-50 flex flex-col"
          >
            <div className="flex items-start gap-3 p-5 border-b border-line">
              <Avatar name={log.actor_name} url={avatarUrl} />
              <div className="flex-1 min-w-0">
                <p className="text-base font-semibold text-ink">
                  {log.actor_name ?? "Tizim"} {ACTIONS[log.action].label}
                </p>
                <p className="text-sm text-ink-muted truncate">
                  {ENTITY_LABELS[log.entity_type] ?? log.entity_type} · {log.entity_name ?? "—"}
                </p>
              </div>
              <button type="button" onClick={onClose} aria-label="Yopish" className="size-9 sm:size-8 shrink-0 -mt-1 -mr-1 rounded-item flex items-center justify-center text-ink-muted hover:bg-mute-ghost-hover transition-colors">
                <X size={18} />
              </button>
            </div>

            <div className="flex-1 overflow-y-auto no-scrollbar p-5 flex flex-col gap-6">
              <LogBody log={log} changes={changes} />
            </div>
          </motion.aside>
        </>
      )}
    </AnimatePresence>
  )
}

function LogBody({ log, changes }: { log: ActivityLog; changes: Change[] }) {
  return (
    <>
    <dl className="grid grid-cols-[88px_1fr] sm:grid-cols-[120px_1fr] gap-x-3 sm:gap-x-0 gap-y-2.5 text-base">
      <dt className="text-ink-muted">Vaqt</dt>
      <dd className="text-ink tabular-nums">
        {formatDate(log.created_at, "long")}, {new Date(log.created_at).toLocaleTimeString("uz-UZ")}
      </dd>
      <dt className="text-ink-muted">Hodim</dt>
      <dd className="text-ink min-w-0 break-words">{log.actor_name ?? "Tizim"}{log.actor_email && <span className="text-ink-muted"> · {log.actor_email}</span>}</dd>
      <dt className="text-ink-muted">Amal</dt>
      <dd className="text-ink flex items-center gap-2"><span className={`size-2 rounded-full ${ACTIONS[log.action].dot}`} />{ACTIONS[log.action].label}</dd>
      {log.description && <>
        <dt className="text-ink-muted">Tavsif</dt>
        <dd className="text-ink">{log.description}</dd>
      </>}
    </dl>

    <div className="flex flex-col gap-2">
      <h3 className="text-sm font-medium text-ink-muted">
        {log.action === "updated" ? "O'zgargan maydonlar" : log.action === "created" ? "Kiritilgan ma'lumotlar" : "O'chirilgan ma'lumotlar"}
      </h3>
      {changes.length === 0 ? (
        <p className="text-base text-ink-faint">Ko'rsatiladigan maydon yo'q (texnik yangilanish)</p>
      ) : (
        <div className="flex flex-col">
          {changes.map((c) => (
            <div key={c.key} className="py-2.5 border-b border-line last:border-0">
              <p className="text-sm text-ink-muted mb-1">{fieldLabel(c.key)}</p>
              {log.action === "updated" ? (
                <div className="flex items-start gap-2 text-base min-w-0">
                  <span className="text-danger-text line-through break-all">{formatValue(c.before)}</span>
                  <ArrowRight size={16} className="text-ink-faint flex-shrink-0 mt-0.5" />
                  <span className="text-success-text break-all">{formatValue(c.after)}</span>
                </div>
              ) : (
                <p className={`text-base break-all ${log.action === "deleted" ? "text-ink-muted" : "text-ink"}`}>
                  {formatValue(log.action === "created" ? c.after : c.before)}
                </p>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
    </>
  )
}
