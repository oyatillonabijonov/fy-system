import type { Event, Participant } from "../supabase/queries/events"
import { BookletCard } from "./BookletCard"

interface BookletPageProps {
  event: Event
  participants: Participant[]
  pageNumber: number
  isFirstPage: boolean
}

export function BookletPage({
  event,
  participants,
  pageNumber,
  isFirstPage,
}: BookletPageProps) {
  return (
    <div
      style={{
        width: "794px",
        minHeight: "1123px",
        backgroundColor: "#ffffff",
        padding: "48px 40px",
        boxSizing: "border-box",
        fontFamily: "'Geist Variable', system-ui, sans-serif",
        display: "flex",
        flexDirection: "column",
        gap: "0",
      }}
    >
      {/* Header — first page only */}
      {isFirstPage && (
        <div style={{ marginBottom: "36px" }}>
          <div
            style={{
              display: "flex",
              justifyContent: "space-between",
              alignItems: "flex-start",
              marginBottom: "12px",
            }}
          >
            <div>
              <div
                style={{
                  fontSize: "26px",
                  fontWeight: "700",
                  color: "#141414",
                  letterSpacing: "-0.6px",
                  lineHeight: "1.2",
                  marginBottom: "6px",
                }}
              >
                Ishtirokchilar haqida ma'lumot
              </div>
              <div
                style={{
                  fontSize: "13px",
                  color: "#999999",
                  letterSpacing: "-0.2px",
                }}
              >
                {event.name}
                {event.location ? ` · ${event.location}` : ""}
              </div>
            </div>
          </div>
          {/* Divider */}
          <div
            style={{
              height: "1px",
              backgroundColor: "#E5E5E5",
              width: "100%",
              marginTop: "16px",
            }}
          />
        </div>
      )}

      {/* Cards */}
      <div
        style={{
          display: "flex",
          flexDirection: "column",
          gap: "20px",
          flex: 1,
        }}
      >
        {participants.map((p, i) => (
          <BookletCard
            key={p.id}
            participant={p}
            index={(pageNumber - 1) * 4 + i + 1}
          />
        ))}
      </div>

      {/* Footer */}
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          marginTop: "32px",
          paddingTop: "16px",
          borderTop: "1px solid #F0F0F0",
        }}
      >
        <span
          style={{
            fontSize: "13px",
            fontWeight: "600",
            color: "#999999",
            letterSpacing: "-0.3px",
          }}
        >
          Fikr Yetakchilar
        </span>
        <span
          style={{
            fontSize: "12px",
            color: "#CCCCCC",
            letterSpacing: "-0.2px",
          }}
        >
          {event.name}
        </span>
      </div>
    </div>
  )
}
