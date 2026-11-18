// Integratsiyalar bento (2026-11-18, third pass after the owner called the first bento raw): every tile is a
// small live view of the integration itself — recent Telegram chats, leads per source as bars, the groups × jobs
// matrix, the phone lines, the anketa QR — not an icon with a number. Presentational: the page feeds it data, so
// it can be looked at with fixtures. Flat app style: sunken tiles, white inner panels, hairlines, no shadows.
import { useEffect, useState, type ReactNode } from "react"
import QRCode from "qrcode"
import { ArrowUpRight, Copy, Funnel, IdentificationCard, Phone, QrCode, TelegramLogo, UsersThree, type Icon } from "@phosphor-icons/react"
import { TgAvatar } from "@/components/telegram/TgAvatar"
import { dayLabel, type TgInboxRow } from "@/lib/telegram"
import { tashkentToday } from "@/lib/period"
import { formatPhone } from "@/lib/format"
import type { TgAccount } from "@/lib/supabase/queries/telegram"
import { GROUP_ROLES, type GroupRole, type LeadSource, type PbxExt, type TelegramGroup } from "@/lib/supabase/queries/integrations"

export type TileId = "telegram" | "leads" | "phone" | "anketa" | "groups"
export type BentoData = {
  accounts?: TgAccount[]; chats?: TgInboxRow[]; templates?: number
  sources?: LeadSource[]
  exts?: PbxExt[]; extsError?: boolean; owners?: { pbx_ext?: string | null; full_name: string; avatar_url?: string | null }[]
  anketaUrl?: string
  groups?: TelegramGroup[]
}

const clock = (iso: string) => new Intl.DateTimeFormat("en-GB", { timeZone: "Asia/Tashkent", hour: "2-digit", minute: "2-digit" }).format(new Date(iso))
const ROLE_SHORT: Record<GroupRole, string> = { payments: "To'lov", expenses: "Xarajat", task_digest: "Hisobot", task_reminders: "Eslatma", task_bot: "Vazifa", missed_calls: "Qo'ng'iroq" }
// Lead sources as data colours (the app's data palette)
const SOURCE_COLOR: Record<string, string> = { sayt: "#7F77DD", call: "#1D9E75", telegram: "#2AABEE", meta: "#378ADD", tilda: "#D85A30", framer: "#D4537E" }
const isGone = (g: TelegramGroup) => g.bot_status === "left" || g.bot_status === "kicked"

export function IntegrationsBento({ data, admin, anketa, onOpen, onInbox, onCopy }: {
  data: BentoData; admin: boolean; anketa: boolean; onOpen: (id: TileId) => void; onInbox: () => void; onCopy: (url: string) => void
}) {
  return (
    <div className="grid gap-3 grid-cols-1 md:grid-cols-2 xl:grid-cols-12 xl:grid-rows-[236px_236px_208px]">
      {admin && <TelegramTile data={data} onOpen={() => onOpen("telegram")} onInbox={onInbox} />}
      {admin && <LeadsTile sources={data.sources} onOpen={() => onOpen("leads")} />}
      <GroupsTile groups={data.groups} onOpen={() => onOpen("groups")} className={admin ? "md:col-span-2 xl:col-span-7" : anketa ? "md:col-span-2 xl:col-span-7" : "md:col-span-2 xl:col-span-12"} />
      {admin && <PhoneTile data={data} onOpen={() => onOpen("phone")} />}
      {anketa && <AnketaTile url={data.anketaUrl} onOpen={() => onOpen("anketa")} onCopy={onCopy} className={admin ? "xl:col-span-7" : "md:col-span-2 xl:col-span-5"} />}
    </div>
  )
}

// ─── Shell ───────────────────────────────────────────────────────────────────

type Tone = "ok" | "warn" | "bad" | "off"
const DOT: Record<Tone, string> = { ok: "bg-success", warn: "bg-warning", bad: "bg-danger", off: "bg-mute-soft-hover" }
const Dot = ({ tone }: { tone: Tone }) => <span className={`size-2 rounded-full shrink-0 ${DOT[tone]}`} />

