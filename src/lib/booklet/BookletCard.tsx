import type { Participant } from "../supabase/queries/events"

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

  return (
    <div
      style={{
        width: "714px",
        height: "210px",
        background: "#FFF5EE",
        border: "1px solid #F0F0F0",
        borderRadius: "12px",
        display: "flex",
        alignItems: "stretch",
        padding: "20px",
        gap: "20px",
        fontFamily: "'Geist Variable', system-ui, sans-serif",
        boxSizing: "border-box",
        position: "relative",
        flexShrink: 0,
      }}
    >
      {/* Photo placeholder */}
      <div
        style={{
          width: "130px",
          height: "165px",
          borderRadius: "12px",
          backgroundColor: "#F0F0F0",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          overflow: "hidden",
          flexShrink: 0,
          alignSelf: "center",
        }}
      >
        {participant.photo_url ? (
          <img
            src={participant.photo_url}
            alt={participant.full_name}
            crossOrigin="anonymous"
            style={{
              width: "143px",
              height: "161px",
              objectFit: "cover",
              display: "block",
            }}
          />
        ) : (
          <span
            style={{
              fontSize: "14px",
              fontWeight: "700",
              color: "#999999",
            }}
          >
            {initials}
          </span>
        )}
      </div>

      {/* Info */}
      <div
        style={{
          flex: 1,
          minWidth: 0,
          display: "flex",
          flexDirection: "column",
          justifyContent: "space-between",
          padding: "4px 0",
        }}
      >
        <div style={{ display: "flex", flexDirection: "column", gap: "4px" }}>
          {/* Name */}
          <span
            style={{
              fontSize: "20px",
              fontWeight: "600",
              color: "#141414",
              letterSpacing: "-0.4px",
              whiteSpace: "nowrap",
              overflow: "hidden",
              textOverflow: "ellipsis",
            }}
          >
            {participant.full_name}
          </span>

          {/* Activity */}
          {participant.activity && (
            <span
              style={{
                fontSize: "16px",
                color: "#999999",
                lineHeight: "1.4",
              }}
            >
              {participant.activity}
            </span>
          )}
        </div>

        {/* Phone — aligned with bottom of image */}
        {participant.phone && (
          <span
            style={{
              fontSize: "16px",
              color: "#999999",
            }}
          >
            {participant.phone}
          </span>
        )}
      </div>

      {/* Index */}
      <div
        style={{
          position: "absolute",
          top: "10px",
          right: "14px",
          fontSize: "10px",
          color: "#DDDDDD",
          fontWeight: "500",
        }}
      >
        #{index}
      </div>
    </div>
  )
}
