import { expect, test } from "bun:test"
import type { ActiveCall } from "@/context/PhoneContext"
import { addBusyCall, nameBusyCall, pickCallbacks, resumeCall, type CallbackRow } from "./phoneCall"

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

const row = (phone: string, direction: "in" | "out", talk: number, t: string, owner: string | null = null): CallbackRow =>
  ({ phone, direction, talk_time: talk, started_at: t, lead_id: owner ? "l" : null, client: null, lead: owner ? { responsible_user_id: owner } : null })

test("callbacks: unanswered numbers nobody called back, missed calls counted, newest time kept", () => {
  const list = pickCallbacks([   // newest first, as fetched
    row("A", "in", 0, "12:00"), row("A", "in", 0, "11:00", "zuhra"),
    row("B", "out", 0, "11:30"), row("B", "in", 0, "10:00"),        // we called back (even unanswered)
    row("C", "in", 0, "11:20"), row("C", "in", 40, "10:30"), row("C", "in", 0, "09:00"),   // answered once: only the later miss counts
    row("D", "in", 60, "11:10"),
  ])
  expect(list).toEqual([
    { phone: "A", name: null, leadId: "l", ownerId: "zuhra", calls: 2, last: "12:00" },
    { phone: "C", name: null, leadId: null, ownerId: null, calls: 1, last: "11:20" },
  ])
})
