import { useEffect, useEffectEvent, useRef } from "react"

const FOCUSABLE =
  'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])'

// Open dialogs, innermost last — only the top one reacts to Escape/Tab (nested modals, e.g. ImageCropModal).
const stack: HTMLElement[] = []

/**
 * Modal keyboard behaviour for hand-built dialogs: Escape calls `onClose`, Tab stays inside,
 * focus moves in on open and returns to the opener on close.
 * Attach the returned ref to the dialog panel together with
 * `role="dialog" aria-modal="true" aria-labelledby={titleId} tabIndex={-1}`.
 * Pass the same guarded close the backdrop uses (e.g. `() => !saving && onClose()`).
 */
export function useDialog<T extends HTMLElement>(onClose: () => void, open = true) {
  const ref = useRef<T>(null)
  const close = useEffectEvent(onClose)

  useEffect(() => {
    const el = ref.current
    if (!open || !el) return
    const opener = document.activeElement as HTMLElement | null
    stack.push(el)
    if (!el.contains(document.activeElement)) (el.querySelector<HTMLElement>(FOCUSABLE) ?? el).focus()

    function onKey(e: KeyboardEvent) {
      if (!el || stack[stack.length - 1] !== el) return
      if (e.key === "Escape") {
        // An inner control (inline edit field) already handled this Escape — don't close the dialog too.
        if (e.defaultPrevented) return
        e.preventDefault()
        close()
      } else if (e.key === "Tab") {
        const items = [...el.querySelectorAll<HTMLElement>(FOCUSABLE)].filter((n) => n.offsetParent !== null)
        if (items.length === 0) return e.preventDefault()
        const first = items[0]
        const last = items[items.length - 1]
        if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus() }
        else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus() }
      }
    }
    document.addEventListener("keydown", onKey)
    return () => {
      document.removeEventListener("keydown", onKey)
      stack.splice(stack.indexOf(el), 1)
      opener?.focus()
    }
  }, [open])

  return ref
}
