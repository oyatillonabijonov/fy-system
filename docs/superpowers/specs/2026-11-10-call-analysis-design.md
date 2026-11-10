# AI analysis of sales calls — design

Date: 2026-11-10. Status: waiting for the owner's approval. Nothing is built yet.

## Why

Sellers talk to leads on the browser phone; every answered call is recorded (OnlinePBX) and listed in
Sotuv bo'limi → Qo'ng'iroqlar. Today nobody has time to listen to them, so sellers get no feedback and
the owner can't see who sells well. The owner wants what metasell.ai / deepsales.uz sell, built into
FY-System: each call written down and judged by AI, with concrete coaching — what was said wrong, what
to say instead, which filler words to drop, why.

## Goals

1. Every answered call (any length, incoming and outgoing) is analysed **by itself**, a few minutes
   after it ends. Nobody presses a button.
2. Per call: the transcript, a 2–3 sentence summary, the outcome, a score 0–100, six criteria 0–10,
   what went well, mistakes (the seller's exact words → why it's wrong → a ready sentence to say
   instead), filler words with counts, 2–4 pieces of advice.
3. A seller sees the analysis of **their own** calls. Admins and managers see everyone's.
4. A manager view: per seller — average score, week-by-week trend, the 3 most repeated mistakes.
5. A sales script the owner can write and edit inside the system. When it exists the AI compares the
   call with it; when it's empty the AI uses general sales rules (the six criteria below).

## Non-goals

- Old calls. Only calls that end after the feature is switched on are analysed.
- Live coaching during a call, emotion/tone analysis, automatic CRM changes from a call (moving the
  bitim, creating tasks). The analysis is read-only advice.
- Telegram messages about analyses.
- A polished visual design. The owner said the look will be tuned later; the first version follows the
  app's existing patterns (see "Screens").
- A paid Gemini tier. Free tier now; the owner will connect a paid one later (it must be a matter of
  changing an env value, not code).

## Anti-goals (would make it a failure even if it "works")

- **Blaming the seller for something the client said or for the AI's own mishearing.** This is the main
  quality risk found in the spike (below) and the design is built around it.
- A seller seeing another seller's analyses.
- An AI outage slowing or breaking the phone, the call log, or the rest of amo-sync.
- Burning the free quota in a loop (endless retries).

## What the spike showed (3 real calls: 41 s, 2 min 28 s, 7 min 34 s)

Throwaway; nothing of it is in the repo. Facts the builder should rely on:

- Recordings are **mono mp3** (~2 KB/s; the 7.5-minute call is 925 KB) — the two sides can't be split
  by channel. Server-side, `audioLink(uuid, base)` in `amo-sync/src/pbx.ts` gives a link that returns
  the whole file; inline base64 to Gemini works (same call shape as `askGemini` in `taskbot.ts`).
- Audio costs ~25–32 tokens per second. Volume is ~20 answered calls/day, ~1 hour of audio ≈ 110k
  audio tokens/day.
- Only `gemini-3.5-flash-lite` answered reliably on the free key (6–15 s per call, sometimes a 503 that
  passes on retry). `gemini-3.8-flash` and `gemini-3.5-flash` returned 503 or hung past 2 minutes every
  time. So v1 quality = the light model's quality.
- Structured output (`responseMimeType: application/json` + `responseSchema`) works with audio.
- **One request (audio → transcript + roles + analysis) mixes up seller and client**, worst on incoming
  calls, and then criticises the seller for the client's words. Telling it the names/gender in the same
  request did not fix it.
- **Two requests fixed the worst case:** (1) audio → transcript with neutral voices A/B; (2) text only →
  decide which voice is the seller from the content, then analyse only the seller. On the three calls:
  2 of 3 roles right in the `seller_voice` field; in the third the field was wrong but the reasoning and
  the criticism were about the right person. Single lines still flip voice now and then.
- **Giving known names fixes misheard names** ("afetakchilari" → "Fikr Yetakchilari", "Muxurdev" →
  "Mohirdev"). **But giving numbers to the transcription step corrupts it**: with the price 1 800 000 in
  the hint, a spoken "2 million" was written as "1 800 000". Names may go to step 1; prices, dates and
  other facts only to step 2.
- Uzbek transcription is good enough to coach from; the long call's analysis was genuinely useful
  (caught "tadbirkor bo'lmasangiz, maslahat bermaymiz" at 03:00 with a replacement line; "xo'p" ×15).

## How it works

Decided by the owner: automatic for every answered call; who sees what; the manager numbers; the
editable script; free Gemini now. Everything else in this section is the author's call.

### Pipeline (in `amo-sync`, the only scheduled worker)

1. A new timer (own minute tick, like `missedCalls.ts`) picks answered calls (`talk_time > 0`) that
   started after the switch-on moment and have no analysis row, oldest first, **one at a time**.