/** A div, not a button: tiles hold their own controls (copy, "Barchasi") */
function Tile({ icon: I, iconClass = "text-ink-muted", title, status, onOpen, className = "", children }: {
  icon: Icon; iconClass?: string; title: string; status?: { tone: Tone; text: string }; onOpen: () => void; className?: string; children: ReactNode
}) {
  return (
    <section role="button" tabIndex={0} aria-label={`${title} — sozlash`} onClick={onOpen}
      onKeyDown={(e) => { if (e.key === "Enter" && e.target === e.currentTarget) onOpen() }}
      className={`group relative flex flex-col gap-4 min-w-0 p-5 rounded-overlay bg-surface-sunken cursor-pointer outline-none focus-visible:ring-2 focus-visible:ring-line-focus ${className}`}>
      <header className="flex items-center gap-2 min-w-0 h-8 shrink-0">
        <I size={20} className={`shrink-0 ${iconClass}`} />
        <h2 className="text-base font-semibold text-ink truncate">{title}</h2>
        {status && <span className="ml-1 h-6 px-2 shrink-0 inline-flex items-center gap-1.5 rounded-full bg-surface text-xs font-medium text-ink-muted whitespace-nowrap"><Dot tone={status.tone} />{status.text}</span>}
        <span aria-hidden className="ml-auto size-8 shrink-0 rounded-full bg-surface text-ink-muted flex items-center justify-center transition-colors group-hover:bg-accent group-hover:text-ink-on-accent">
          <ArrowUpRight size={16} />
        </span>
      </header>
      <div className="flex-1 min-h-0 min-w-0 flex flex-col">{children}</div>
    </section>
  )
}

const Bars = ({ n }: { n: number }) => <div className="flex flex-col gap-2.5 animate-pulse">{Array.from({ length: n }, (_, i) => <span key={i} className="h-3 rounded-full bg-surface" style={{ width: `${88 - i * 14}%` }} />)}</div>

// ─── Telegram: the account and its latest chats ──────────────────────────────

