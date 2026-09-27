/**
 * One table style for the whole app, in the sidebar's language: a soft pill
 * header row, a hairline (border-line) between rows, a flat fill on row hover.
 * `border-separate` is what lets the header's first/last cells carry the rounded ends.
 */
export const tbl = {
  /** Horizontal scroll wrapper around <table> */
  scroll: "overflow-x-auto no-scrollbar",
  table: "w-full text-left border-separate border-spacing-0",
  th: "h-10 px-4 bg-surface-sunken text-sm font-medium text-ink-muted whitespace-nowrap first:rounded-l-control last:rounded-r-control",
  /** Hover lights the whole row; add `cursor-pointer` for clickable rows.
   *  Text size/colour live on the row so a cell can override them (td inherits). */
  tr: "group text-base text-ink [&:last-child>td]:border-b-0",
  td: "px-4 py-3 border-b border-line transition-colors group-hover:bg-mute-ghost-hover",
  /** Cell background for a selected row (replaces the hover fill) */
  tdSelected: "bg-surface-sunken",
  /** Empty-state cell spanning all columns */
  empty: "px-4 py-12 text-center text-base text-ink-muted",
} as const
