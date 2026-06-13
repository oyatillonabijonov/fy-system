import { Phone, PhoneSlash } from "@phosphor-icons/react"
import type { Lead, StageConfig } from "@/lib/mock-data/sotuv"
import { formatAmount, getStageConfig } from "@/lib/mock-data/sotuv"

function formatDate(dateStr: string): string {
  const d = new Date(dateStr)
  if (isNaN(d.getTime())) return dateStr
  const day = String(d.getDate()).padStart(2, "0")
  const month = String(d.getMonth() + 1).padStart(2, "0")
  const year = d.getFullYear()
  return `${day}.${month}.${year}`
}

interface LidCardProps {
  lead: Lead
  isSelected: boolean
  onSelect: (id: string) => void
  stageConfigs: Record<string, StageConfig>
  onClick?: (lead: Lead) => void
}

export function LidCard({ lead, isSelected, onSelect, stageConfigs, onClick }: LidCardProps) {
  const stageConfig = getStageConfig(stageConfigs, lead.stage)

  const sourceLabel =
    lead.source === "amocrm"
      ? "AmoCRM"
      : lead.source === "telegram"
        ? "Telegram bot"
        : "Qo'lda"

  return (
    <tr
      onClick={() => onClick?.(lead)}
      className="hover:bg-[#F9F9F8] transition-colors border-b border-[#F0F0F0] cursor-pointer"
    >
      {/* Checkbox */}
      <td className="px-4 py-3">
        <input
          type="checkbox"
          checked={isSelected}
          onChange={() => onSelect(lead.id)}
          className="w-4 h-4 rounded-[4px] border-[#D0D0D0] text-[#141414] focus:ring-0 cursor-pointer"
        />
      </td>

      {/* Name / Company */}
      <td className="px-4 py-3">
        <div className="flex flex-col">
          <span className="text-[13px] font-bold text-[#141414]">
            {lead.name}
          </span>
          <span className="text-[11px] text-[#999999] font-medium">
            {lead.company ?? "—"}
          </span>
        </div>
      </td>

      {/* Stage badge */}
      <td className="px-4 py-3">
        <span
          className={`inline-flex items-center gap-1.5 px-2 py-0.5 rounded-[4px] text-[11px] font-bold ${stageConfig.bg} ${stageConfig.color}`}
        >
          <span className={`w-1.5 h-1.5 rounded-full ${stageConfig.dot}`} />
          {stageConfig.label}
        </span>
      </td>

      {/* Responsible */}
      <td className="px-4 py-3">
        <div className="flex items-center gap-2">
          <div
            className="w-6 h-6 rounded-full flex items-center justify-center text-[9px] font-bold text-white flex-shrink-0"
            style={{ backgroundColor: lead.responsible.color }}
          >
            {lead.responsible.initials}
          </div>
          <span className="text-[12px] text-[#141414] font-medium">
            {lead.responsible.name}
          </span>
        </div>
      </td>

      {/* Amount */}
      <td className="px-4 py-3">
        {lead.amount > 0 ? (
          <div className="flex flex-col">
            <span className="text-[13px] font-bold text-[#141414]">
              {formatAmount(lead.amount)}
            </span>
            <span className="text-[10px] text-[#999999]">so'm</span>
          </div>
        ) : (
          <span className="text-[12px] text-[#999999]">—</span>
        )}
      </td>

      {/* Last call */}
      <td className="px-4 py-3">
        {lead.lastCall.type === "none" ? (
          <span className="text-[12px] text-[#999999]">—</span>
        ) : (
          <div className="flex items-center gap-1.5">
            {lead.lastCall.type === "answered" ? (
              <Phone size={14} className="text-green-500" weight="bold" />
            ) : (
              <PhoneSlash size={14} className="text-red-500" weight="bold" />
            )}
            <span
              className={`text-[12px] font-medium ${lead.lastCall.type === "missed" ? "text-red-500" : "text-[#666666]"}`}
            >
              {lead.lastCall.time}
            </span>
          </div>
        )}
      </td>

      {/* Source */}
      <td className="px-4 py-3">
        {lead.source === "amocrm" ? (
          <span className="inline-flex px-1.5 py-0.5 rounded-[4px] text-[10px] font-bold bg-indigo-50 text-indigo-600">
            AmoCRM
          </span>
        ) : (
          <span className="text-[12px] text-[#666666] font-medium">
            {sourceLabel}
          </span>
        )}
      </td>

      {/* Date */}
      <td className="px-4 py-3">
        <span className="text-[12px] text-[#999999]">{formatDate(lead.createdAt)}</span>
      </td>
    </tr>
  )
}
