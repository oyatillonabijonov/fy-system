import { describe, expect, test } from "bun:test"
import { anketaError, fieldChanges } from "./anketa"

describe("anketa", () => {
  test("fieldChanges: only fields the client changed to something non-empty", () => {
    expect(fieldChanges({ full_name: "Ali", company: "", role: "x", activity: "" }, { full_name: "Ali Valiyev", company: "Savdo", role: " x ", activity: "" }))
      .toEqual(["full_name", "company"])
  })
  test("anketaError: Uzbek text per code, a generic one otherwise", () => {
    expect(anketaError("anketa_invalid")).toContain("eskirgan")
    expect(anketaError("boom")).toContain("Yuborilmadi")
  })
})
