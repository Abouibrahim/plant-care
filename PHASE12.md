# Phase 12 — Batches for every task

Done when a zone's window tasks that make one job gather into one entry on Today and one line of the morning push, as Phase 11 does for the waterings. On Today: "Harvest the olives · row 2 · 10 plants · Open since 1 Oct · until 31 Dec". In the push: "Harvest the olives · 10 plants · row 2". The entry has one Done, which is plain while the window is merely open, plus Skip, Choose and "Done with a note", on the deployed Vercel URL.

Reference: Mohamed's request of 2026-11-01: "now, only waterings is grouped into one card. plan and implement grouping of all other tasks". Phase 11 kept windows single because they "last weeks, carry instructions that differ by species, and are few" (`docs/DECISIONS.md`). At farm scale they are not few. A window is one row per plant for its whole run of months, so ten olives in a row put ten "Scout for olive fly" cards on Today from June to October, and those ten rows fill every morning's push.

This phase answers the other two reasons:
- **"Carry instructions that differ by species":** the key. A batch is one job over one window, so it has one title and, as a rule, one instruction.
- **"Last weeks":** the Done is plain while the window is merely open.

## Plan

- **What forms a window batch.** The window tasks the care calendar wrote, of every kind (a watering window included), at one site and zone, for two plant records or more, that share:
  - the kind,
  - the title,
  - the window (the same first and last day).

  In practice that is one species' rule.
  - **Different jobs stay apart.** Two species whose jobs fall in the same months stay apart when their titles differ, and so do a young and a mature tree. One Done never closes two jobs.
  - **Titles** match without regard to case or extra spaces. The label is the spelling most of the plants use.
  - **The day it belongs to.** A window that is open, opens today or has ended belongs to today ("now"). A window that opens on a coming day belongs to that day.
  - **A snoozed copy** has a day of its own, so it leaves its mates.
  - **After a title edit**, a plant whose task was written later stays apart until its mates are written again.
- **Unchanged from Phase 11:**
  - the periodic waterings' batch, the "round": its card, its key and its push line;
  - zones: case and outer spaces are ignored, and plants with no zone batch together with no label;
  - a batch needs two plant records or more, and sits at its most pressing member;
  - the rows a person or a diagnosis wrote stay single;
  - Today keeps the ticks for the day;
  - plants count once, a group by its quantity.
- **The window batch card** reads like the single card for several plants:
  - the kind's tile and label;
  - the shared title, after its day for a coming day ("Thu 5 Nov · Winter prune");
  - the zone and "N plants";
  - the single card's due line for the shared window: "Open since 1 Oct · until 31 Dec", "Today · until 31 Dec", "Window ended 31 Oct" or "Thu 5 Nov · until 28 Feb";
  - the instruction, when all the plants have the same one;
  - the plants' tags: ×12 for a group, eight tags then "+N", struck through when unticked.

  A watering window takes this card too. Its title carries its litres, as on its single card, and it shows no total, since it is one task for the season.
- **Its actions.**
  - **Done** is the green (primary) button only when the batch holds something late or due today: a window that opens today, or one that has ended. For a window that is merely open, Done is a plain button, as for a coming day. Done closes the window for the season for every ticked plant, and the green button should mean today's round.
  - **Done with a note** is the link under the buttons, as on a single card. The note goes on each ticked plant's row with its scope, "row 3 · 10 plants: 180 kg", so each tree's journal reads it as the row's total. This is how a harvest window closes with the season's yield. The scope and the note fit the 200 characters a note has, and Undo clears the note.
  - **Skip** takes one reason. **Choose** lists each plant with its tick and a chevron, as in Phase 11.
  - **No Snooze.** A snooze moves each plant's own schedule; the chevron opens the plant's card for it.
  - **Untick all / Tick all** sits at the head of Choose, for any batch. It is for work done over several visits: untick all, tick the trees done, then "Done 2/10".
  - **The toast names the job:** "Done: Harvest the olives · row 2 · 10 plants", with the day first for a coming day. A round of waterings keeps "Done: row 2 · 14 plants".
