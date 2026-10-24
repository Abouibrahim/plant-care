# Phase 4 — Health: diagnosis

Done when Mohamed can photograph a problem on a plant from its screen, add a note, and read a diagnosis written against that plant's context (species profile, age, site, the last 30 days of tasks): likely causes with their likelihood, the checks to do on site, the organic treatment, prevention, an urgency and when to re-photograph. The photo is saved in the plant's journal with its summary, "Mark treated" logs the treatment there, and the re-photograph date becomes a task on Today, in the plant's calendar and in the push digest, on the deployed Vercel URL.

Reference: the Phase 4 line of the build plan, block E of the attribute table and the diagnose row of the identification pipeline table in `docs/SPEC.md`; the API and Claude call conventions in `CLAUDE.md` (`max_tokens` 2048 for diagnose). The output is defined by `prompts/diagnose.md` and `prompts/diagnose.schema.json`, which already exist.

## Setup (Mohamed does the parts marked ★)

- [x] Nothing new to create: the route uses `ANTHROPIC_API_KEY`, `SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY`, already set in Vercel; the `photos` table already has the kind `problem` and the `ai_result` column, and the `tasks` table takes the two new kinds of row without a schema change.
- [ ] ★ After the deploy, tap "Reload" on the update banner (or close and reopen the installed app) so the phone runs the 0.4.0 shell before the tests below.

## Build

- [x] `api/_images.ts`: the image validation of `api/identify.ts` (1 or 2 images, media type, raw base64, size) moved to a helper both routes import.
- [x] `api/diagnose.ts`: bearer check first (`verifyUser`), then `POST { plant_id, images, note? }`. Loads the plant with its species through the service client (404 when missing) and the plant's tasks of the last 30 days: those acted in that time and those still pending with a due date up to today. User message: the images first with `Image 1:` labels (`imagesThenText`), then the text: today's date and month, the species (names, water, sun, salinity, climate note, site fit, the pests with their months), the plant (tag, site, zone, quantity, source, planting date with its age in months and stage from `src/lib/dates.ts`), the recent tasks with date, type, title and status, and the grower's note. `callJson` with `prompts/diagnose.md` and `diagnose.schema.json`, `max_tokens` 2048 (one retry at double when the output is cut), effort medium; a refusal is returned as `{ refusal }` with HTTP 200 like identify. Response: the diagnosis plus the usage fields.
- [x] `src/types.ts`: `Diagnosis`, `LikelyCause`, `CauseKind`, `Urgency`, `DiagnoseRequest`, `DiagnoseResponse`, `ProblemAiResult` (the diagnosis, the usage and the note, as stored in `photos.ai_result`), `DIAGNOSIS_RULE_PREFIX`. `src/lib/api.ts`: `api.diagnose`.
- [x] Plant screen: the "Diagnose (Phase 4)" button becomes "Diagnose" and opens the flow as a full-screen panel: take or pick a photo (`prepareImage`, the capture screen's `PhotoButton`), an optional note "What you see", Send. While Claude answers the panel shows a spinner; the result card shows the summary, the urgency pill (today, this week, watch), the likely causes with likelihood bars (`ConfidenceBar`) and their kind and evidence, the checks to do, the organic treatment, prevention, "Re-photograph in N days" with the date, and the usage line. A refusal shows its text.
- [x] The photo is saved after the answer: upload to Storage and a `photos` row of kind `problem` with `note` = the grower's note and `ai_result` = the diagnosis plus the usage and the note (`uploadPhoto`, `insertPhoto`). If the save fails the result stays on screen with the error and a "Save again" button; the treatment and follow-up buttons wait for the saved row.
- [x] Journal: a problem photo's entry shows the urgency pill, the summary and the note, and an "Open" button that reopens the diagnosis in the same panel; a past diagnosis shows the state of its treatment and of its re-photograph task.
- [x] "Mark treated" on the result: an optional line "What you applied", then a `tasks` row of type `protect`, `rule_key` `diagnosis:<photo_id>`, `due_on` today, status `done`, `acted_at` now, note "Treated: …" (what was applied, or the top cause), so it appears in the `journal` view with the Protect and Done pills. A second treatment on the same day is a no-op.
- [x] The re-photograph task: created when the diagnosis is saved and `rephotograph_in_days` is 1 or more: type `scout`, the same `diagnosis:<photo_id>` rule key, `due_on` today + N, title "Re-photograph <tag>: <cause>" and the first check as instruction; when the top cause is a pest with likelihood 0.5 or more the title reads "Scout <tag> for <cause>" instead. It shows on Today when due, on the plant's Calendar tab, and in the push digest; Done, Skip and Snooze work on it like on any task. If its creation fails the card offers "Set the reminder".
- [x] `api/_tasks.ts`: `runExpansion` keeps every pending task whose `rule_key` starts with `diagnosis:` when it removes the tasks of rules that no longer apply (a small, delimited change). The schema comment "never typed by hand" bends here; both are recorded in `docs/DECISIONS.md`.
- [x] Health tab: under the species' pests, "Past diagnoses" lists the plant's problem photos newest first with date, urgency, summary and top cause, each opening the diagnosis. Feeding a confirmed pest into the species `pests` list is left out (see `docs/DECISIONS.md`).
- [x] All new strings in `src/i18n/en.ts` (the task titles and the "Treated:" note too, since the app writes them); the Settings phase card reads Phase 4; version 0.4.0 in `package.json` and `src/version.ts`; README mentions the route; `docs/DECISIONS.md` lists the deviations.

## Acceptance tests

Tests 2 to 6 run on the phone with the installed app on 0.4.0, on a real problem (a leaf with spots, a sticky shoot, a scorched edge); any plant will do, the persimmon in the backyard or the papaya at the farm.

1. Server: `POST /api/diagnose` without a token → 401; with a token but no `plant_id` → 400; with an unknown `plant_id` → 404.
2. Phone: open the plant → Diagnose → Take a photo → the preview shows; type a note ("yellow edges on the lower leaves") → Send → within a minute the result card shows the summary, the urgency pill, one to three causes with bars, the checks, the treatment, prevention, "Re-photograph in N days" with the date, and the usage line. The Claude Console usage page moves by one call.
3. Phone: Close the panel → the Journal tab shows the problem photo dated today with the Problem pill, the urgency pill, the summary and the note; Open brings the diagnosis back. The Calendar tab lists the re-photograph task with its date (today + N); Today lists it once that date is within the week.
4. Phone: Open the diagnosis → Mark treated → optionally type what was applied → confirm → the card reads "Treated today" and the Journal shows "Treated: …" with the Protect and Done pills, dated today. A second Mark treated the same day changes nothing.
5. Phone: Today → Refresh (which runs `/api/expand`) → the re-photograph task is still on the plant's Calendar tab. Snooze it by 3 days → it moves; Done on it → it leaves the calendar and appears in the Journal as Scout, Done.
6. Phone: the Health tab lists the diagnosis under the species' pests with date, urgency and top cause; tapping it opens the same card.
7. Server, the morning after a re-photograph task comes due: the 06:00 digest for that site counts it and names it ("Re-photograph Papaya: aphids · Papaya").

## Usage check

Each diagnosis is one Claude call: about 4,000 input tokens (most of them the photo, the site context read from the cache) and 600 to 1,500 output tokens including thinking, so roughly 1 to 2 cents at Sonnet 5.5 prices. The Claude Console usage page moves by one call per diagnosis; nothing else in this phase calls Claude.
