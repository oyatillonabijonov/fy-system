/**
 * Phone presentation for dialogs (below sm): a bottom sheet — full width, rounded top, a grabber,
 * capped at 92dvh with the body scrolling and the safe area under the footer. From sm up the same
 * markup is the centred dialog it was. Use with hand-built dialogs; `Sheet` wraps it all.
 */
export const sheet = {
  /** Fixed layer: bottom-aligned on a phone, centred from sm */
  wrap: "fixed inset-0 z-[100] flex items-end sm:items-center justify-center sm:p-4",
  /** Panel: add your own `sm:max-w-…` */
  panel: "relative w-full flex flex-col bg-surface-raised rounded-t-[20px] sm:rounded-overlay max-h-[92dvh] sm:max-h-[calc(100dvh-2rem)]",
  /** The little bar on top of a phone sheet */
  grabber: "sm:hidden mx-auto mt-2 mb-1 h-1 w-9 shrink-0 rounded-full bg-mute-soft",
  /** Scrolling body between the header and the footer */
  body: "flex-1 min-h-0 overflow-y-auto overscroll-contain",
  /** Sticky footer; on a phone it clears the home indicator */
  footer: "shrink-0 flex gap-3 p-4 sm:p-5 pb-[calc(16px+env(safe-area-inset-bottom))] sm:pb-5 border-t border-line",
} as const

/** Slide up on a phone, the old fade-and-lift from sm (pass `useMedia("(width < 40rem)")`) */
export const sheetMotion = (phone: boolean) =>
  phone
    ? { initial: { y: "100%" }, animate: { y: 0 }, exit: { y: "100%" }, transition: { duration: 0.22, ease: [0.2, 0, 0, 1] as const } }
    : { initial: { scale: 0.95, opacity: 0, y: 20 }, animate: { scale: 1, opacity: 1, y: 0 }, exit: { scale: 0.95, opacity: 0, y: 20 } }
