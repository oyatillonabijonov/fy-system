import { useState } from "react"
import { useQuery, useQueryClient } from "@tanstack/react-query"
import { motion } from "framer-motion"
import { CalendarBlank, MapPin, CurrencyDollar, CheckCircle, Warning, Spinner } from "@phosphor-icons/react"
import { useEvents, EVENTS_KEY } from "@/hooks/useEvents"
import type { Event } from "@/lib/supabase/queries/events"
import { supabase } from "@/lib/supabase/client"

type Tab = "upcoming" | "mine"

interface MyEventRow {
  id: string
  event_id: string
  events: {
    id: string
    name: string
    date: string | null
    location: string | null
    cover_image: string | null
    price: number
  } | null
}

async function fetchMyEvents(): Promise<MyEventRow[]> {
  const { data: clientIdData, error: cidError } = await supabase.rpc("my_client_id" as never)
  if (cidError || !clientIdData) return []

  const { data, error } = await supabase
    .from("event_participants")
    .select("id, event_id, events(id, name, date, location, cover_image, price)")
    .eq("contact_id", clientIdData as string)

  if (error) throw error
  return (data ?? []) as MyEventRow[]
}

const MY_EVENTS_KEY = ["my-events"] as const

function formatDate(dateStr: string | null): string {
  if (!dateStr) return "Sana belgilanmagan"
  return new Date(dateStr).toLocaleDateString("uz-UZ", {
    day: "numeric",
    month: "long",
    year: "numeric",
  })
}

function formatPrice(price: number): string {
  if (price === 0) return "Bepul"
  return `${price.toLocaleString("uz-UZ")} so'm`
}

type ToastState = { type: "success" | "error"; message: string } | null

function EventCard({
  event,
  onRegister,
  registering,
  toast,
}: {
  event: Event
  onRegister: (id: string) => void
  registering: string | null
  toast: Record<string, ToastState>
}) {
  const isLoading = registering === event.id
  const eventToast = toast[event.id] ?? null

  return (
    <motion.div
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.25 }}
      style={{ background: "var(--card-bg, var(--main-bg))", border: "1px solid var(--border, #e5e7eb)" }}
      className="rounded-[8px] overflow-hidden flex flex-col"
    >
      <div className="relative h-44 bg-gray-100 overflow-hidden">
        {event.cover_image ? (
          <img
            src={event.cover_image}
            alt={event.name}
            className="w-full h-full object-cover"
          />
        ) : (
          <div className="w-full h-full flex items-center justify-center" style={{ background: "var(--sidebar-bg, #f3f4f6)" }}>
            <CalendarBlank size={40} style={{ color: "var(--header-muted)" }} />
          </div>
        )}
        {!event.is_active && (
          <div className="absolute inset-0 bg-black/40 flex items-center justify-center">
            <span className="text-white text-sm font-medium px-3 py-1 rounded-[8px] bg-black/50">
              Yakunlangan
            </span>
          </div>
        )}
      </div>

      <div className="p-4 flex flex-col gap-3 flex-1">
        <h3 className="font-semibold text-base leading-snug" style={{ color: "var(--header-text)" }}>
          {event.name}
        </h3>

        <div className="flex flex-col gap-1.5">
          {event.date && (
            <div className="flex items-center gap-1.5 text-sm" style={{ color: "var(--header-muted)" }}>
              <CalendarBlank size={14} />
              <span>{formatDate(event.date)}</span>
            </div>
          )}
          {event.location && (
            <div className="flex items-center gap-1.5 text-sm" style={{ color: "var(--header-muted)" }}>
              <MapPin size={14} />
              <span>{event.location}</span>
            </div>
          )}
          <div className="flex items-center gap-1.5 text-sm font-medium" style={{ color: "var(--accent, #6366F1)" }}>
            <CurrencyDollar size={14} />
            <span>{formatPrice(event.price)}</span>
          </div>
        </div>

        {eventToast && (
          <div
            className="flex items-center gap-2 text-sm px-3 py-2 rounded-[8px]"
            style={{
              background: eventToast.type === "success" ? "rgba(99,102,241,0.08)" : "rgba(239,68,68,0.08)",
              color: eventToast.type === "success" ? "var(--accent, #6366F1)" : "#ef4444",
            }}
          >
            {eventToast.type === "success" ? (
              <CheckCircle size={15} weight="fill" />
            ) : (
              <Warning size={15} weight="fill" />
            )}
            <span>{eventToast.message}</span>
          </div>
        )}

        <button
          onClick={() => onRegister(event.id)}
          disabled={isLoading || !event.is_active}
          className="mt-auto w-full py-2.5 text-sm font-medium rounded-[8px] transition-opacity disabled:opacity-50 flex items-center justify-center gap-2"
          style={{
            background: "var(--accent, #6366F1)",
            color: "#fff",
          }}
        >
          {isLoading && <Spinner size={14} className="animate-spin" />}
          {event.is_active ? "Qatnashaman" : "Yakunlangan"}
        </button>
      </div>
    </motion.div>
  )
}

