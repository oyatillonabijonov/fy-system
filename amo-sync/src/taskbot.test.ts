import { expect, test } from "bun:test"
import { resolveTasks, confirmation, buildPrompt, taskText } from "./taskbot"

const staff = [
  { id: "s1", full_name: "Jahongir Qahramonov", telegram: "@Jahongir_Qahramonov", role: "xodim" },
  { id: "s2", full_name: "Hikmat Abdurahmonov", telegram: null, role: "xodim" },
]
const events = [{ id: "e1", name: "Tog' safari 7.0 | Amirsoy", start: "2026-10-23", end: "2026-10-25", sections: ["Resort"] }]

test("owner by @username (any case), by exact staff name, or outside; event/date validated", () => {
  const r = resolveTasks({ tasks: [
    { title: " Amirsoy Resort to'lovlarini qilish ", assignee_username: "@jahongir_qahramonov", due_date: "2026-09-30", event: "Tog' safari 7.0 | Amirsoy", section: "Resort" },
    { title: "Spikerlarni tasdiqlatish", assignee_name: "Hikmat Abdurahmonov", due_date: "3-oktabr", event: "Noma'lum tadbir", section: "X" },
    { title: "Banner", assignee_name: "Dizayn agentlik" },
    { title: "  " },
  ] }, staff, events)
  expect(r).toHaveLength(3)
  expect(r[0]).toMatchObject({ title: "Amirsoy Resort to'lovlarini qilish", assignee_id: "s1", assignee_name: null, due_date: "2026-09-30", section: "Resort", owner_label: "@Jahongir_Qahramonov" })
  expect(r[0].event?.id).toBe("e1")
  expect(r[1]).toMatchObject({ assignee_id: "s2", due_date: null, event: null, section: null, owner_label: "Hikmat Abdurahmonov" })
  expect(r[2]).toMatchObject({ assignee_id: null, assignee_name: "Dizayn agentlik" })
})

test("confirmation shows owner, date and event › section, escaped", () => {
  const r = resolveTasks({ tasks: [{ title: "A <b>", assignee_username: "@Jahongir_Qahramonov", due_date: "2026-09-30", event: "Tog' safari 7.0 | Amirsoy", section: "Resort" }] }, staff, events)
  expect(confirmation(r)).toBe("✅ <b>Vazifa qo'shildi</b>\nA &lt;b&gt;\n👤 @Jahongir_Qahramonov · 📅 30-sentyabr · 📌 Tog' safari 7.0 | Amirsoy › Resort")
})

test("prompt carries today's weekday, staff handles and reply context", () => {
  const p = buildPrompt("ertagacha qil", "Resort narxlari keldi", "Oyatillo", "2026-09-29", "19:40", staff, events)
  expect(p).toContain("Bugun: 2026-09-29 (seshanba), hozir soat 19:40")
  expect(p).toContain("Hikmat Abdurahmonov — yo'q")
  expect(p).toContain('"""Resort narxlari keldi"""')
})

test("trigger: /vazifa@bot or @bot mention; bare /vazifa and other commands are left alone", () => {
  expect(taskText("/vazifa@fymoliyabot Resort to'lovi, @Jahongir_Qahramonov, ertaga", "fymoliyabot")).toBe("Resort to'lovi, @Jahongir_Qahramonov, ertaga")
  expect(taskText("/VAZIFA@FYmoliyabot  menyu", "fymoliyabot")).toBe("menyu")
  expect(taskText("@fymoliyabot banner tayyorlash", "fymoliyabot")).toBe("banner tayyorlash")
  expect(taskText("/vazifa Amirsoy to'lovi", "fymoliyabot")).toBeNull()
  expect(taskText("/start@otherbot @fymoliyabot", "fymoliyabot")).toBeNull()
  expect(taskText("э хазлми бу?", "fymoliyabot")).toBeNull()
})

test("due time kept only as HH:MM with a date; shown in the confirmation", () => {
  const r = resolveTasks({ tasks: [
    { title: "Jamoa bilan video meet", assignee_username: "@Jahongir_Qahramonov", due_date: "2026-09-30", due_time: "14:00" },
    { title: "Soat noto'g'ri", due_date: "2026-09-30", due_time: "2 da" },
    { title: "Sanasiz soat", due_time: "09:00" },
  ] }, staff, events)
  expect(r.map((t) => t.due_time)).toEqual(["14:00", null, null])
  expect(confirmation([r[0]])).toContain("📅 30-sentyabr, 14:00")
})
