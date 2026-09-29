import { useId, useState } from "react"
import { motion } from "framer-motion"
import { Plus, Trash, X, TelegramLogo } from "@phosphor-icons/react"
import { useDialog } from "@/hooks/useDialog"
import { tbl } from "@/components/ui/table"
import { Pager, usePaged } from "@/components/ui/Pager"
import { useTelegramGroups, useAddTelegramGroup, useUpdateTelegramGroup, useDeleteTelegramGroup } from "@/hooks/useIntegrations"
import { GROUP_ROLES, type GroupRole, type TelegramGroup } from "@/lib/supabase/queries/integrations"

const BOT = "@fymoliyabot"
const inputCls = "w-full h-control-md border border-line rounded-control px-3 text-base text-ink bg-surface placeholder:text-ink-faint focus:outline-none focus:border-line-focus transition-colors"
const primaryBtn = "flex items-center gap-2 px-4 h-control-md rounded-full bg-accent text-ink-on-accent text-base font-medium hover:bg-accent-hover transition-colors disabled:opacity-40 disabled:pointer-events-none"
const softBtn = "flex items-center gap-2 px-3.5 h-control-md rounded-full bg-mute-soft text-base font-medium text-ink hover:bg-mute-soft-hover transition-colors disabled:opacity-50"

// Group avatars: the same data palette as Vazifalar, as a wash under ink initials
const PALETTE = ["#7F77DD", "#1D9E75", "#D85A30", "#D4537E", "#378ADD", "#BA7517", "#639922"]
const hash = (s: string) => [...s].reduce((h, c) => (h * 31 + c.charCodeAt(0)) | 0, 0) >>> 0
const initials = (s: string) => s.replace(/[^\p{L}\p{N} ]/gu, " ").trim().split(/\s+/).slice(0, 2).map((w) => w[0]?.toUpperCase() ?? "").join("") || "TG"
const isGone = (g: TelegramGroup) => g.bot_status === "left" || g.bot_status === "kicked"

/** Sozlamalar → Integratsiyalar: a matrix — groups down, the bot's five jobs across */
export function Integratsiyalar() {
  const { data: groups = [], isLoading, error } = useTelegramGroups()
  const { page, setPage, pageCount, pageItems } = usePaged(groups)
  const [openId, setOpenId] = useState<number | null>(null)
  const [adding, setAdding] = useState(false)
  const open = groups.find((g) => g.chat_id === openId)

  return (
    <div className="flex flex-col gap-5 pb-10">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div className="flex flex-col gap-1">
          <h2 className="text-md font-semibold text-ink">
            Telegram guruhlar {groups.length > 0 && <span className="text-ink-faint font-medium tabular-nums">· {groups.length}</span>}
          </h2>
          <p className="text-sm text-ink-muted">{BOT} ni guruhga qo'shing — u shu ro'yxatga o'zi tushadi. Har bir xabar faqat yoqilgan guruhlarga boradi.</p>
        </div>
        <button type="button" onClick={() => setAdding(true)} className={primaryBtn}>
          <Plus size={16} /> Guruh qo'shish
        </button>
      </div>

      <div className={tbl.scroll}>
        <table className={tbl.table}>
          <thead>
            <tr>
              <th className={tbl.th}>Guruh</th>
              {GROUP_ROLES.map((r) => <th key={r.id} className={`${tbl.th} text-center`} title={r.desc}>{r.short}</th>)}
            </tr>
          </thead>
          <tbody>
            {isLoading ? (
              <tr><td colSpan={6} className={tbl.empty}>Yuklanmoqda…</td></tr>
            ) : error ? (
              <tr><td colSpan={6} className={`${tbl.empty} text-danger-text`}>{error.message}</td></tr>
            ) : groups.length === 0 ? (
              <tr><td colSpan={6} className={tbl.empty}><EmptySteps /></td></tr>
            ) : pageItems.map((g) => <GroupRow key={g.chat_id} group={g} onOpen={() => setOpenId(g.chat_id)} />)}
          </tbody>
        </table>
      </div>
      <Pager page={page} pageCount={pageCount} total={groups.length} onPage={setPage} />

      {open && <GroupModal group={open} onClose={() => setOpenId(null)} />}
      {adding && <AddModal onClose={() => setAdding(false)} />}
    </div>
  )
}

function GroupAvatar({ g }: { g: TelegramGroup }) {
  const c = PALETTE[hash(String(g.chat_id)) % PALETTE.length]
  return (
    <span className={`size-9 shrink-0 rounded-full flex items-center justify-center text-sm font-semibold text-ink ${isGone(g) ? "opacity-40" : ""}`}
      style={{ backgroundColor: `${c}33` }}>
      {initials(g.title)}
    </span>
  )
}

