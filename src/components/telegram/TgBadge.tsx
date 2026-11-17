// Unread Telegram replies (100): a red count pill on Kanban cards, the bitim cards and the "Bitimlar" menu item.
import { TelegramLogo } from "@phosphor-icons/react"

export function TgBadge({ n, icon }: { n: number; icon?: boolean }) {
  if (!n) return null
  return (
    <span aria-label={`Telegram: ${n} ta o'qilmagan`} className="shrink-0 h-5 min-w-5 px-1.5 inline-flex items-center justify-center gap-1 rounded-full bg-danger text-white text-xs font-semibold tabular-nums">
      {icon && <TelegramLogo size={12} weight="bold" />}{n > 99 ? "99+" : n}
    </span>
  )
}
