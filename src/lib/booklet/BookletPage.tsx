import type { Event, Participant } from "../supabase/queries/events"
import { formatDate } from "../format"
import { BookletCard, BOOKLET, BOOKLET_CARD_GAP } from "./BookletCard"

interface BookletPageProps {
  event: Event
  participants: Participant[]
  pageNumber: number
  totalPages: number
  totalParticipants: number
  cardsPerPage: number
}

// A4 at 96dpi. Fixed height (not min-height) so a page can never grow past A4
// and get squashed when it's placed onto the 210×297mm PDF page.
const PAGE_W = 794
const PAGE_H = 1123

export function BookletPage({
  event,
  participants,
  pageNumber,
  totalPages,
  totalParticipants,
  cardsPerPage,
}: BookletPageProps) {
  const isFirstPage = pageNumber === 1
  const dateLabel = event.date
    ? event.end_date && event.end_date !== event.date
      ? `${formatDate(event.date)} — ${formatDate(event.end_date)}`
      : formatDate(event.date)
    : null
  const meta = [dateLabel, event.location, `${totalParticipants} ishtirokchi`].filter(Boolean).join("  ·  ")

  return (
    <div
      style={{
        width: `${PAGE_W}px`,
        height: `${PAGE_H}px`,
        overflow: "hidden",
        backgroundColor: "#ffffff",
        padding: "48px 48px 40px",
        boxSizing: "border-box",
        fontFamily: BOOKLET.font,
        color: BOOKLET.ink,
        display: "flex",
        flexDirection: "column",
      }}
    >
      {isFirstPage ? (
        <div style={{ paddingBottom: "20px", borderBottom: `1px solid ${BOOKLET.line}` }}>
          <div style={{ fontSize: "13px", fontWeight: 500, color: BOOKLET.muted, marginBottom: "10px" }}>
            Ishtirokchilar
          </div>
          <div style={{ fontSize: "30px", fontWeight: 600, letterSpacing: "-0.02em", lineHeight: 1.15, marginBottom: "10px" }}>
            {event.name}
          </div>
          <div style={{ fontSize: "14px", color: BOOKLET.muted }}>{meta}</div>
        </div>
      ) : (
        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
            paddingBottom: "14px",
            borderBottom: `1px solid ${BOOKLET.line}`,
            fontSize: "13px",
          }}
        >
          <span style={{ fontWeight: 500 }}>{event.name}</span>
          <span style={{ color: BOOKLET.muted }}>Ishtirokchilar</span>
        </div>
      )}

      {/* Cards — fixed height each, so a short last page just leaves white space */}
      <div style={{ flex: 1, display: "flex", flexDirection: "column", gap: `${BOOKLET_CARD_GAP}px`, paddingTop: "20px" }}>
        {participants.map((p, i) => (
          <BookletCard key={p.id} participant={p} index={(pageNumber - 1) * cardsPerPage + i + 1} />
        ))}
      </div>

      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          paddingTop: "14px",
          borderTop: `1px solid ${BOOKLET.line}`,
          fontSize: "12px",
          color: BOOKLET.muted,
        }}
      >
        <span style={{ fontWeight: 500, color: BOOKLET.ink }}>Fikr Yetakchilari</span>
        <span style={{ fontVariantNumeric: "tabular-nums" }}>
          Sahifa {pageNumber} / {totalPages}
        </span>
      </div>
    </div>
  )
}
