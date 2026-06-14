import { Phone } from "@phosphor-icons/react"
import type { CrmLeadWithContact } from "@/lib/supabase/queries/crm"
import { formatNumber, formatDate } from "@/lib/format"

interface CrmNCardProps {
  lead: CrmLeadWithContact
  isLost?: boolean
  onClick?: (lead: CrmLeadWithContact) => void
}

function nameToColor(name: string): string {
  const colors = [
    "#3B82F6", "#10B981", "#F59E0B", "#EF4444",
    "#8B5CF6", "#EC4899", "#06B6D4", "#F97316",
    "#6366F1", "#14B8A6",
  ]
  let hash = 0
  for (let i = 0; i < name.length; i++) {
    hash = name.charCodeAt(i) + ((hash << 5) - hash)
  }
  return colors[Math.abs(hash) % colors.length]
}

function getInitials(name: string): string {
  return name
    .split(" ")
    .map((w) => w[0])
    .join("")
    .toUpperCase()
    .slice(0, 2)
}


export function CrmNCard({ lead, isLost, onClick }: CrmNCardProps) {
  const contact = lead.crm_contacts
  const displayName = contact?.name ?? lead.name
  const contactInitials = getInitials(displayName)
  const contactColor = nameToColor(displayName)

  const sourceLabel =
    lead.source === "telegram"
      ? "Telegram"
      : lead.source === "manual"
        ? "Qo'lda"
        : lead.source

  return (
    <div
      onClick={() => onClick?.(lead)}
      style={{ letterSpacing: "-0.4px" }}
      className={`bg-white border border-[#e5e5e5] rounded-[10px] px-3.5 py-3 flex flex-col gap-1 hover:border-[#c0c0c0] hover:shadow-[0_2px_8px_rgba(0,0,0,0.06)] transition-all duration-150 cursor-pointer ${isLost ? "opacity-50" : ""}`}
    >
      {/* LINE 1: Avatar + DisplayName */}
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-2 min-w-0">
          <div
            className="w-7 h-7 rounded-full flex items-center justify-center text-[11px] font-bold text-white shrink-0"
            style={{ backgroundColor: contactColor }}
          >
            {contactInitials}
          </div>
          <span className="text-[13px] font-semibold text-[#141414] leading-tight truncate">
            {displayName}
            {contact?.company && (
              <span className="text-[12px] font-normal text-[#999]">
                , {contact.company}
              </span>
            )}
          </span>
        </div>
      </div>

      {/* LINE 2: Lead name */}
      <div className="pl-9">
        <span className="text-[11px] text-[#999] truncate block">
          {lead.name}
        </span>
      </div>

      {/* LINE 3: Tags */}
      <div className="flex items-center gap-1.5 flex-wrap pl-9 mt-1">
        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-semibold bg-emerald-50 text-emerald-600">
          <span className="w-1.5 h-1.5 rounded-full bg-emerald-500" />
          CRM-N
        </span>
        <span className="inline-flex px-2 py-0.5 rounded-full text-[10px] font-semibold bg-[#f5f5f5] text-[#666]">
          {sourceLabel}
        </span>
        {lead.price > 0 && (
          <span className={`inline-flex px-2 py-0.5 rounded-full text-[10px] font-semibold bg-[#f5f5f5] ${isLost ? "line-through text-[#999]" : "text-[#666]"}`}>
            {formatNumber(lead.price)} so'm
          </span>
        )}
        {contact?.phone && (
          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-semibold bg-[#f5f5f5] text-[#666]">
            <Phone size={10} className="text-[#bbb]" weight="bold" />
            {contact.phone}
          </span>
        )}
      </div>

      {/* LINE 4: Date/time */}
      <div className="pl-9 mt-0.5">
        <span className="text-[11px] text-[#999] font-medium">
          {formatDate(lead.created_at)}
        </span>
      </div>
    </div>
  )
}
