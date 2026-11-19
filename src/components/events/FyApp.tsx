// The FY members' app (105) on the event page: whether the app got the event and who signed up there.
// The sign-up list and the announcement form are shared with the Ilova page.
import { useState } from "react"
import { useQuery, useQueryClient } from "@tanstack/react-query"
import { DeviceMobile, UsersThree } from "@phosphor-icons/react"
import { Sheet } from "@/components/ui/Sheet"
import { toast } from "@/lib/toast"
import { confirmAction } from "@/lib/confirm"
import { formatPhone } from "@/lib/format"
import { getFyPush, getFyRegistrations, sendFyAnnouncement, type FyPush } from "@/lib/supabase/queries/fyApp"
import type { Event } from "@/lib/supabase/queries/events"

export const FY_PUSH_KEY = ["fy-push"] as const
export const FY_ANN_KEY = ["fy-announcements"] as const
export const FY_OVERVIEW_KEY = ["fy-overview"] as const

const pill = "flex items-center gap-1.5 px-3 h-control-md rounded-full whitespace-nowrap shrink-0 text-base font-medium text-ink bg-mute-soft hover:bg-mute-soft-hover transition-colors"

function pushText(p: FyPush | null | undefined): { text: string; tone: string } {
  if (!p || p.status === "pending") return { text: "Ilovaga yuborilmoqda…", tone: "text-ink-muted" }
  if (p.status === "sent") return { text: "Ilovada ko'rinadi", tone: "text-success-text" }
  return { text: `Ilovaga yuborilmadi: ${p.response ?? "xato"}`, tone: "text-danger-text" }
}

export function FyAppStrip({ event }: { event: Event }) {
  const [listOpen, setListOpen] = useState(false)
  const { data: push } = useQuery({
    queryKey: [...FY_PUSH_KEY, event.id],
    queryFn: () => getFyPush(event.id),
    enabled: event.show_in_app,
    // the worker sends every 30 s: look again until it has
    refetchInterval: (q) => (q.state.data?.status === "sent" || q.state.data?.status === "failed" ? false : 10_000),
  })
  if (!event.show_in_app) return null
  const s = pushText(push)

  return (
    <div className="flex flex-wrap items-center gap-2 px-1">
      <span className={`flex items-center gap-1.5 text-sm min-w-0 mr-auto ${s.tone}`}>
        <DeviceMobile size={16} className="shrink-0" /><span className="truncate">{s.text}</span>
      </span>
      <button type="button" onClick={() => setListOpen(true)} className={pill}>
        <UsersThree size={16} /> Ilovadagi ro'yxat
      </button>
      <RegistrationsSheet event={event} open={listOpen} onClose={() => setListOpen(false)} />
    </div>
  )
}

export function RegistrationsSheet({ event, open, onClose }: { event: Event; open: boolean; onClose: () => void }) {
  const { data = [], isLoading, error } = useQuery({
    queryKey: ["fy-registrations", event.id],
    queryFn: () => getFyRegistrations(event.id),
    enabled: open,
    staleTime: 0,
  })
  return (
    <Sheet open={open} onClose={onClose} title="Ilovadagi ro'yxat">
      {isLoading ? (
        <p className="py-8 text-center text-base text-ink-muted">Yuklanmoqda…</p>
      ) : error ? (
        <p className="py-8 text-center text-base text-danger-text">{error instanceof Error ? error.message : "Xato"}</p>
      ) : data.length === 0 ? (
        <p className="py-8 text-center text-base text-ink-muted">Ilovada hali hech kim yozilmagan</p>
      ) : (
        <div className="flex flex-col gap-2">
          <p className="text-sm text-ink-muted">
            Yozilgan: {data.filter((r) => r.status === "registered").length} · Ariza (to'lov kutilmoqda): {data.filter((r) => r.status === "applied").length}
          </p>
          <div className="rounded-surface bg-surface-sunken overflow-hidden">
            {data.map((r) => (
              <div key={`${r.phone}-${r.createdAt}`} className="min-h-14 px-4 py-2 flex items-center justify-between gap-3 border-b border-line last:border-0">
                <span className="flex flex-col min-w-0">
                  <span className="text-base text-ink truncate">{r.name || "—"}</span>
                  <span className="text-sm text-ink-muted tabular-nums">{formatPhone(r.phone)}</span>
                </span>
                <span className={`text-sm whitespace-nowrap shrink-0 ${r.status === "registered" ? "text-success-text" : "text-ink-muted"}`}>
                  {r.status === "registered" ? "Yozilgan" : "Ariza"}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}
    </Sheet>
  )
}

export function AnnounceSheet({ open, onClose }: { open: boolean; onClose: () => void }) {
  const qc = useQueryClient()
  const [text, setText] = useState("")
  const [sending, setSending] = useState(false)
  async function send() {
    if (!text.trim() || sending) return
    if (!(await confirmAction({ title: "E'lonni yuborish", message: "E'lon ilovadagi har bir a'zoga boradi va qaytarib olinmaydi. Yuborilsinmi?", confirmLabel: "Yuborish" }))) return
    setSending(true)
    try {
      const { sent } = await sendFyAnnouncement(text.trim(), "/")
      toast.success("E'lon yuborildi", `${sent} ta a'zoga`)
      void qc.invalidateQueries({ queryKey: FY_ANN_KEY })
      setText("")
      onClose()
    } catch (err) {
      toast.error("E'lon yuborilmadi", err instanceof Error ? err.message : undefined)
    } finally {
      setSending(false)
    }
  }
  return (
    <Sheet open={open} onClose={onClose} title="Ilovaga e'lon"
      footer={
        <button type="button" onClick={() => void send()} disabled={!text.trim() || sending}
          className="w-full h-12 sm:h-control-md rounded-full bg-accent text-ink-on-accent text-base font-semibold hover:bg-accent-hover disabled:opacity-50 transition-colors">
          {sending ? "Yuborilmoqda…" : "Hamma a'zoga yuborish"}
        </button>
      }>
      <div className="flex flex-col gap-2">
        <textarea value={text} onChange={(e) => setText(e.target.value.slice(0, 500))} rows={5} autoFocus
          placeholder="Masalan: 1-dekabr Biznes nonushtasiga ro'yxat ochildi"
          className="w-full border border-line rounded-control px-3 py-2 text-base text-ink placeholder:text-ink-faint focus:outline-none focus:border-line-focus resize-y" />
        <span className="text-xs text-ink-muted text-right tabular-nums">{text.length} / 500</span>
        <p className="text-sm text-ink-muted">Ilovadagi har bir a'zoga bildirishnoma bo'lib boradi. Qaytarib bo'lmaydi.</p>
      </div>
    </Sheet>
  )
}
