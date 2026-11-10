import { beforeEach, describe, expect, test } from "bun:test"
import { clearFiles, getFile, putFile } from "./files"

const bytes = (n: number) => new Uint8Array([n, 1, 2])
beforeEach(clearFiles)

describe("files store", () => {
  test("put then get returns the same name and bytes", () => {
    const id = putFile("a.pdf", bytes(7), 1000)
    const f = getFile(id, 2000)
    expect(f?.name).toBe("a.pdf")
    expect(Array.from(f!.bytes)).toEqual([7, 1, 2])
  })
  test("expires after 900 s", () => {
    const id = putFile("a.pdf", bytes(1), 0)
    expect(getFile(id, 899_000)).not.toBeNull()
    expect(getFile(id, 901_000)).toBeNull()
    expect(getFile(id, 0)).toBeNull()
  })
  test("the 51st put evicts the oldest", () => {
    const ids = Array.from({ length: 51 }, (_, i) => putFile(`f${i}.pdf`, bytes(i), i))
    expect(getFile(ids[0]!, 100)).toBeNull()
    expect(getFile(ids[1]!, 100)).not.toBeNull()
    expect(getFile(ids[50]!, 100)).not.toBeNull()
  })
  test("a put drops expired entries first", () => {
    const old = Array.from({ length: 50 }, (_, i) => putFile(`o${i}.pdf`, bytes(i), 0))
    const fresh = putFile("n.pdf", bytes(9), 1_000_000)
    expect(getFile(fresh, 1_000_001)).not.toBeNull()
    expect(getFile(old[0]!, 1)).toBeNull()
  })
  test("ids are 43 url-safe chars and differ", () => {
    const a = putFile("a.pdf", bytes(1)), b = putFile("a.pdf", bytes(1))
    expect(a).toMatch(/^[A-Za-z0-9_-]{43}$/)
    expect(a).not.toBe(b)
  })
  test("unknown id → null", () => {
    expect(getFile("x".repeat(43))).toBeNull()
  })
})
