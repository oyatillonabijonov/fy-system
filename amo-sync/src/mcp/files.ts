// PDFs waiting to be downloaded through GET /mcp/files/<id>: in memory only, 15 minutes, at most 50.
import { randomToken } from "./crypto"

const TTL_MS = 900_000
const MAX_FILES = 50

interface Entry { name: string; bytes: Uint8Array; exp: number }
const files = new Map<string, Entry>()

function dropExpired(now: number): void {
  for (const [id, f] of files) if (f.exp <= now) files.delete(id)
}

/** Keeps the file for 15 minutes and returns its id (the Map keeps insertion order, so the first key is the oldest). */
export function putFile(name: string, bytes: Uint8Array, now = Date.now()): string {
  dropExpired(now)
  while (files.size >= MAX_FILES) files.delete(files.keys().next().value as string)
  const id = randomToken("")
  files.set(id, { name, bytes, exp: now + TTL_MS })
  return id
}

export function getFile(id: string, now = Date.now()): { name: string; bytes: Uint8Array } | null {
  const f = files.get(id)
  if (!f) return null
  if (f.exp <= now) { files.delete(id); return null }
  return { name: f.name, bytes: f.bytes }
}

/** Tests only */
export function clearFiles(): void {
  files.clear()
}
