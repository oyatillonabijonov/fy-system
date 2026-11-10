import { describe, expect, test } from "bun:test"
import {
  analyseCall, analysisPrompt, factsText, namesHint, normalize, recordingVerdict, retryDelayMin, sellerVoice, toRoles, transcriptPrompt,
  type Ask, type Claim, type Line,
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
  test("no introduction: the AI's pick stands; no pick at all: unknown", () => {
    expect(sellerVoice(plain, "B", "Zuhra")).toBe("B")
    expect(sellerVoice(plain, undefined, null)).toBeNull()
  })
  test("a client asking for the club by name is not taken for the seller", () => {
    const inbound: Line[] = [{ t: "0", voice: "A", text: "Alo, Fikr Yetakchilarimi?" }, { t: "1", voice: "B", text: "Ha, eshitaman" }]
    expect(sellerVoice(inbound, "B", "Zuhra")).toBe("B")
  })
  test("both voices say the seller's introduction: back to the AI's pick", () => {
    const both: Line[] = [{ t: "0", voice: "A", text: "ismim Zuhra" }, { t: "1", voice: "B", text: "ismim Zuhra dedingizmi?" }]
    expect(sellerVoice(both, "B", "Zuhra")).toBe("B")
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
    expect(retryDelayMin(1)).toBe(2)
    expect(retryDelayMin(4)).toBe(20)
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

describe("analyseCall", () => {
  const audio = Buffer.from("mp3")
  const answers = (first: unknown, second: unknown) => {
    const calls: object[][] = []
    const ask: Ask = async (parts) => { calls.push(parts); return { data: calls.length === 1 ? first : second, model: "m" } }
    return { ask, calls }
  }
  test("two requests: audio first, text second; the introduction decides who the seller is", async () => {
    const { ask, calls } = answers({ lines }, { seller_voice: "A", summary: "s", criteria: [], score: 60 })
    const r = await analyseCall(base, audio, ask)
    expect(r.transcript[1].who).toBe("seller")
    expect(r.analysis.score).toBe(60)
    expect(r.model).toBe("m")
    expect(calls).toHaveLength(2)
    expect(JSON.stringify(calls[0])).toContain("inline_data")
    expect(JSON.stringify(calls[1])).not.toContain("inline_data")
  })
  test("an empty transcript is an error", async () => {
    expect(analyseCall(base, audio, answers({ lines: [] }, {}).ask)).rejects.toThrow("transcript bo'sh")
  })
  test("an unreadable analysis is an error", async () => {
    expect(analyseCall(base, audio, answers({ lines }, "garbage").ask)).rejects.toThrow("tahlil o'qilmadi")
  })
  test("nobody can be told to be the seller: an error, not a coin toss", async () => {
    expect(analyseCall({ ...base, seller_name: null }, audio, answers({ lines: plain }, { summary: "s", criteria: [] }).ask)).rejects.toThrow("sotuvchi aniqlanmadi")
  })
  test("a busy model's error comes through", async () => {
    expect(analyseCall(base, audio, async () => { throw new Error("503") })).rejects.toThrow("503")
  })
})