- **Today's other rules.**
  - The site's "Done: all N waterings" is hidden when any one batch already holds every watering it would close. Before, it looked for a single batch due now, and a prune batch beside the waterings would defeat that.
  - The round, the counts, the strip and the leaf fall count tasks, as before.
  - The message after a set Done that found some tasks already closed now says "tasks", not "waterings".
- **The push.**
  - A window batch gives one line: the title, the plants and the zone, "Scout for olive fly · 10 plants · row 2".
  - An early notice batches too: "From 1 Nov: Winter prune · 10 plants · row 2".
  - The round's line stays "Water 15 plants (8–40 L each) · row 2".
  - The title and "+N more" still count tasks. The push stays in English.
- **Code.**
  - `src/lib/batches.ts`:
    - windows join;
    - a window's key adds the kind, the window and the folded title;
    - a batch carries its kind, its day and its title (null for the round);
    - `summarize` reads lateness by a window's end and litres only from waterings.
  - `src/lib/today.ts`:
    - the single card's due line, `dueLabel`, moved from TaskCard so the batch card can read it;
    - the Done-all rule.
  - `src/lib/db.ts`: `completeTasks(ids, note)` and `reopenTasks(ids, status, clearNote)`.
  - `BatchCard.tsx`: the window layout, the note, Untick all and the Done rule.
  - `TodayScreen.tsx`: the toast, the note's Undo, and ticks set for a whole batch.
  - `api/_push.ts`: the window line and the early notice.
- **No SQL, no Claude call, no new route.**

## Setup (Mohamed does the parts marked ★)

- [ ] ★ After the deploy, tap "Reload" on the update banner (or close and reopen the installed app) so the phone runs the 0.12.0 shell.
- [x] Nothing else: no SQL, no key.

## Build

- [x] `src/lib/batches.ts`: window keys, the batch's kind, day and title, lateness and litres in `summarize` (pure, tested).
- [x] Today: the window card, the plain Done for open windows, Done with a note and its Undo, Untick all, the toast naming the job, the Done-all rule.
- [x] The push: one line per window batch, early notices included.
- [x] Strings in `en.ts` and `fr.ts`; Settings phase card; version 0.12.0; README, CLAUDE.md, `docs/USER-GUIDE.md` and `docs/DECISIONS.md`.

## Acceptance tests (run on the phone, installed app on 0.12.0)

1. **One card per shared job.** Two or more plants of one zone share a window task, for example the olives' "Harvest …" or "Scout for …". Today shows one card with the title, the zone, "N plants", the window's due line and the tags. While the window is merely open, its Done is a plain button.
   - Done closes them all, and the toast names the job, the zone and the plants.
   - Undo reopens them.
2. **Different jobs stay apart.** A zone's plants have different jobs of one kind, for example a young tree's "Formative pruning" beside the mature trees' "Winter pruning", or two species' scouting. Each title gets its own card. A lone plant's job stays a single card.
3. **Done with a note.** On a window batch, write "180 kg". Each plant's journal shows "row 2 · N plants: 180 kg". Undo reopens them and the journal lines go.
4. **Several visits.** Choose → Untick all → tick two → "Done 2/N". The two close, and the others come back as a smaller batch, all ticked.
5. **Skip.** Skip a window batch with a reason. All close as skipped, and each journal shows the reason. Undo reopens them.
6. **Opening and coming windows.** A window that opens today has a green Done. In the Whole week view, a coming window's card is titled with its day and has a plain Done.
7. **The waterings' batch.** It is as in 0.11.0. The site's "Done: all N waterings" still hides when one batch holds all the due waterings, with a window batch beside it.
8. **The morning push.** A window batch is one line, "Title · N plants · zone". On the one morning exactly its lead days before a window job opens, its line reads "From …: Title · N plants · zone".
9. **French.** Settings → Français: the window card, Choose's "Tout décocher", the note's "rang 2 · 3 plantes : …" and the toast are in French. The buttons stay on one line at 360 px.
10. ★ **Optional, with the cron secret:** `GET /api/daily?dry=1` on the deployed URL, with the header `Authorization: Bearer <CRON_SECRET>`, shows a window batch line in its digest.

