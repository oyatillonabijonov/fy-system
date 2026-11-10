import { expect, test } from "bun:test"
import type { ActiveCall } from "@/context/PhoneContext"
import { addBusyCall, nameBusyCall, resumeCall } from "./phoneCall"

const ended: ActiveCall = { id: "a", dir: "out", phone: "+998901112233", state: "ended", answeredAt: 1000, muted: true, contact: { name: "Madina", leadId: "l", leadName: "Madina" } }

test("the same call comes back on its card: active again, timer and contact kept, mic unmuted", () => {
  expect(resumeCall(ended, "a", {})).toEqual({ ...ended, state: "active", muted: false })
})

test("a call dropped while still dialing gets a running timer", () => {
  expect(resumeCall({ ...ended, answeredAt: null }, "a", {}).answeredAt).toBeGreaterThan(0)
})

test("no card left: rebuilt from the dialog, direction from display_direction", () => {
  const c = resumeCall(null, "b", { display_direction: "outbound", remote_caller_id_number: "998901112233" })
  expect(c).toMatchObject({ id: "b", dir: "out", phone: "998901112233", state: "active", muted: false })
  expect(resumeCall(ended, "b", {}).dir).toBe("in")
})

test("a caller offered again stays one row, moves to the top and keeps the name", () => {
  const named = nameBusyCall(addBusyCall([], "998901112233"), "+998 90 111 22 33", "Madina")
  const list = addBusyCall(addBusyCall(named, "998935556677"), "+998901112233")
  expect(list).toEqual([{ phone: "+998901112233", name: "Madina" }, { phone: "998935556677", name: null }])
})

test("a hidden number adds no row", () => {
  expect(addBusyCall([], "")).toEqual([])
})