function TelegramTile({ data, onOpen, onInbox }: { data: BentoData; onOpen: () => void; onInbox: () => void }) {
  const { accounts, chats = [], templates = 0 } = data
  const active = accounts?.filter((a) => a.status === "active") ?? []
  const account = active[0] ?? accounts?.[0]
  const waiting = chats.filter((c) => c.unread > 0).length
  const today = tashkentToday()
  const when = (iso: string | null) => !iso ? "" : dayLabel(iso, today) === "Bugun" ? clock(iso) : dayLabel(iso, today)
  const status = !accounts ? undefined : active.length ? { tone: "ok" as const, text: "Ulangan" } : account ? { tone: "bad" as const, text: "Uzilgan" } : { tone: "off" as const, text: "Ulanmagan" }

  return (
    <Tile icon={TelegramLogo} iconClass="text-[#2AABEE]" title="Telegram" status={status} onOpen={onOpen} className="md:col-span-2 xl:col-span-5 xl:row-span-2">
      {!accounts ? <Bars n={4} /> : !account ? (
        <div className="flex-1 flex flex-col items-center justify-center gap-3 text-center py-6">
          <span className="size-14 rounded-full bg-[#2AABEE] text-white flex items-center justify-center"><TelegramLogo size={30} weight="fill" /></span>
          <p className="text-base text-ink">Kompaniya akkaunti ulanmagan</p>
          <p className="text-sm text-ink-muted max-w-64">Ulangach, sotuvchilar lid bilan shu platformaning o'zida yozishadi.</p>
          <span className="h-9 px-4 inline-flex items-center rounded-full bg-accent text-ink-on-accent text-sm font-medium">Telegram ulash</span>
        </div>
      ) : (
        <div className="flex-1 min-h-0 flex flex-col gap-4">
          <div className="flex items-center gap-3 min-w-0">
            <span className="relative shrink-0">
              <TgAvatar name={account.title} size={48} />
              <span className="absolute -bottom-0.5 -right-0.5 size-5 rounded-full bg-[#2AABEE] text-white flex items-center justify-center ring-2 ring-surface-sunken"><TelegramLogo size={12} weight="fill" /></span>
            </span>
            <span className="flex-1 min-w-0 flex flex-col">
              <span className="text-lg font-semibold text-ink truncate">{account.title}</span>
              <span className="text-sm text-ink-muted truncate tabular-nums">{account.phone ? formatPhone(`+${account.phone.replace(/^\+/, "")}`) : "—"} · {account.owner?.full_name ?? "umumiy akkaunt"}</span>
            </span>
          </div>

          <div className="flex-1 min-h-0 flex flex-col rounded-surface bg-surface overflow-hidden">
            <div className="flex items-center justify-between gap-2 pl-4 pr-2 h-10 shrink-0 border-b border-line">
              <span className="text-sm font-medium text-ink">So'nggi suhbatlar</span>
              <button type="button" onClick={(e) => { e.stopPropagation(); onInbox() }}
                className="h-7 px-2.5 rounded-full text-sm text-ink-muted hover:text-ink hover:bg-mute-ghost-hover whitespace-nowrap">Barchasi</button>
            </div>
            {chats.length === 0
              ? <p className="flex-1 flex items-center justify-center px-4 text-sm text-ink-muted text-center">Hali yozishma yo'q — birinchi xabar bitim sahifasidan yuboriladi</p>
              : <ul className="flex-1 min-h-0 overflow-hidden">
                {chats.slice(0, 4).map((c) => (
                  <li key={c.id} className="flex items-center gap-3 px-4 h-[58px] border-b border-line last:border-0">
                    <TgAvatar name={c.title} url={c.image} size={36} />
                    <span className="flex-1 min-w-0 flex flex-col">
                      <span className="text-sm font-medium text-ink truncate">{c.title}</span>
                      <span className="text-sm text-ink-muted truncate">{c.last?.direction === "out" && <span className="text-[#2AABEE]">Siz: </span>}{c.last?.text || (c.last?.files.length ? "Fayl" : "—")}</span>
                    </span>
                    <span className="shrink-0 flex flex-col items-end gap-1">
                      <span className="text-xs text-ink-faint tabular-nums">{when(c.last_message_at)}</span>
                      {c.unread > 0 && <span className="h-[18px] min-w-[18px] px-1.5 rounded-full bg-[#2AABEE] text-white text-xs font-semibold tabular-nums inline-flex items-center justify-center">{c.unread}</span>}
                    </span>
                  </li>
                ))}
              </ul>}
          </div>

          <p className="shrink-0 flex flex-wrap gap-x-4 gap-y-1 text-sm text-ink-muted">
            <span><b className="text-ink tabular-nums">{chats.length}</b> suhbat</span>
            <span className={waiting ? "text-ink" : undefined}><b className={`tabular-nums ${waiting ? "text-[#2AABEE]" : "text-ink"}`}>{waiting}</b> javob kutyapti</span>
            <span><b className="text-ink tabular-nums">{templates}</b> shablon</span>
          </p>
        </div>
      )}
    </Tile>
  )
}

// ─── Lid manbalari: leads per source as bars ─────────────────────────────────

