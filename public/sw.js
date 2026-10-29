// Installed-app (PWA) service worker: only lets the app open without a network. Pages are fetched
// network-first (a deploy shows up at once) with the last index.html as the offline fallback; the
// build files that page loads (/assets/, content-hashed) are kept cache-first. A new index.html means
// a new deploy, so the old build files are dropped then — the cache never grows past one build.
// API calls (another origin) are never touched.
const SHELL = "fy-shell-v1"
const ASSETS = "fy-assets-v1"

self.addEventListener("install", (e) => {
  e.waitUntil(caches.open(SHELL).then((c) => c.add("/index.html")))
  self.skipWaiting()
})
self.addEventListener("activate", (e) => {
  e.waitUntil(caches.keys().then((keys) => Promise.all(keys.filter((k) => k !== SHELL && k !== ASSETS).map((k) => caches.delete(k)))))
  self.clients.claim()
})

async function page(req) {
  try {
    const res = await fetch(req)
    if (res.ok) {
      const shell = await caches.open(SHELL)
      const [fresh, old] = await Promise.all([res.clone().text(), shell.match("/index.html").then((r) => r?.text())])
      if (fresh !== old) {
        await caches.delete(ASSETS)
        await shell.put("/index.html", new Response(fresh, { headers: { "Content-Type": "text/html; charset=utf-8" } }))
      }
    }
    return res
  } catch {
    return (await caches.match("/index.html")) ?? Response.error()
  }
}

async function asset(req) {
  const hit = await caches.match(req)
  if (hit) return hit
  const res = await fetch(req)
  if (res.ok) { const copy = res.clone(); caches.open(ASSETS).then((c) => c.put(req, copy)) }
  return res
}

self.addEventListener("fetch", (e) => {
  const url = new URL(e.request.url)
  if (e.request.method !== "GET" || url.origin !== self.location.origin) return
  if (e.request.mode === "navigate") e.respondWith(page(e.request))
  else if (url.pathname.startsWith("/assets/")) e.respondWith(asset(e.request))
})
