import { useEvents } from "@/hooks/useEvents"
import { useEventTab, UMUMIY } from "@/hooks/useEventTab"
import { EventTabs } from "@/components/events/EventTabs"
import { EventFinance } from "@/components/events/EventFinance"
import { FinanceOverview } from "@/components/events/FinanceOverview"

export function EventsMoliya() {
  const { data: events = [], isLoading } = useEvents()
  const [selectedId, setSelectedId] = useEventTab()

  // Fall back to Umumiy when the stored tab points at a deleted event.
  const eventValid = selectedId !== UMUMIY && events.some((e) => e.id === selectedId)
  const effectiveId = eventValid ? selectedId : UMUMIY
  const selected = events.find((e) => e.id === effectiveId) ?? null

  if (isLoading) {
    return (
      <div className="flex flex-col gap-5 h-full">
        <div className="animate-pulse bg-[#F0F0F0] rounded-[6px] h-9 w-64" />
        <div className="animate-pulse bg-[#F0F0F0] rounded-[12px] h-24" />
      </div>
    )
  }

  return (
    <div className="flex flex-col gap-5 h-full">
      {/* No onCreate: creating events belongs to Boshqaruv. */}
      <EventTabs events={events} selectedId={effectiveId} onSelect={setSelectedId} showUmumiy />

      {effectiveId === UMUMIY || !selected ? <FinanceOverview /> : <EventFinance key={selected.id} event={selected} />}
    </div>
  )
}
