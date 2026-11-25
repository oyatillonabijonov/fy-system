import { describe, expect, test } from "bun:test"
import { inputDigits, isForeign, pastedPhone, phoneFromInput, validPhone } from "./phone"

describe("validPhone", () => {
  test("a full Uzbek number, or another country's with its code", () => {
    expect(validPhone("+998901234567")).toBe(true)
    expect(validPhone("+79991234567")).toBe(true)      // Russia
    expect(validPhone("+12125550123")).toBe(true)      // USA
    expect(validPhone("+8613800138000")).toBe(true)    // China
  })
  test("a half-typed or junk number is not", () => {
    expect(validPhone("+99890123456")).toBe(false)     // Uzbek, one digit short
    expect(validPhone("+9989012345678")).toBe(false)   // Uzbek, one too many
    expect(validPhone("+7999")).toBe(false)
    expect(validPhone("901234567")).toBe(false)        // no country code
    expect(validPhone("")).toBe(false)
    expect(validPhone(null)).toBe(false)
  })
})

describe("the phone field's two modes", () => {
  test("Uzbek: nine local digits behind +998", () => {
    expect(phoneFromInput("90 123-45-67", false)).toBe("+998901234567")
    expect(phoneFromInput("9012345678999", false)).toBe("+998901234567")   // cut at nine
    expect(phoneFromInput("", false)).toBe("")
    expect(inputDigits("+998901234567", false)).toBe("901234567")
  })
  test("another country: the whole number behind +, up to 15 digits", () => {
    expect(phoneFromInput("7 999 123-45-67", true)).toBe("+79991234567")
    expect(phoneFromInput("+7 (999) 123 45 67", true)).toBe("+79991234567")
    expect(phoneFromInput("1234567890123456789", true)).toBe("+123456789012345")
    expect(phoneFromInput("", true)).toBe("")
    expect(inputDigits("+79991234567", true)).toBe("79991234567")
  })
  test("isForeign: a stored number that is not Uzbek opens the field in the other mode", () => {
    expect(isForeign("+79991234567")).toBe(true)
    expect(isForeign("+998901234567")).toBe(false)
    expect(isForeign("+998")).toBe(false)
    expect(isForeign("")).toBe(false)
  })
})

describe("pastedPhone", () => {
  test("an Uzbek number in any shape stays Uzbek", () => {
    expect(pastedPhone("+998 90 123 45 67")).toEqual({ foreign: false, value: "+998901234567" })
    expect(pastedPhone("998901234567")).toEqual({ foreign: false, value: "+998901234567" })
    expect(pastedPhone("90-123-45-67")).toEqual({ foreign: false, value: "+998901234567" })
  })
  test("a number with another country's code switches the field", () => {
    expect(pastedPhone("+7 (999) 123-45-67")).toEqual({ foreign: true, value: "+79991234567" })
    expect(pastedPhone("0044 20 7946 0958")).toEqual({ foreign: true, value: "+442079460958" })
  })
})
