# Phase 18 — Derja words on task cards

Done when, on the deployed Vercel URL: a task card shows the derja word beside the plant, the pest or disease, the product and the tool its title and instruction name, and not beside the operation; it does so without a connection; a switch in Settings turns it off; and no notification, shared list or toast carries Arabic.

Reference: Mohamed's request of 2026-11-12 ("how to show derja keywords on tasks cards?"), settled in three rounds of questions the same day, which reopened Phase 17's choice to keep task cards plain. The design is `docs/superpowers/specs/2026-11-12-derja-task-cards-design.md`, the plan `docs/superpowers/plans/2026-11-12-derja-task-cards.md`; both were approved on 2026-11-12. It extends Phases 16 and 17.

## Plan

- **Where.** Every task card: Today's cards for work due now, the batch cards (the shared job and instruction), the coming days, the task cards on a plant's Calendar tab. The title and the instruction, also for the tasks a diagnosis or a log entry wrote. Not a task's note, the toasts, the journal, the map, the notification or the shared lists.
- **Named things only.** A plant, a pest or disease, a product, a tool. Claude now tells each term's kind (plant, pest, product, tool, operation, other) in the diagnosis and in the species' word list; the kind is kept with the term app-wide, even when the word shown is Mohamed's or Claude gave none. Operations are held back on cards and still show on the profile tabs and the diagnoses.
- **Plant names from the profiles.** Each species' Arabic name marks its English name wherever a card names the plant, at no cost.
- **No call, no button, no message.** The cards use the corrections and Claude's first words; the phone keeps the last words read, on any screen, for use without a connection.
- **A quantity keeps its parentheses**: "… (40 L)", "savon noir (…) (30 g per litre)", on diagnoses and profile tabs too.
- **A switch** in Settings, per phone, on by default.

## Setup (Mohamed does the parts marked ★)

- [ ] ★ After the deploy, tap "Reload" on the update banner (or close and reopen the installed app).
- [x] Nothing else: no SQL, no key.

## Build

- [x] `src/types.ts`, `src/lib/derja.ts`: `DerjaKind`, the kind through every reader and writer, `withWords` remembering kinds, `WordSource.kind`, the quantity's parentheses; `tests/derja-kinds.test.ts`.
- [x] `src/lib/taskDerja.ts`: the four kinds shown, the plant-name terms, the placeholders, the switch; `tests/task-derja.test.ts`.
- [x] `prompts/diagnose.*`, `prompts/derja.*`: the required `kind`; the schema, prompt, server and handler tests.
- [x] `src/lib/db.ts` (`saveCorrection` with a kind, `listDueTasks` with the species' names), `src/lib/offline.ts` (`keepDerja`, `recallDerja`); `tests/db.test.ts`, `tests/offline.test.ts`.
- [x] `src/lib/useDerja.ts` (`kept`, `reloadKey`), `TaskCard`, `BatchCard`, `TodayScreen`, `ProfileDerja`, `PlantScreen`.
- [x] The switch card in Settings and its strings.
- [x] Settings phase card, version 0.18.0; README, CLAUDE.md, `docs/USER-GUIDE.md` (chapters 4, 6, 10, 12) and `docs/DECISIONS.md`.

## Acceptance tests

1. **Plant names at once.** Today shows a plant's Arabic name on a card that names it, with no fetch made.
2. **Named things, not operations.** After "Refresh words" on a species, its products, tools and pests show on its task cards; "pruning" or "watering" does not.
3. **A correction reaches Today.** Correct a product's word on the species page: the task card shows the new word when Today is opened again.
4. **Without a connection.** Airplane mode, close and reopen the app: the cards still show the words.
5. **The switch.** Off: the cards are plain and the profile tabs still show their words. On: the words are back.
6. **A quantity.** A watering card reads "… (40 L)" with its litres untouched.
7. **No Arabic elsewhere.** The morning notification, a shared list and a toast show no Arabic letter.

Until a species is refreshed or a diagnosis is made after the deploy, the cards show plant names only: the words stored before have no kind.

## Usage check

No new call. The diagnosis and the species' word list return one more short field per term: a few tokens each, under a cent a call.
