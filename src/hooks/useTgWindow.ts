import { useSearchParams } from "react-router-dom"

/** The Telegram chat window's open state lives in the URL (`?tg=1`), so the call card and the phone menu can open it */
export function useTgWindow() {
  const [params, setParams] = useSearchParams()
  const open = params.get("tg") === "1"
  const set = (v: boolean) => setParams((p) => { const n = new URLSearchParams(p); if (v) n.set("tg", "1"); else n.delete("tg"); return n }, { replace: true })
  return [open, set] as const
}
