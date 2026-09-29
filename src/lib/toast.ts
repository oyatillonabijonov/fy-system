// App-wide notifications ("Dynamic Island" capsules, rendered by components/ui/Toaster).
// Call toast.success / toast.error from anywhere; mutations can also declare
// `meta: { success }` and get one automatically (MutationCache in main.tsx), and
// every failed mutation shows an error unless it sets `meta: { silent: true }`.
import { cue } from "@/lib/sound"

export type ToastKind = "success" | "error" | "info"
export interface Toast { id: number; kind: ToastKind; title: string; detail?: string }

const MAX = 3
const LIFETIME: Record<ToastKind, number> = { success: 3200, info: 3200, error: 5500 }

let items: Toast[] = []
let seq = 0
const listeners = new Set<() => void>()
const emit = () => listeners.forEach((l) => l())

export function dismiss(id: number) {
  items = items.filter((t) => t.id !== id)
  emit()
}

function push(kind: ToastKind, title: string, detail?: string) {
  const t: Toast = { id: ++seq, kind, title, detail }
  items = [...items, t].slice(-MAX)
  emit()
  cue(kind === "info" ? "ready" : kind)
  setTimeout(() => dismiss(t.id), LIFETIME[kind])
}

export const toast = {
  success: (title: string, detail?: string) => push("success", title, detail),
  error: (title: string, detail?: string) => push("error", title, detail),
  info: (title: string, detail?: string) => push("info", title, detail),
}

export const toastStore = {
  subscribe: (l: () => void) => { listeners.add(l); return () => { listeners.delete(l) } },
  get: () => items,
}

/** A human line for a failed request: no connection vs the server's own message */
export function errorDetail(err: unknown): string {
  if (err instanceof TypeError || (err as { name?: string })?.name === "AuthRetryableFetchError") return "Serverga ulanib bo'lmadi — internetni tekshiring"
  // Supabase/PostgREST errors are plain objects with a message, not Error instances
  const msg = (err as { message?: unknown } | null)?.message
  const m = typeof msg === "string" ? msg : String(err ?? "")
  if (/failed to fetch|networkerror|load failed/i.test(m)) return "Serverga ulanib bo'lmadi — internetni tekshiring"
  return m.length > 140 ? m.slice(0, 137) + "…" : m
}

// Typed `meta` for useMutation
declare module "@tanstack/react-query" {
  interface Register {
    mutationMeta: {
      /** success message; a function may return null for "no toast this time" */
      success?: string | ((data: unknown, vars: unknown) => string | null)
      /** the caller shows its own error — skip the global error toast */
      silent?: boolean
    }
  }
}
