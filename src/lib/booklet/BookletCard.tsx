import type { Participant } from "../supabase/queries/events"
import { formatPhone } from "../format"

// Fixed print palette (the PDF is paper — it doesn't follow the app's light/dark
// theme), matching the app's light tokens.
export const BOOKLET = {
  font: "'DM Sans Variable', system-ui, sans-serif",
  ink: "#1c1c1c",
  muted: "#6e6e6e",
  faint: "#a4a4a4",
  line: "#ececec",
  card: "#f5f5f5",
  placeholder: "#e8e8e8",
} as const

/** Card height and the gap between cards — 4 cards + first-page header + footer fit inside A4 */
export const BOOKLET_CARD_H = 200
export const BOOKLET_CARD_GAP = 12

interface BookletCardProps {
  participant: Participant
  index: number
}

export function BookletCard({ participant, index }: BookletCardProps) {
  const initials = participant.full_name
    .split(" ")
    .map((w: string) => w[0])
    .filter(Boolean)
    .slice(0, 2)
    .join("")
    .toUpperCase()
  const subtitle = [participant.role, participant.company].filter(Boolean).join(" · ")
  const contacts = [participant.phone ? formatPhone(participant.phone) : null, participant.email].filter(Boolean)

  return (
    <div
      style={{
        height: `${BOOKLET_CARD_H}px`,
        display: "flex",
        alignItems: "center",
        gap: "24px",
        padding: "18px",
        borderRadius: "16px",
        backgroundColor: BOOKLET.card,
        boxSizing: "border-box",
      }}
    >
      {/* Photo (3:4) */}
      <div
        style={{
          width: "123px",
          height: "164px",
          borderRadius: "12px",
          backgroundColor: BOOKLET.placeholder,
          overflow: "hidden",
          flexShrink: 0,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
        }}
      >
        {participant.photo_url ? (
          <img
            src={participant.photo_url}
            alt=""
            crossOrigin="anonymous"
            style={{ width: "100%", height: "100%", objectFit: "cover", objectPosition: "top", display: "block" }}
          />
        ) : (
          <span style={{ fontSize: "28px", fontWeight: 500, color: BOOKLET.faint }}>{initials}</span>
        )}
      </div>

      {/* Info */}
      <div
        style={{
          flex: 1,
          minWidth: 0,
          height: "164px",
          display: "flex",
          flexDirection: "column",
          justifyContent: "space-between",
        }}
      >
        <div style={{ display: "flex", flexDirection: "column", gap: "6px", minWidth: 0 }}>
          <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: "16px" }}>
            {/* Full name always — wraps to a second line if long, never truncated */}
            <span style={{ flex: 1, minWidth: 0, fontSize: "20px", fontWeight: 600, letterSpacing: "-0.01em", lineHeight: 1.25 }}>
              {participant.full_name}
            </span>
            <span style={{ fontSize: "12px", lineHeight: "25px", color: BOOKLET.faint, fontVariantNumeric: "tabular-nums", flexShrink: 0 }}>
              {String(index).padStart(2, "0")}
            </span>
          </div>
          {subtitle && <span style={{ fontSize: "14px", fontWeight: 500, color: BOOKLET.ink }}>{subtitle}</span>}
          {participant.activity && (
            // max-height clip instead of line-clamp: html2canvas doesn't render -webkit-line-clamp
            <span style={{ fontSize: "14px", lineHeight: 1.5, color: BOOKLET.muted, maxHeight: "42px", overflow: "hidden" }}>
              {participant.activity}
            </span>
          )}
        </div>

        {contacts.length > 0 && (
          <span style={{ fontSize: "14px", color: BOOKLET.ink, fontVariantNumeric: "tabular-nums" }}>
            {contacts.join("   ·   ")}
          </span>
        )}
      </div>
    </div>
  )
}
