import { useState } from "react"
import { Plus, Trash, TelegramLogo } from "@phosphor-icons/react"
import { StatusBadge } from "@/components/ui/StatusBadge"
import { useTelegramGroups, useAddTelegramGroup, useUpdateTelegramGroup, useDeleteTelegramGroup } from "@/hooks/useIntegrations"
import { GROUP_ROLES, type TelegramGroup } from "@/lib/supabase/queries/integrations"

const BOT = "@fymoliyabot"
const inputCls = "w-full h-control-md border border-line rounded-control px-3 text-base text-ink bg-surface placeholder:text-ink-faint focus:outline-none focus:border-line-focus transition-colors"
const softBtn = "flex items-center gap-2 px-3.5 h-control-md rounded-control bg-mute-soft text-base font-medium text-ink hover:bg-mute-soft-hover transition-colors disabled:opacity-50"
const primaryBtn = "px-4 h-control-md rounded-control bg-accent text-ink-on-accent text-base font-medium hover:bg-accent-hover transition-colors disabled:opacity-40 disabled:pointer-events-none"

/** Sozlamalar → Integratsiyalar: which Telegram groups the bot serves and what it does in each */
export function Integratsiyalar() {
  const { data: groups = [], isLoading, error } = useTelegramGroups()
  const [adding, setAdding] = useState(false)

  return (
    <div className="flex flex-col gap-5 pb-10 max-w-[960px]">
      <div className="flex flex-wrap items-start justify-between gap-4 p-5 rounded-surface bg-surface-sunken">
        <div className="flex gap-3 max-w-xl">
          <TelegramLogo size={28} weight="light" className="shrink-0 text-info-text" />
          <div className="flex flex-col gap-1">
            <h2 className="text-base font-semibold text-ink">Telegram guruhlar</h2>
            <p className="text-sm text-ink-muted leading-relaxed">
              {BOT} ni kerakli guruhga qo'shing — guruh shu ro'yxatda o'zi paydo bo'ladi. Keyin bot u yerda nima qilishini belgilang: har bir xabar faqat belgilangan guruhlarga boradi.
            </p>
          </div>
        </div>
        {!adding && (
          <button type="button" onClick={() => setAdding(true)} className={softBtn}>
            <Plus size={16} /> Qo'lda qo'shish
          </button>
        )}
      </div>

      {adding && <AddGroup onDone={() => setAdding(false)} />}

      {isLoading ? (
        <p className="text-base text-ink-muted">Yuklanmoqda…</p>
      ) : error ? (
        <p role="alert" className="text-base text-danger-text">{error.message}</p>
      ) : groups.length === 0 ? (
        <p className="px-5 py-10 text-center text-base text-ink-muted rounded-surface bg-surface-sunken">
          Hali guruh yo'q. {BOT} ni guruhga qo'shing yoki guruh ID sini qo'lda kiriting.
        </p>
      ) : (
        groups.map((g) => <GroupCard key={g.chat_id} group={g} />)
      )}
    </div>
  )
}