/** The note, or what needs attention: bot removed / nothing switched on */
function GroupHint({ g }: { g: TelegramGroup }) {
  if (isGone(g)) return <span className="text-sm text-danger-text">Bot guruhdan chiqarilgan</span>
  if (!GROUP_ROLES.some((r) => g[r.id])) return <span className="text-sm text-warning-dark">Sozlanmagan — ishlarni yoqing</span>
  return <span className="text-sm text-ink-muted truncate">{g.note || "Izoh yo'q"}</span>
}

function GroupRow({ group: g, onOpen }: { group: TelegramGroup; onOpen: () => void }) {
  const update = useUpdateTelegramGroup()
  return (
    <tr className={`${tbl.tr} cursor-pointer`} onClick={onOpen}>
      <td className={tbl.td}>
        <div className="flex items-center gap-3 min-w-[240px] max-w-[360px]">
          <GroupAvatar g={g} />
          <div className="min-w-0 flex flex-col">
            <span className="font-medium text-ink truncate">{g.title || "Nomsiz guruh"}</span>
            <GroupHint g={g} />
          </div>
        </div>
      </td>
      {GROUP_ROLES.map((r) => (
        <td key={r.id} className={`${tbl.td} text-center`}>
          <Switch on={g[r.id]} label={`${g.title}: ${r.label}`} onChange={(v) => update.mutate({ chatId: g.chat_id, patch: { [r.id]: v } })} />
        </td>
      ))}
    </tr>
  )
}

function Switch({ on, label, onChange }: { on: boolean; label: string; onChange: (v: boolean) => void }) {
  return (
    <button type="button" role="switch" aria-checked={on} aria-label={label}
      onClick={(e) => { e.stopPropagation(); onChange(!on) }}
      className={`relative inline-flex h-5 w-9 shrink-0 rounded-full transition-colors ${on ? "bg-[var(--switch-on)]" : "bg-mute-soft-hover"}`}>
      <span className={`absolute top-0.5 size-4 rounded-full bg-surface transition-all ${on ? "left-[18px]" : "left-0.5"}`} />
    </button>
  )
}

function EmptySteps() {
  return (
    <div className="flex flex-col items-center gap-3">
      <TelegramLogo size={32} weight="thin" className="text-ink-muted" />
      <span className="text-base text-ink">Hali guruh yo'q</span>
      <ol className="text-sm text-ink-muted text-left list-decimal pl-5 flex flex-col gap-1">
        <li>{BOT} ni Telegram guruhiga qo'shing</li>
        <li>Guruh shu jadvalda o'zi paydo bo'ladi</li>
        <li>Bot u yerda nima qilishini kalitlar bilan yoqing</li>
      </ol>
    </div>
  )
}

/** Centred modal shell, like the Vazifalar task modal */
function Modal({ title, onClose, children, footer }: { title: string; onClose: () => void; children: React.ReactNode; footer: React.ReactNode }) {
  const headingId = useId()
  const ref = useDialog<HTMLDivElement>(onClose, true)
  return (
    <div className="fixed inset-0 z-[100] flex items-start justify-center p-4 pt-[10vh]">
      <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} onClick={onClose} className="absolute inset-0 bg-surface-overlay backdrop-blur-sm" />
      <motion.div ref={ref} role="dialog" aria-modal="true" aria-labelledby={headingId} tabIndex={-1}
        initial={{ scale: 0.97, opacity: 0, y: 12 }} animate={{ scale: 1, opacity: 1, y: 0 }}
        className="relative w-full max-w-lg bg-surface-raised rounded-overlay flex flex-col max-h-[84vh]">
        <div className="flex items-center justify-between px-5 h-14 border-b border-line shrink-0">
          <h3 id={headingId} className="text-base font-semibold text-ink">{title}</h3>
          <button type="button" onClick={onClose} aria-label="Yopish" className="p-1.5 rounded-item hover:bg-mute-ghost-hover transition-colors">
            <X size={20} className="text-ink-muted" />
          </button>
        </div>
        <div className="flex-1 min-h-0 overflow-y-auto px-5 py-5 flex flex-col gap-5">{children}</div>
        <div className="flex items-center gap-2 px-5 py-3 border-t border-line shrink-0">{footer}</div>
      </motion.div>
    </div>
  )
}