2. Download the recording through the existing `audioLink` path.
3. **Step 1 — transcript.** Audio + a short prompt → lines `{t, voice: "A"|"B", text}` in the spoken
   language (Uzbek in Latin, Russian in Cyrillic), `[tushunarsiz]` where inaudible, nothing invented.
   Hint: names only (club, seller's name, client's name, the event's name, speakers if known).
4. **Step 2 — analysis.** Text only: transcript + facts (call direction, seller name, client name, the
   bitim's voronka event with date and tariffs when there is one) + the sales script if set → which voice
   is the seller and why, then the analysis of the seller only. All comments in Uzbek, whatever the
   call's language. The prompt says garbled text may be the recording's or the transcriber's fault and
   must not be held against the seller.
5. Save and mark done. The web gets it live (the table joins the realtime publication and `LiveSync`).

Failure handling: a busy model (503/timeout, 120 s limit per request) → try again on a later tick, up
to 5 attempts spread over about an hour, then `failed` with the reason; a `failed` row can be re-queued
by an admin from the call's analysis panel ("Qayta tahlil"). A recording that isn't there yet is not
"missing": the spike only used old calls, so how soon OnlinePBX publishes a recording is unknown — the
call stays `pending` and is retried for 30 minutes after it ended; only then, or with almost no speech,
it ends as `skipped` (no score). **Switch-on moment** = when migration `090` is applied (stored by the
migration); there is no on/off switch in the UI — without `GEMINI_API_KEY` the worker is simply off,
and calls that ended while it was off for more than a day are not picked up later (no backlog flood). Calls with no staff member (`staff_id` NULL) are
analysed too; only admins/managers see them. Models come from an env list (default
`gemini-3.5-flash-lite`), so the paid model later is an env change. A daily cap on requests (env,
default generous for ~20 calls) stops a runaway loop.

Short or empty calls ("bandman, keyin", wrong number): the AI is told to say so and to give **no
score** (`score` NULL) rather than a low one; they're excluded from averages.

### Criteria (until a script exists)

Salomlashish va o'zini tanishtirish · Mijoz ehtiyojini aniqlash · Taklifni tushuntirish (foyda orqali) ·
E'tirozlarga javob · Keyingi qadamni kelishish · Nutq madaniyati (ortiqcha so'zlar, ishonch, tinglash).
Each 0–10 or "not applicable". With a script, the same six stay (so trends remain comparable) and the
AI additionally reports which script steps were skipped.

### Repeated mistakes

To count "top 3 repeated mistakes", each mistake carries one tag from a fixed list the AI must choose
from (e.g. o'zini tanishtirmadi, ehtiyojni so'ramadi, foydani aytmadi, e'tirozga javob bermadi, keyingi
qadam yo'q, mijozni sovutadigan gap, ortiqcha so'zlar, mijozni tinglamadi, boshqa). The manager view
counts tags; clicking one shows the calls behind it. The exact list is the builder's to finalise.

### Data

One new migration (`090`), nothing existing edited:

- A table of analyses, one row per call (keyed by the call's uuid, deleted with the call): status
  (`pending/done/failed/skipped`), attempts, model, language, transcript, seller voice, summary, outcome,
  score, criteria, good, mistakes (with tags), words to drop, advice, script-steps-skipped, error, times.
- Read access: `sotuv-crmn` permission AND (admin or manager, or the call's `staff_id` is the reader).
  No write policy — only amo-sync (owner role) writes. The re-queue action is a small SECURITY DEFINER
  function for admins.
- The sales script: one text (single row), readable by `sotuv-crmn`, editable by admins.
- The manager numbers come from a DB function (per seller, for a period: calls analysed, average score,
  weekly averages, tag counts), not summed in the browser — same rule as the Dashboard and Moliya.
- "Manager" = `profiles.role` in (`admin`, `manager`).

### Screens (first version, plain; look tuned later with the owner)

- **Qo'ng'iroqlar page and the bitim feed:** an answered call shows its score as a small badge (or
  "tahlil qilinmoqda" / nothing). Tapping opens the analysis: score + outcome + summary, criteria, good,
  mistakes ("Aytdi → Nega → O'rniga"), words to drop, advice, and the transcript (collapsed) with the
  seller/client labelled, beside the existing recording player. A visible note: "AI tahlili — xato
  bo'lishi mumkin". Works as a bottom sheet on a phone.
- **Manager view** (admins/managers; a tab or page next to Qo'ng'iroqlar): period filter; one row per
  seller — calls analysed, average score, weekly trend, top 3 mistake tags; opens into that seller's
  calls. A seller sees the same block for themself only.
- **Sales script:** a text field in the sales settings (admin), with a line saying the AI compares calls
  with it once it's filled.
- UI copy in Uzbek; existing tokens, `tbl`/`Pager`, `Sheet`; no new dependencies expected.

## Constraints

- Project rules in `CLAUDE.md` apply: bun, strict TS with no `any`, new numbered migration + SQL test on
  a throwaway Postgres (never prod), backup before applying to prod, secrets only in Doppler/container
  env, no commits without the owner's confirmation.
- The Gemini key is the existing `GEMINI_API_KEY`; it never reaches the browser.
- Privacy: on the free tier Google may use the audio for training — the owner was told and accepted.
- The task bot shares the same key and quota; call analysis must not starve it (one call at a time, the
  daily cap).

## Known limits to tell the owner at hand-over

- With the light free model, some lines will still be attributed to the wrong person and some names
  misheard; the note on the panel says so. A paid/stronger model is the real fix and is one env change.
- Scores from the light model are rough (±10); trends over weeks are more trustworthy than one call.

## Left to the builder

Table/column/function names, the exact prompts and JSON schemas (start from the spike's wording above),
the tag list, retry timing, how the pure parts are unit-tested (`bun test`: prompt building, picking the
facts, mapping A/B to seller/client), file layout in `amo-sync/src/` and `src/components/sotuv/`.
