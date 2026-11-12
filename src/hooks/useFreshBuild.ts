import { useEffect } from "react"
import { useLocation } from "react-router-dom"
import { useQueryClient } from "@tanstack/react-query"

// A tab left open keeps the build it loaded, and a deploy can change what the server accepts (096: a lost
// bitim needs a reason — the old page had no way to give one). When the tab comes back or the route changes
// the page re-reads index.html and reloads onto the new build — never over an open dialog, a live call
// (its card is a dialog too), a half-written note or a save on its way.

/** The build file `html` loads when it isn't `mine`; null when it is, or when `html` isn't our page */
export function newerBuild(html: string, mine: string): string | null {
  const theirs = html.match(/\/assets\/index-[\w-]+\.js/)?.[0]
  return theirs && theirs !== mine ? theirs : null
}

let checked = 0

async function refresh() {
  const mine = document.querySelector('script[src^="/assets/index-"]')?.getAttribute("src")   // none in dev
  if (!mine || Date.now() - checked < 60_000) return
  checked = Date.now()
  const res = await fetch("/index.html", { cache: "no-store" }).catch(() => null)
  const next = res?.ok ? newerBuild(await res.text(), mine) : null
  if (!next || sessionStorage.getItem("fy_reloaded") === next) return   // one reload per build: never a loop
  if (document.querySelector("[role=dialog]") || [...document.querySelectorAll("textarea")].some((t) => t.value)) return
  sessionStorage.setItem("fy_reloaded", next)
  window.location.reload()
}

export function useFreshBuild() {
  const { pathname } = useLocation()
  const qc = useQueryClient()
  useEffect(() => {
    const run = () => { if (document.visibilityState === "visible" && !qc.isMutating()) void refresh() }
    run()
    document.addEventListener("visibilitychange", run)
    return () => document.removeEventListener("visibilitychange", run)
  }, [pathname, qc])
}