function GroupModal({ group: g, onClose }: { group: TelegramGroup; onClose: () => void }) {
  const update = useUpdateTelegramGroup()
  const remove = useDeleteTelegramGroup()
  const [title, setTitle] = useState(g.title)
  const [note, setNote] = useState(g.note)
  const save = (patch: Partial<TelegramGroup>) => update.mutate({ chatId: g.chat_id, patch })
  const status = isGone(g) ? "Bot guruhdan chiqarilgan" : g.bot_status === "administrator" ? "Bot admin" : g.bot_status ? "Bot a'zo" : "Qo'lda qo'shilgan"

  return (
    <Modal title="Guruh sozlamalari" onClose={onClose} footer={<>
      <button type="button" disabled={remove.isPending}
        onClick={() => window.confirm(`"${g.title || g.chat_id}" ro'yxatdan olib tashlansinmi? Bot bu guruhga boshqa yozmaydi.`) && remove.mutate(g.chat_id, { onSuccess: onClose })}
        className="flex items-center gap-2 px-3 h-control-md rounded-full text-base font-medium text-danger-text hover:bg-danger-soft transition-colors">
        <Trash size={16} /> Olib tashlash
      </button>
      <div className="flex-1" />
      <button type="button" onClick={onClose} className={softBtn}>Tayyor</button>
    </>}>
      <div className="flex items-center gap-3">
        <GroupAvatar g={g} />
        <div className="min-w-0 flex-1 flex flex-col gap-1">
          <input value={title} onChange={(e) => setTitle(e.target.value)} aria-label="Guruh nomi"
            onBlur={() => title.trim() && title.trim() !== g.title ? save({ title: title.trim() }) : setTitle(g.title)}
            className="w-full bg-transparent text-md font-semibold text-ink rounded-control -mx-1 px-1 hover:bg-mute-ghost-hover focus:bg-transparent focus:outline-none" />
          <span className="text-sm text-ink-faint tabular-nums">{g.chat_id} · {status}</span>
        </div>
      </div>

      <label className="flex flex-col gap-1.5">
        <span className="text-sm font-medium text-ink-muted">Izoh — bot bu guruhda nima uchun turibdi</span>
        <textarea value={note} rows={2} onChange={(e) => setNote(e.target.value)}
          onBlur={() => note.trim() !== g.note && save({ note: note.trim() })}
          placeholder="Masalan: Moliya jamoasi — faqat to'lovlar va xarajatlar"
          className="w-full resize-none border border-line rounded-control px-3 py-2 text-base text-ink bg-surface placeholder:text-ink-faint focus:outline-none focus:border-line-focus transition-colors" />
      </label>

      <div className="flex flex-col rounded-surface bg-surface-sunken">
        {GROUP_ROLES.map((r, i) => (
          <label key={r.id} className={`flex items-center gap-4 px-4 py-3 cursor-pointer ${i ? "border-t border-line" : ""}`}>
            <span className="flex-1 flex flex-col">
              <span className="text-base font-medium text-ink">{r.label}</span>
              <span className="text-sm text-ink-muted">{r.desc}</span>
            </span>
            <Switch on={g[r.id as GroupRole]} label={r.label} onChange={(v) => save({ [r.id]: v })} />
          </label>
        ))}
      </div>
    </Modal>
  )
}

function AddModal({ onClose }: { onClose: () => void }) {
  const add = useAddTelegramGroup()
  const [id, setId] = useState("")
  const [title, setTitle] = useState("")
  const [note, setNote] = useState("")
  const valid = /^-\d{5,}$/.test(id.trim()) && title.trim().length > 0
  const submit = () => valid && add.mutate({ chat_id: Number(id.trim()), title: title.trim(), note: note.trim() }, { onSuccess: onClose })

  return (
    <Modal title="Guruh qo'shish" onClose={onClose} footer={<>
      <div className="flex-1" />
      <button type="button" onClick={onClose} className={softBtn}>Bekor qilish</button>
      <button type="button" onClick={submit} disabled={!valid || add.isPending} className={primaryBtn}>{add.isPending ? "Saqlanmoqda…" : "Qo'shish"}</button>
    </>}>
      <p className="text-sm text-ink-muted leading-relaxed p-3 rounded-control bg-surface-sunken">
        Eng osoni — {BOT} ni guruhga qo'shing: guruh jadvalga o'zi tushadi, ID kiritish shart emas. Qo'lda qo'shish faqat bot allaqachon guruhda bo'lsa kerak.
      </p>
      <form className="flex flex-col gap-4" onSubmit={(e) => { e.preventDefault(); submit() }}>
        <label className="flex flex-col gap-1.5">
          <span className="text-sm font-medium text-ink-muted">Guruh ID si</span>
          <input autoFocus value={id} onChange={(e) => setId(e.target.value)} placeholder="-1003022982993" inputMode="numeric" className={inputCls} />
          <span className="text-sm text-ink-faint">Minus bilan boshlanadi</span>
        </label>
        <label className="flex flex-col gap-1.5">
          <span className="text-sm font-medium text-ink-muted">Nomi</span>
          <input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Moliya jamoasi" className={inputCls} />
        </label>
        <label className="flex flex-col gap-1.5">
          <span className="text-sm font-medium text-ink-muted">Izoh</span>
          <input value={note} onChange={(e) => setNote(e.target.value)} placeholder="Bot bu guruhda nima qiladi" className={inputCls} />
        </label>
        {add.error && <p role="alert" className="text-sm font-medium text-danger-text">{add.error.message}</p>}
        <button type="submit" hidden />
      </form>
    </Modal>
  )
}