function GroupCard({ group: g }: { group: TelegramGroup }) {
  const update = useUpdateTelegramGroup()
  const remove = useDeleteTelegramGroup()
  const [note, setNote] = useState(g.note)
  const gone = g.bot_status === "left" || g.bot_status === "kicked"
  const on = GROUP_ROLES.filter((r) => g[r.id]).length

  return (
    <section className="flex flex-col gap-4 p-5 rounded-surface bg-surface-sunken">
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
        <h3 className="text-base font-semibold text-ink">{g.title || "Nomsiz guruh"}</h3>
        <span className="text-sm text-ink-faint tabular-nums">{g.chat_id}</span>
        {gone ? <StatusBadge label="Bot guruhdan chiqarilgan" variant="danger" />
          : on === 0 ? <StatusBadge label="Sozlanmagan" variant="warning" />
          : <StatusBadge label={`${on} ta vazifa`} variant="success" />}
        <button type="button" aria-label="Ro'yxatdan olib tashlash" title="Ro'yxatdan olib tashlash"
          onClick={() => window.confirm(`"${g.title || g.chat_id}" ro'yxatdan olib tashlansinmi? Bot bu guruhga boshqa yozmaydi.`) && remove.mutate(g.chat_id)}
          className="ml-auto p-1.5 rounded-item text-ink-muted hover:text-danger-text hover:bg-danger-soft transition-colors">
          <Trash size={18} />
        </button>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2">
        {GROUP_ROLES.map((r) => (
          <label key={r.id} className="flex items-start gap-3 p-3 rounded-control bg-surface cursor-pointer select-none">
            <input type="checkbox" checked={g[r.id]} onChange={(e) => update.mutate({ chatId: g.chat_id, patch: { [r.id]: e.target.checked } })}
              className="mt-0.5 size-4 shrink-0 accent-[var(--ds-color-bg-inverted)]" />
            <span className="flex flex-col">
              <span className="text-base font-medium text-ink">{r.label}</span>
              <span className="text-sm text-ink-muted">{r.desc}</span>
            </span>
          </label>
        ))}
      </div>

      <label className="flex flex-col gap-1.5">
        <span className="text-sm font-medium text-ink-muted">Izoh — bot bu guruhda nima uchun turibdi</span>
        <textarea value={note} rows={2} onChange={(e) => setNote(e.target.value)}
          onBlur={() => note.trim() !== g.note && update.mutate({ chatId: g.chat_id, patch: { note: note.trim() } })}
          placeholder="Masalan: Moliya jamoasi — faqat to'lovlar va xarajatlar"
          className="w-full resize-none border border-line rounded-control px-3 py-2 text-base text-ink bg-surface placeholder:text-ink-faint focus:outline-none focus:border-line-focus transition-colors" />
      </label>
    </section>
  )
}

function AddGroup({ onDone }: { onDone: () => void }) {
  const add = useAddTelegramGroup()
  const [id, setId] = useState("")
  const [title, setTitle] = useState("")
  const [note, setNote] = useState("")
  const chatId = Number(id.trim())
  const valid = /^-\d{5,}$/.test(id.trim()) && title.trim().length > 0

  return (
    <form className="flex flex-col gap-3 p-5 rounded-surface bg-surface-sunken"
      onSubmit={(e) => { e.preventDefault(); if (valid) add.mutate({ chat_id: chatId, title: title.trim(), note: note.trim() }, { onSuccess: onDone }) }}>
      <h3 className="text-base font-semibold text-ink">Guruhni qo'lda qo'shish</h3>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <label className="flex flex-col gap-1.5">
          <span className="text-sm font-medium text-ink-muted">Guruh ID si</span>
          <input autoFocus value={id} onChange={(e) => setId(e.target.value)} placeholder="-1003022982993" inputMode="numeric" className={inputCls} />
        </label>
        <label className="flex flex-col gap-1.5">
          <span className="text-sm font-medium text-ink-muted">Nomi</span>
          <input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Moliya jamoasi" className={inputCls} />
        </label>
      </div>
      <label className="flex flex-col gap-1.5">
        <span className="text-sm font-medium text-ink-muted">Izoh</span>
        <input value={note} onChange={(e) => setNote(e.target.value)} placeholder="Bot bu guruhda nima qiladi" className={inputCls} />
      </label>
      <p className="text-sm text-ink-muted">ID minus bilan boshlanadi. Botni guruhga qo'shsangiz, ID ni kiritish shart emas — guruh o'zi paydo bo'ladi.</p>
      {add.error && <p role="alert" className="text-sm font-medium text-danger-text">{add.error.message}</p>}
      <div className="flex gap-2">
        <button type="submit" disabled={!valid || add.isPending} className={primaryBtn}>{add.isPending ? "Saqlanmoqda…" : "Qo'shish"}</button>
        <button type="button" onClick={onDone} className={softBtn}>Bekor qilish</button>
      </div>
    </form>
  )
}
