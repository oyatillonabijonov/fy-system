import { expect, test } from "bun:test"
import { burst } from "./burst"

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms))

test("one item is handed over by itself, after the quiet gap", async () => {
  const got: number[][] = []
  const b = burst<number>((x) => got.push(x), 20, 200)
  b.add(1)
  expect(got).toEqual([])
  await sleep(50)
  expect(got).toEqual([[1]])
})

test("items arriving close together come as one batch; a later one starts a new batch", async () => {
  const got: number[][] = []
  const b = burst<number>((x) => got.push(x), 30, 500)
  for (let i = 0; i < 100; i++) b.add(i)
  await sleep(10); b.add(100)   // still inside the quiet gap
  await sleep(70)
  expect(got.map((x) => x.length)).toEqual([101])
  b.add(7)
  await sleep(60)
  expect(got.map((x) => x.length)).toEqual([101, 1])
})

test("a stream that never pauses is still handed over within `max`", async () => {
  const got: number[][] = []
  const b = burst<number>((x) => got.push(x), 40, 100)
  const t0 = Date.now()
  while (Date.now() - t0 < 180) { b.add(1); await sleep(10) }   // an item every 10 ms: the quiet gap never comes
  expect(got.length).toBeGreaterThanOrEqual(1)
  b.cancel()
})

test("cancel drops what is waiting", async () => {
  const got: number[][] = []
  const b = burst<number>((x) => got.push(x), 20, 200)
  b.add(1); b.cancel()
  await sleep(50)
  expect(got).toEqual([])
})
