import { describe, expect, test } from "bun:test"
import {
  analysisPrompt, factsText, namesHint, normalize, recordingVerdict, retryDelayMin, sellerVoice, toRoles, transcriptPrompt,
  type Claim, type Line,
} from "./callAnalysis"

const base: Claim = {
  call_uuid: "u", direction: "in", started_at: new Date("2026-11-10T10:00:00Z"), duration: 60, talk_time: 50, attempts: 0,
  seller_name: "Zuhra Aliyeva", client_name: "Maxmud Rasulov", event_name: "Biznes nonushta", event_date: new Date("2026-11-28T03:30:00Z"),
  tariffs: "Standart: 1800000", script: null,
}
const lines: Line[] = [
  { t: "00:07", voice: "A", text: "Alo" },
  { t: "00:08", voice: "B", text: "Maxmud aka, ismim Zuhra, Fikr yetakchilaridan qo'ng'iroq qilyapman" },
]
const plain: Line[] = [{ t: "00:01", voice: "A", text: "Alo" }, { t: "00:02", voice: "B", text: "Narxi qancha?" }]

describe("prompts", () => {
  test("the names hint carries names and never numbers", () => {
    const h = namesHint(base)
    for (const s of ["Fikr Yetakchilari", "Zuhra", "Maxmud Rasulov", "Biznes nonushta"]) expect(h).toContain(s)
    expect(h).not.toContain("1800000")
    expect(h).not.toContain("28")
  })
  test("the transcription request never sees the price", () => {
    expect(transcriptPrompt(base)).not.toContain("1800000")
  })
  test("facts carry the price, the date and who called", () => {
    const f = factsText(base)
    for (const s of ["1800000", "28.11.2026", "mijoz o'zi qo'ng'iroq qilgan"]) expect(f).toContain(s)
    expect(factsText({ ...base, direction: "out" })).toContain("sotuvchi mijozga qo'ng'iroq qilgan")
  })
  test("missing facts leave no null/undefined in the text", () => {
    const f = factsText({ ...base, seller_name: null, client_name: null, event_name: null, event_date: null, tariffs: null })
    expect(f).not.toContain("null")
    expect(f).not.toContain("undefined")
  })
  test("the analysis request has the transcript, and the script only when there is one", () => {
    const p = analysisPrompt(base, lines)
    expect(p).toContain("00:07 A: Alo")
    expect(p).not.toContain("Sotuv skripti")
    const withScript = analysisPrompt({ ...base, script: "Avval salomlashing" }, lines)
    expect(withScript).toContain("Sotuv skripti")
    expect(withScript).toContain("Avval salomlashing")
  })
})

describe("who is the seller", () => {
  test("a self-introduction overrides the AI's pick", () => {
    expect(sellerVoice(lines, "A", "Zuhra Aliyeva")).toBe("B")
  })
  test("no introduction: the AI's pick stands; no pick at all: A", () => {
    expect(sellerVoice(plain, "B", "Zuhra")).toBe("B")
    expect(sellerVoice(plain, undefined, null)).toBe("A")
  })
  test("both voices name the club: back to the AI's pick", () => {
    const both: Line[] = [{ t: "0", voice: "A", text: "Fikr Yetakchilarimi?" }, { t: "1", voice: "B", text: "Ha, Fikr Yetakchilari" }]
    expect(sellerVoice(both, "B", null)).toBe("B")
  })
  test("voices become seller / client", () => {
    expect(toRoles(lines, "B").map((l) => l.who)).toEqual(["client", "seller"])
  })
})

describe("normalize", () => {
  test("rubbish is refused", () => {
    expect(normalize("x")).toBeNull()
    expect(normalize({ summary: "s" })).toBeNull()
  })
  test("out-of-range numbers are clamped, unknown tags become boshqa, quoteless mistakes are dropped", () => {
    const a = normalize({
      summary: "s", criteria: [{ name: "n", score: 14, comment: "c" }], score: 140,
      mistakes: [{ quote: "q", why: "w", better: "b", tag: "zzz" }, { why: "w" }],
    })
    expect(a?.score).toBe(100)
    expect(a?.criteria[0].score).toBe(10)
    expect(a?.mistakes).toHaveLength(1)
    expect(a?.mistakes[0].tag).toBe("boshqa")
    expect([a?.good, a?.words, a?.advice, a?.script_missed]).toEqual([[], [], [], []])
  })
  test("no score stays no score", () => {
    expect(normalize({ summary: "s", criteria: [], score: null })?.score).toBeNull()
  })
})

describe("retries and the recording", () => {
  test("waits grow, then it gives up", () => {
    expect(retryDelayMin(0)).toBe(2)
    expect(retryDelayMin(4)).toBe(30)
    expect(retryDelayMin(5)).toBeNull()
  })
  test("a recording that isn't there yet is waited for 30 minutes after the call", () => {
    expect(recordingVerdict(200, 300_000, base, new Date("2026-11-10T10:02:00Z"))).toBe("ok")
    expect(recordingVerdict(404, 0, base, new Date("2026-11-10T10:05:00Z"))).toBe("wait")
    expect(recordingVerdict(404, 0, base, new Date("2026-11-10T10:40:00Z"))).toBe("skip")
  })
  test("too big to send inline is skipped", () => {
    expect(recordingVerdict(200, 19_000_000, base, new Date("2026-11-10T10:02:00Z"))).toBe("skip")
  })
})
