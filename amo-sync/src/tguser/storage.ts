// The private bucket telegram-files, reached straight at the storage service on the Docker network.
// Auth is a short service_role JWT we sign with JWT_SECRET (the same secret the stack signs keys with),
// so the worker needs no extra key.
const BASE = (process.env.STORAGE_URL ?? "http://storage:5000").replace(/\/$/, "")
const BUCKET = "telegram-files"

const b64u = (b: Uint8Array | string) =>
  btoa(typeof b === "string" ? b : String.fromCharCode(...b)).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "")

async function serviceJwt(): Promise<string> {
  const head = b64u(JSON.stringify({ alg: "HS256", typ: "JWT" }))
  const body = b64u(JSON.stringify({ role: "service_role", iss: "amo-sync", exp: Math.floor(Date.now() / 1000) + 300 }))
  const key = await crypto.subtle.importKey("raw", new TextEncoder().encode(process.env.JWT_SECRET ?? ""), { name: "HMAC", hash: "SHA-256" }, false, ["sign"])
  const sig = new Uint8Array(await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(`${head}.${body}`)))
  return `${head}.${body}.${b64u(sig)}`
}

const url = (path: string) => `${BASE}/object/${BUCKET}/${path.split("/").map(encodeURIComponent).join("/")}`

export type FileStore = { put(path: string, data: Uint8Array, mime: string): Promise<void> }

export const bucket: FileStore & { get(path: string): Promise<Uint8Array> } = {
  async put(path, data, mime) {
    const res = await fetch(url(path), { method: "POST", headers: { authorization: `Bearer ${await serviceJwt()}`, "content-type": mime, "x-upsert": "true" }, body: data.slice() })
    if (!res.ok) throw new Error(`storage put ${res.status}: ${await res.text()}`)
  },
  async get(path) {
    const res = await fetch(url(path), { headers: { authorization: `Bearer ${await serviceJwt()}` } })
    if (!res.ok) throw new Error(`storage get ${res.status}`)
    return new Uint8Array(await res.arrayBuffer())
  },
}

/** A file name safe as one storage path segment */
export const safeName = (name: string) => name.replace(/[^\p{L}\p{N}._-]+/gu, "_").slice(-80) || "fayl"