function MyEventItem({ row }: { row: MyEventRow }) {
  const ev = row.events
  if (!ev) return null

  return (
    <motion.div
      initial={{ opacity: 0, x: -8 }}
      animate={{ opacity: 1, x: 0 }}
      transition={{ duration: 0.2 }}
      className="flex items-center gap-4 p-4 rounded-[8px]"
      style={{ background: "var(--card-bg, var(--main-bg))", border: "1px solid var(--border, #e5e7eb)" }}
    >
      <div className="w-16 h-16 rounded-[8px] overflow-hidden flex-shrink-0 bg-gray-100">
        {ev.cover_image ? (
          <img src={ev.cover_image} alt={ev.name} className="w-full h-full object-cover" />
        ) : (
          <div className="w-full h-full flex items-center justify-center" style={{ background: "var(--sidebar-bg, #f3f4f6)" }}>
            <CalendarBlank size={22} style={{ color: "var(--header-muted)" }} />
          </div>
        )}
      </div>

      <div className="flex flex-col gap-1 min-w-0 flex-1">
        <span className="font-medium text-sm truncate" style={{ color: "var(--header-text)" }}>
          {ev.name}
        </span>
        {ev.date && (
          <span className="text-xs" style={{ color: "var(--header-muted)" }}>
            {formatDate(ev.date)}
          </span>
        )}
        {ev.location && (
          <span className="text-xs flex items-center gap-1" style={{ color: "var(--header-muted)" }}>
            <MapPin size={11} />
            {ev.location}
          </span>
        )}
      </div>

      <div
        className="flex items-center gap-1 text-xs font-medium flex-shrink-0 px-2.5 py-1 rounded-[8px]"
        style={{ background: "rgba(99,102,241,0.08)", color: "var(--accent, #6366F1)" }}
      >
        <CheckCircle size={13} weight="fill" />
        Ro'yxatda
      </div>
    </motion.div>
  )
}

export default function MemberEvents() {
  const [activeTab, setActiveTab] = useState<Tab>("upcoming")
  const [registering, setRegistering] = useState<string | null>(null)
  const [toasts, setToasts] = useState<Record<string, ToastState>>({})
  const qc = useQueryClient()

  const { data: events = [], isLoading: eventsLoading } = useEvents()
  const { data: myEvents = [], isLoading: myLoading } = useQuery({
    queryKey: MY_EVENTS_KEY,
    queryFn: fetchMyEvents,
    staleTime: 1000 * 60 * 2,
    enabled: activeTab === "mine",
  })

  const upcomingEvents = events.filter((e) => e.is_active)

  async function handleRegister(eventId: string) {
    setRegistering(eventId)
    setToasts((prev) => ({ ...prev, [eventId]: null }))

    const { error } = await supabase.rpc("register_for_event", { p_event_id: eventId } as never)

    if (error) {
      setToasts((prev) => ({
        ...prev,
        [eventId]: { type: "error", message: error.message || "Xatolik yuz berdi" },
      }))
    } else {
      setToasts((prev) => ({
        ...prev,
        [eventId]: { type: "success", message: "Muvaffaqiyatli ro'yxatdan o'tdingiz!" },
      }))
      qc.invalidateQueries({ queryKey: EVENTS_KEY })
      qc.invalidateQueries({ queryKey: MY_EVENTS_KEY })
    }

    setRegistering(null)
  }

  const tabs: { key: Tab; label: string }[] = [
    { key: "upcoming", label: "Kelayotgan tadbirlar" },
    { key: "mine", label: "Mening tadbirlarim" },
  ]

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      transition={{ duration: 0.3 }}
      className="p-6 max-w-5xl mx-auto"
    >
      <div className="mb-6">
        <h1 className="text-2xl font-bold mb-1" style={{ color: "var(--header-text)" }}>
          Tadbirlar
        </h1>
        <p className="text-sm" style={{ color: "var(--header-muted)" }}>
          Klubning joriy va kelgusi tadbirlarida qatnashing
        </p>
      </div>

      <div
        className="flex gap-1 p-1 rounded-[8px] mb-6 w-fit"
        style={{ background: "var(--sidebar-bg, #f3f4f6)" }}
      >
        {tabs.map((tab) => (
          <button
            key={tab.key}
            onClick={() => setActiveTab(tab.key)}
            className="px-4 py-2 text-sm font-medium rounded-[8px] transition-all"
            style={
              activeTab === tab.key
                ? { background: "var(--accent, #6366F1)", color: "#fff" }
                : { color: "var(--header-muted)" }
            }
          >
            {tab.label}
          </button>
        ))}
      </div>

      {activeTab === "upcoming" && (
        <>
          {eventsLoading ? (
            <div className="flex items-center justify-center py-20">
              <Spinner size={28} className="animate-spin" style={{ color: "var(--accent, #6366F1)" }} />
            </div>
          ) : upcomingEvents.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-20 gap-3">
              <CalendarBlank size={48} style={{ color: "var(--header-muted)" }} />
              <p className="text-sm" style={{ color: "var(--header-muted)" }}>
                Hozircha faol tadbirlar yo'q
              </p>
            </div>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
              {upcomingEvents.map((event) => (
                <EventCard
                  key={event.id}
                  event={event}
                  onRegister={handleRegister}
                  registering={registering}
                  toast={toasts}
                />
              ))}
            </div>
          )}
        </>
      )}

      {activeTab === "mine" && (
        <>
          {myLoading ? (
            <div className="flex items-center justify-center py-20">
              <Spinner size={28} className="animate-spin" style={{ color: "var(--accent, #6366F1)" }} />
            </div>
          ) : myEvents.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-20 gap-3">
              <CalendarBlank size={48} style={{ color: "var(--header-muted)" }} />
              <p className="text-sm" style={{ color: "var(--header-muted)" }}>
                Siz hali hech bir tadbirga ro'yxatdan o'tmagansiz
              </p>
            </div>
          ) : (
            <div className="flex flex-col gap-3">
              {myEvents.map((row) => (
                <MyEventItem key={row.id} row={row} />
              ))}
            </div>
          )}
        </>
      )}
    </motion.div>
  )
}