## Usage check

No Claude call and no new read: Today's and the push's reads already carry each task's kind, title, window and zone.

Results (2026-11-01): typecheck, lint, `npm test` (227 tests) and build pass. The new and changed tests:
- `tests/batches.test.ts`: what joins (windows of every kind, not a row of another kind with no window); the window key; one job per batch (titles, windows, kinds, sites and zones apart; a young and a mature tree apart); snoozed copies (a window leaves its mates, two snoozed to one day batch again, a watering joins its new day's round); the day bucket of open, opening, ended and coming windows; a watering window never in the round; the label; plants by tag; no litres or lateness for an open window, plants counted once;
- `tests/digest.test.ts`: the window line, jobs apart, an early notice's batch with its day, "+N more" with window lines;
- `tests/today.test.ts`: `dueLabel`, Done-all with a window batch beside the round and with a batch of watering windows, the green Done, the scoped note and its room, when Undo clears the note;
- `tests/db.test.ts`: a set Done with a note and its Undo, a blank note writing nothing.

Before the build, three critics read the design: a grower on a phone, edge cases, and the project's rules. Their points changed it:
- the title went into the window key, so one Done never closes two jobs, and the card always has its title;
- Done became plain for a window merely open;
- the toast and the push line name the job;
- a window batch gained "Done with a note", scoped to the batch;
- Choose gained "Untick all";
- a watering window takes the window card;
- the Done-all rule changed to any one batch;
- `day` and lateness are read the same way for every batch.

A review of the build (four reviewers, a skeptic per reviewer) confirmed nine points, all fixed. Two more were refuted:
- the toast cut a window batch's zone and count on a 360 px phone: it takes up to three lines now;
- the text typed for a partial Done or Skip stayed in the form for the plants left: it is cleared when the batch's plants change;
- the green-Done rule, the note's scope and room, and when Undo clears a note sat untested in the components: they are pure helpers in `src/lib/today.ts` with tests;
- a window batch's tags and Choose followed the database's order: by tag now;
- the note form's Done was always green: it follows the batch's Done;
- the message when a whole set had already been closed spoke of one task and of the rain: a message for a set;
- the guide said a snoozed task always stays a card of its own: corrected (a snoozed watering joins its new day's round);
- test 8 said "inside its lead days": the notice goes on the one morning exactly its lead days before;
- the guide's list of phases that need no SQL now includes 12.

Checked in the desktop app's browser at 360 and 375 px against an in-memory copy of the data. The copy had:
- row 2's olives sharing a scout window and a harvest window;
- the hedge's harvest on a window of its own;
- olive and hedge mulch over one window under two titles;
- two zone-less figs feeding together, with their picking window ended;
- a watering window shared by two olives;
- a prune window opening in three days;
- two lemons sharing a protect window with different instructions.

What was checked:
- **The cards.** One card per shared job, and single cards where the title or the window differs. The ended window's Done was green; the open windows' and the coming prune's were plain. The instruction was hidden where it differs, and the watering window took the window card.
- **Choose → Untick all → tick two → "Done 2/3".** The toast named the job, and the plant left came back as a single card. Undo brought the batch back with it unticked.
- **Done with a note.** Each row got "row 2 · 3 plants: no rings seen", the input's room was 182 characters, and Undo cleared the notes. The next note form opened empty.
- **Skip with a reason** and its Undo, and the coming prune's Done with no leaf fall.
- **French at 360 px.** Every button row stayed on one line ("Fait 2/3 | Passer | Choisir"), "Tout décocher" was a 48 px target beside the hint, the note form fitted on one line, and the longest toast fitted in three lines.
- **The console** showed no errors besides Chrome blocking vibration on scripted taps.

Not checked here, so these are phone tests: the real Supabase writes and the real 06:00 push. Test 10 can check the push line on the deployed functions.

Tests 1 to 10 on the phone wait for Mohamed.