function LeadsTile({ sources, onOpen }: { sources?: LeadSource[]; onOpen: () => void }) {
  const on = sources?.filter((s) => s.enabled) ?? []
  const total = sources?.reduce((n, s) => n + s.leads_count, 0) ?? 0
  const max = Math.max(1, ...(sources ?? []).map((s) => s.leads_count))
  const rows = [...(sources ?? [])].sort((a, b) => Number(b.enabled) - Number(a.enabled) || b.leads_count - a.leads_count)
  const last = sources?.map((s) => s.last_lead_at).filter((x): x is string => !!x).sort().at(-1)
  return (
    <Tile icon={Funnel} title="Lid manbalari" status={sources && { tone: on.length ? "ok" : "off", text: `${on.length} / ${sources.length} yoqilgan` }} onOpen={onOpen} className="md:col-span-2 xl:col-span-7">
      {!sources ? <Bars n={4} /> : (
        <div className="flex-1 min-h-0 flex gap-6 max-sm:flex-col max-sm:gap-4">
          <div className="shrink-0 w-36 flex flex-col justify-end max-sm:w-auto">
            <span className="text-4xl leading-none font-semibold text-ink tabular-nums">{total}</span>
            <span className="mt-1.5 text-sm text-ink-muted">jami lid</span>
            {last && <span className="text-xs text-ink-faint tabular-nums">oxirgisi {new Date(last).toLocaleString("ru-RU", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit", timeZone: "Asia/Tashkent" })}</span>}
          </div>
          <ul className="flex-1 min-w-0 flex flex-col justify-end gap-[7px]">
            {rows.map((s) => (
              <li key={s.id} className={`flex items-center gap-3 h-5 text-sm ${s.enabled ? "" : "opacity-50"}`}>
                <span className="w-32 shrink-0 truncate text-ink">{s.label}</span>
                <span className="flex-1 h-2 rounded-full bg-surface overflow-hidden">
                  {s.enabled && <span className="block h-full rounded-full" style={{ width: `${Math.max(s.leads_count ? 3 : 0, (s.leads_count / max) * 100)}%`, backgroundColor: SOURCE_COLOR[s.id] ?? "#888780" }} />}
                </span>
                <span className="w-12 shrink-0 text-right tabular-nums text-ink-muted">{s.enabled ? s.leads_count : "o'chiq"}</span>
              </li>
            ))}
          </ul>
        </div>
      )}
    </Tile>
  )
}

// ─── Telegram guruhlar: the groups × jobs matrix in miniature ────────────────

function GroupsTile({ groups, onOpen, className }: { groups?: TelegramGroup[]; onOpen: () => void; className: string }) {
  const problems = groups?.filter((g) => isGone(g) || !GROUP_ROLES.some((r) => g[r.id])).length ?? 0
  const shown = groups?.slice(0, 3) ?? []
  return (
    <Tile icon={UsersThree} title="Telegram guruhlar" onOpen={onOpen} className={className}
      status={groups && (problems ? { tone: "warn", text: `${problems} ta e'tibor` } : { tone: groups.length ? "ok" : "off", text: `${groups.length} ta guruh` })}>
      {!groups ? <Bars n={3} /> : groups.length === 0 ? (
        <p className="flex-1 flex items-center text-sm text-ink-muted">Botni guruhga qo'shing — u shu yerda chiqadi va qaysi xabarlarni yuborishini belgilaysiz.</p>
      ) : (
        <div className="flex-1 min-h-0 flex flex-col justify-end">
          <div className="grid grid-cols-[minmax(0,1fr)_repeat(6,minmax(44px,60px))] items-center gap-y-0.5 text-sm max-sm:grid-cols-[minmax(0,1fr)_repeat(6,28px)]">
            <span />
            {GROUP_ROLES.map((r) => <span key={r.id} title={r.label} className="pb-1.5 text-center text-xs text-ink-faint truncate max-sm:text-[0px]">{ROLE_SHORT[r.id]}</span>)}
            {shown.map((g) => (
              <Row key={g.chat_id} g={g} />
            ))}
          </div>
          {groups.length > shown.length && <span className="mt-1 text-xs text-ink-faint">+{groups.length - shown.length} ta guruh</span>}
        </div>
      )}
    </Tile>
  )
}

function Row({ g }: { g: TelegramGroup }) {
  const gone = isGone(g)
  return (
    <>
      <span className="flex items-center gap-2.5 min-w-0 h-10 pr-3 border-t border-line">
        <TgAvatar name={g.title || "TG"} size={28} />
        <span className="min-w-0 flex flex-col leading-tight">
          <span className={`truncate font-medium ${gone ? "text-ink-muted" : "text-ink"}`}>{g.title || "Nomsiz guruh"}</span>
          {gone && <span className="text-xs text-danger-text truncate">bot chiqarilgan</span>}
        </span>
      </span>
      {GROUP_ROLES.map((r) => (
        <span key={r.id} className="h-10 flex items-center justify-center border-t border-line" aria-label={`${ROLE_SHORT[r.id]}: ${g[r.id] ? "yoqilgan" : "o'chiq"}`}>
          {g[r.id] ? <span className={`size-2.5 rounded-full ${gone ? "bg-mute-soft-hover" : "bg-ink"}`} /> : <span className="size-1 rounded-full bg-mute-soft-hover" />}
        </span>
      ))}
    </>
  )
}

// ─── Telefoniya: the lines and who holds them ────────────────────────────────

function PhoneTile({ data, onOpen }: { data: BentoData; onOpen: () => void }) {
  const { exts, extsError, owners = [] } = data
  const free = exts?.filter((e) => !owners.some((u) => u.pbx_ext === e.num)).length ?? 0
  return (
    <Tile icon={Phone} title="Telefoniya" onOpen={onOpen} className="xl:col-span-5"
      status={extsError ? { tone: "bad", text: "Aloqa yo'q" } : exts && (free ? { tone: "warn", text: `${free} ta bo'sh raqam` } : { tone: exts.length ? "ok" : "off", text: "OnlinePBX" })}>
      {extsError ? <p className="flex-1 flex items-center text-sm text-ink-muted">OnlinePBX javob bermayapti. Birozdan keyin qayta ochib ko'ring.</p>
        : !exts ? <Bars n={3} />
        : exts.length === 0 ? <p className="flex-1 flex items-center text-sm text-ink-muted">OnlinePBX'da ichki raqam yo'q.</p>
        : (
          <ul className="flex-1 min-h-0 flex flex-col justify-end">
            {exts.slice(0, 3).map((e) => {
              const owner = owners.find((u) => u.pbx_ext === e.num)
              return (
                <li key={e.num} className="flex items-center gap-3 h-10 border-t border-line first:border-0 min-w-0">
                  <span className="w-12 shrink-0 h-7 rounded-control bg-surface text-sm font-semibold text-ink tabular-nums flex items-center justify-center">{e.num}</span>
                  {owner
                    ? <span className="flex-1 min-w-0 flex items-center gap-2"><TgAvatar name={owner.full_name} url={owner.avatar_url} size={24} /><span className="truncate text-sm text-ink">{owner.full_name}</span></span>
                    : <span className="flex-1 min-w-0 truncate text-sm text-warning-text">Hodimga biriktirilmagan</span>}
                  <span className="shrink-0 inline-flex items-center gap-1.5 text-xs text-ink-muted whitespace-nowrap"><Dot tone={!e.enabled ? "off" : e.registered ? "ok" : "warn"} />{!e.enabled ? "O'chiq" : e.registered ? "Tarmoqda" : "Tarmoqda emas"}</span>
                </li>
              )
            })}
            {exts.length > 3 && <li className="pt-1 text-xs text-ink-faint">+{exts.length - 3} ta raqam</li>}
          </ul>
        )}
    </Tile>
  )
}

// ─── Anketa: the link as a QR you can use right here ─────────────────────────

function AnketaTile({ url, onOpen, onCopy, className }: { url?: string; onOpen: () => void; onCopy: (url: string) => void; className: string }) {
  const [qr, setQr] = useState<string | null>(null)
  useEffect(() => { if (url) void QRCode.toDataURL(url, { width: 240, margin: 1 }).then(setQr) }, [url])
  return (
    <Tile icon={IdentificationCard} title="Anketa havolasi" status={url ? { tone: "ok", text: "Faol" } : undefined} onOpen={onOpen} className={className}>
      <div className="flex-1 min-h-0 flex items-end gap-5">
        <span className="shrink-0 size-[120px] max-sm:size-24 rounded-surface bg-white p-2 flex items-center justify-center">
          {qr ? <img src={qr} alt="Anketa havolasining QR kodi" className="size-full" /> : <QrCode size={48} weight="thin" className="text-ink-faint animate-pulse" />}
        </span>
        <div className="flex-1 min-w-0 flex flex-col gap-3">
          <p className="text-sm text-ink-muted line-clamp-2">Bazada yo'q odam ismi, kompaniyasi va rasmini o'zi yozadi. Tadbirda QR kod, tanish orqali kelganga havola.</p>
          <div className="flex items-center gap-2 min-w-0">
            <code className="flex-1 min-w-0 h-9 px-3 rounded-control bg-surface text-sm text-ink-muted flex items-center"><span className="truncate">{url ? url.replace(/^https?:\/\//, "") : "…"}</span></code>
            <button type="button" disabled={!url} onClick={(e) => { e.stopPropagation(); if (url) onCopy(url) }}
              className="h-9 px-3.5 shrink-0 inline-flex items-center gap-1.5 rounded-full bg-accent text-ink-on-accent text-sm font-medium whitespace-nowrap hover:bg-accent-hover disabled:opacity-40"><Copy size={16} />Nusxalash</button>
          </div>
        </div>
      </div>
    </Tile>
  )
}
