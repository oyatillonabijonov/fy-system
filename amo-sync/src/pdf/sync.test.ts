import { describe, expect, test } from "bun:test"
import { existsSync, readFileSync } from "node:fs"
import { join } from "node:path"

// The worker's drawing code is a copy of the web's: it must stay identical except for import lines.
const withoutImports = (src: string): string => {
  const out: string[] = []
  let inImport = false
  for (const line of src.split("\n")) {
    if (inImport) { if (/from\s+["'].*["']\s*;?\s*$/.test(line) || /^\s*["'].*["']\s*;?\s*$/.test(line)) inImport = false; continue }
    if (/^import\b/.test(line)) { if (!/from\s+["'].*["']\s*;?\s*$/.test(line) && !/^import\s+["']/.test(line)) inImport = true; continue }
    out.push(line)
  }
  return out.join("\n")
}

const pairs: [string, string][] = [
  ["drawStickers.ts", "stickers"],
  ["drawSigns.ts", "signs"],
]

describe("worker copies match the web", () => {
  for (const [file, dir] of pairs) {
    const web = join(import.meta.dir, "..", "..", "..", "src", "lib", dir, file)
    const run = existsSync(web) ? test : test.skip
    run(`${file}`, () => {
      const copy = readFileSync(join(import.meta.dir, file), "utf8")
      expect(withoutImports(copy)).toBe(withoutImports(readFileSync(web, "utf8")))
    })
  }
})
