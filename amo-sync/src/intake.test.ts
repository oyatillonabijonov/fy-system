import { expect, test } from "bun:test"
import { parseLead } from "./intake"

test("Tilda form: name/phone by field name, the rest as details, service fields dropped", () => {
  const p = parseLead({ Name: "Aziz Karimov", Phone: "+998 (90) 123-45-67", Soha: "IT", tranid: "123:456", formid: "form1", COOKIES: "x" })
  expect(p).toEqual({ name: "Aziz Karimov", phone: "+998 (90) 123-45-67", details: "Soha: IT", fields: [{ k: "Soha", v: "IT" }] })
})

test("Meta lead form: first + last name, phone_number, custom questions kept", () => {
  const p = parseLead({ first_name: "Malika", last_name: "Umarova", phone_number: "+998901112233", "qaysi_tadbir?": "Safar 8.0" })
  expect(p).toEqual({ name: "Malika Umarova", phone: "+998901112233", details: "qaysi tadbir?: Safar 8.0", fields: [{ k: "qaysi tadbir?", v: "Safar 8.0" }] })
})

test("unknown field names: a phone-looking value is still found", () => {
  const p = parseLead({ "Ismingiz": "Bobur", "Bog'lanish uchun": "90 123 45 67", "Izoh": "kechqurun" })
  expect(p.name).toBe("Bobur")
  expect(p.phone).toBe("90 123 45 67")
  expect(p.details).toBe("Izoh: kechqurun")
})

test("empty values are ignored", () => {
  expect(parseLead({ name: "", phone: " ", email: "a@b.uz" })).toEqual({ name: "", phone: "", details: "email: a@b.uz", fields: [{ k: "email", v: "a@b.uz" }] })
})
