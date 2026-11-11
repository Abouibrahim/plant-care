# Phase 17 — Derja words on the species profile

Done when, on the deployed Vercel URL: the Needs, Calendar, Health and Guild tabs of a plant, and the species page, show the derja word beside their key terms; "Get derja words" fetches a species' list on demand; a term carries one word everywhere, a correction first; and no task card, notification or shared list carries Arabic.

Reference: Mohamed's request of 2026-11-11 ("add arabic key words also to needs, calendar, health, guild"), settled in three rounds of questions the same day. The design is `docs/superpowers/specs/2026-11-11-derja-profile-words-design.md`, the plan `docs/superpowers/plans/2026-11-11-derja-profile-words.md`; both were approved on 2026-11-11. It extends Phase 16.

## Plan

- **Where.** A plant's page: the four profile tabs, each ending with its own "Derja words" card. The species page: the words in the text and one card at the bottom. Only names: pests and diseases, products, operations, tools, companion plants. The task cards on the Calendar tab, the Past diagnoses list, the editors, Today, the notifications and the shared lists stay plain.
- **Three sources, one word.** For a term: Mohamed's correction; else the app-wide word, the first Claude ever gave for it (settings row `derja:words`, fed by every diagnosis and every species call, never with a term he corrected); else the word of the page's own list. The same order now applies on a diagnosis.
- **Known words show for free** on any species. **Get derja words** asks Claude for the species' own list, up to 40 terms (`POST /api/derja`, 3,072 tokens at medium effort), kept in `derja:species:<id>`. The profile is not rewritten. Nothing runs by itself; **Refresh words** runs it again.
- **Never paid twice.** The server stores the list before replying and the app stores it again; a lost reply is found by the time the request was sent; and while the species' list cannot be read the card shows no button.
- **Editing** is Phase 16's, on every card. A cleared term keeps its line wherever Claude has a word for it.
- **Two leftovers of Phase 16's review**: a cleaned-up title keeps no stray punctuation, and a failed read of the corrections says so.

## Setup (Mohamed does the parts marked ★)

- [ ] ★ After the deploy, tap "Reload" on the update banner (or close and reopen the installed app).
- [x] Nothing else: no SQL, no key. The Arabic keyboard of Phase 16 still serves for corrections.

## Build

- [x] `src/lib/derja.ts`: the app-wide words, a species' list, three-source `wordSources`, `narrowSources`, `cardRows` by mode, `stripArabic`; `src/lib/profileTexts.ts`; `tests/derja-words.test.ts`, `tests/profile-texts.test.ts`.
- [x] `api/_derja.ts` and `api/diagnose.ts` feeding `derja:words`; `tests/derja-server.test.ts`.
- [x] `api/derja.ts`, `prompts/derja.md`, `prompts/derja.schema.json`; the ledger kind `derja`; `tests/derja-route.test.ts`, `tests/usage.test.ts`.
- [x] `src/lib/db.ts` (`loadDerja`, `getSpeciesWords`, `saveSpeciesWords`, `deleteSetting`, the clean-up in `deleteSpeciesIfUnused`) and `api.derja` with its lost-reply lookup; `tests/db.test.ts`, `tests/api.test.ts`.
- [x] `src/lib/useDerja.ts`, `src/components/derja/` (`DerjaText`, `DerjaWords`, `ProfileDerjaCard`, `ProfileDerja`), the diagnosis card on the hook, the strings.
- [x] The profile components through `DerjaText`; `PlantScreen` and `SpeciesScreen`.
- [x] Settings phase card, version 0.17.0; README, CLAUDE.md, `docs/USER-GUIDE.md` (chapters 1, 6, 13, 14) and `docs/DECISIONS.md`.

## Acceptance tests

1. **Get the words.** On a species, tap "Get derja words": the four tabs show words and each tab's card lists its terms. Settings' usage counts one "derja word lists" call.
2. **Correct one.** Correct a word on one tab: it changes on the other tabs, on another species that has the term, and on a diagnosis that has it.
3. **A species never fetched.** Open one: the terms already known carry their word, and the card offers "Get derja words".
4. **An edit.** Edit a care rule's title so a term disappears: its word and its line go, nothing else changes, and the profile is still confirmed.
5. **Refresh.** "Refresh words" runs the call again and shows the new date.
6. **No Arabic elsewhere.** Today, the Calendar tab's task cards, the notification and a shared list show no Arabic letter.
7. **Without a connection.** With a plant's page open, switch to airplane mode and come back to the app: the tabs stay as they were and no error banner shows; on a page opened without signal the card says the words could not be read and offers no button.
8. **An older diagnosis.** One made before 0.16.0 still looks as it did.

Only Mohamed can judge whether the words are the ones his workers say.

## Usage check

One new call, only on the button: an estimated 5 to 10 cents a species (3,072 output tokens at medium effort, the profile as input). The first real call is to be measured and the figure put here, in the guide's cost table and in `docs/DECISIONS.md`. A diagnosis costs what it did; its extra write is to the database only.
