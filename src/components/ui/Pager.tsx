/* eslint-disable react-refresh/only-export-components -- PAGE_SIZE and usePaged belong with the Pager */
import { useRef, useState } from "react"
import { CaretLeft, CaretRight } from "@phosphor-icons/react"

/** Rows per page in every table */
export const PAGE_SIZE = 20

/** Client-side paging of an array; jumps back to page 1 when the list length changes (search/filter). */
export function usePaged<T>(items: T[], size = PAGE_SIZE) {
  const [page, setPage] = useState(0)
  const [len, setLen] = useState(items.length)
  if (len !== items.length) {
    setLen(items.length)
    setPage(0)
  }
  const pageCount = Math.max(1, Math.ceil(items.length / size))
  const current = Math.min(page, pageCount - 1)
  return {
    page: current,
    setPage,
    pageCount,
    pageItems: items.slice(current * size, current * size + size),
  }
}

interface PagerProps {
  page: number
  pageCount: number
  total: number
  onPage: (page: number) => void
}

/** Plain pager: "Jami N ta" + Oldingi · 2 / 5 · Keyingi. Scrolls the table back into view on change. */
export function Pager({ page, pageCount, total, onPage }: PagerProps) {
  const ref = useRef<HTMLElement>(null)
  if (pageCount <= 1) return null

  function go(p: number) {
    onPage(p)
    ref.current?.parentElement?.scrollIntoView({ block: "start", behavior: "smooth" })
  }

  const btn =
    "flex items-center gap-1.5 h-control-md px-3.5 rounded-full text-base font-medium text-ink bg-mute-soft hover:bg-mute-soft-hover transition-colors disabled:opacity-40 disabled:pointer-events-none"

  return (
    <nav ref={ref} aria-label="Sahifalar" className="flex items-center justify-between gap-4 pt-4">
      <span className="text-base text-ink-muted tabular-nums">Jami {total} ta</span>
      <div className="flex items-center gap-3">
        <button type="button" onClick={() => go(page - 1)} disabled={page === 0} className={btn}>
          <CaretLeft size={16} /> Oldingi
        </button>
        <span className="text-base text-ink tabular-nums">
          {page + 1} / {pageCount}
        </span>
        <button type="button" onClick={() => go(page + 1)} disabled={page === pageCount - 1} className={btn}>
          Keyingi <CaretRight size={16} />
        </button>
      </div>
    </nav>
  )
}
