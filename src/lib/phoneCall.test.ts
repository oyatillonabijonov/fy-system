import { expect, test } from "bun:test"
import type { ActiveCall } from "@/context/PhoneContext"
import { resumeCall } from "./phoneCall"

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
