# Phase 11 — Zone batches

Done when Today and the morning push gather the waterings of one zone into one entry, "15 plants · row 2 · 216 L in all" on Today and "Water 15 plants (8–40 L each) · row 2" in the push, with one Done for the group and a way to leave single plants out, on the deployed Vercel URL.

Reference: item 1 of the feature review of 2026-10-25. Plantin's "spaces" group plants but not their reminders, which a reviewer complained of. Zones have been free text on every plant since Phase 1, and Phase 5 added the per-site lists. But Today and the push group by site only, so every plant added makes the summer list of single waterings longer. Phase 10 added "Done: all N waterings" per site (review 4.3 of 2026-10-30); this phase goes down to the zone, and into the push.

That review suggested a different Phase 11 (its items 3.5, 2.1, 2.3, 5.3 and 4.2). Those stay open for a later phase, with 4.1, 2.5 and 7.1 from its Phase 10 list.

## Plan

- **What forms a batch.** A batch is the periodic waterings the care calendar wrote (type water, no window) at one site and zone that fall due together, for two plants or more:
  - the late ones and today's form one "due now" batch;
  - on a coming day, that day's waterings form one.

  One plant's waterings stay single cards. Plants with no zone batch together, with no label. Zone names match without regard to case or outer spaces, since the record form takes free text, and the label is the spelling most of the plants use. These stay single:
  - other tasks: feeds, harvests and every window;
  - a reminder the grower wrote ("Remind me", `manual:`) or a diagnosis wrote, whose own words would vanish in a batch.
- **The batch card on Today** sits where its most pressing watering would be. It shows:
  - the water tile and "15 plants": a group of 12 counts as 12, and a plant with two waterings due counts once;
  - the zone and the litres in all, given only when every watering states its amount;
  - the due line, "Today · 3 overdue" (counted in plants);
  - the shared instruction, when every watering has the same one;
  - each amount with its plants, "40 L · OL-01 OL-03 OL-04" / "8 L · POM-H ×12" / "No amount · FIG-03", since a mixed zone's "8–40 L" cannot be acted on at the hose.

  A coming day's batch carries its day in the title ("Mon 2 Nov · 14 plants"), and its Done is a plain button, so the thumb goes to today's.
- **Its actions: Done, Skip, Choose.**
  - **Done** and **Skip** (with a reason, as on a single task) close the plants still ticked, in one update. One toast and one Undo cover the set. The toast names the zone and counts the plants ("Done: row 2 · 14 plants"); the round counts the waterings closed, as everywhere else.
  - **Choose** lists the plants. Each row is one tap target with its tick, tag, litres and "Late · 27 Oct", and a chevron opens the plant on its Calendar tab, where a single card offers Snooze and a note.
  - A plant unticked stays pending and Done reads "Done 14/15". The ticks are kept by Today for the session, so a reload of the list (Refresh, the 06:05 read) or a visit to a plant's page does not tick them again. After the batch's own Done or Skip, the plants left out come back ticked, as a smaller batch or a single card; an Undo unticks them again.
  - A batch has no Snooze and no note: a snooze moves each task's own schedule, and a note would replace the title in every plant's journal.
- **The site's "Done: all N waterings" stays.** It leaves out the plants unticked in a batch, and it is hidden when one batch due now already holds all of the site's due waterings.
- **The morning push** gives a zone's due waterings one line, "Water 15 plants (8–40 L each) · row 2", placed where its most pressing watering would be. Plants with no zone get no label. The title still counts tasks ("Farm: 14 tasks"), and "+N more" counts the tasks the lines leave out. The push stays in English, like the rest of the digest (review 4.2).
- **Litres** are read from the watering's title, where the expansion writes them ("Deep watering (40 L)"). A test ties the two together. In the total, a group's litres count once per plant, and for each plant and rule only the newest watering counts.
- **The writes:**
  - `skipTasks` closes a set with one reason;
  - `completeTasks` writes no note, so a pending reminder Done-all closes keeps its words;
  - `reopenTasks(ids, status)` reopens only rows in the status the set was given, so Undo of a Skip never reopens a row that was done, and Undo of a Done keeps the notes.
- **One pure module,** `src/lib/batches.ts`, does the grouping and the sums for both Today and `api/_push.ts`. It has no strings and only `.js` imports, so the functions can import it. Today's own rules (the Done-all set, when it repeats a batch, when an action clears the day) are pure helpers in `src/lib/today.ts`.
- **No SQL, no Claude call, no new route.** Today's task read adds the plant's `quantity`; the push's read adds `plant_id`, `zone` and `quantity`.

## Setup (Mohamed does the parts marked ★)

- [ ] ★ After the deploy, tap "Reload" on the update banner (or close and reopen the installed app) so the phone runs the 0.11.0 shell.
- [x] Nothing else: no SQL, no key.

## Build

- [x] `src/lib/batches.ts`: the grouping, the litres, the plants counted once, the summary (pure, tested).
- [x] Today: the batch card, Choose with the ticks kept by Today, Skip for a set, Undo by status, the toasts; the Done-all rules as pure helpers.
- [x] The push: one line per zone batch; `plant_id`, zone and quantity read.
- [x] Strings in `en.ts` and `fr.ts`; Settings phase card; version 0.11.0; README, CLAUDE.md and `docs/DECISIONS.md`.

## Acceptance tests (run on the phone, installed app on 0.11.0)

1. Two or more plants of one zone have waterings due: Today shows one card, "N plants", with the zone, the litres in all and each amount's plants. Done closes them all; the round moves by the number of waterings closed, and the toast names the zone and the plants. Undo reopens them. When that batch holds all of the site's due waterings, the site's "Done: all N waterings" is hidden.
2. Choose → untick one plant: Done reads "Done N−1/N". When another zone's watering is due as well (so the site's "Done: all N waterings" shows), its count drops by one. Refresh: the plant stays unticked. Done: the others close, and the one left out stays (as a card, or with others left out, as a smaller batch, ticked again). Undo: the batch comes back with the same plant unticked.
3. Skip on a batch, with a reason: all of them close as skipped, and each plant's journal shows the reason. Undo reopens them.
4. Choose → untick one plant → the chevron beside another: its page opens on the Calendar tab; Snooze its watering there. Back on Today the batch is one plant smaller, and the plant unticked before is still unticked ("Done N−1/N").
5. A zone with one plant's watering due shows a single card. A feed or a harvest window never joins a batch, and neither does a "Remind me" watering written in the plant's log.
6. Whole week: Thursday's waterings of a zone show as one card titled with Thursday, with a plain Done. Done on it shows no leaf fall, and the toast names Thursday.
7. The next morning push lists a zone's waterings in one line, "Water N plants (… L each) · zone" (in English). The title still counts tasks.
8. Settings → Français: the batch card, Choose and the toast in French; "Fait 14/15" fits on one line.
9. ★ Optional, with the cron secret: `GET /api/daily?dry=1` on the deployed URL (header `Authorization: Bearer <CRON_SECRET>`) composes the digest without sending it. A batch line in its answer shows that the functions load the new module.

## Usage check

No Claude call. Today's task read adds one small column per task; the push's read adds three. The digest read is otherwise unchanged (review 4.1 would make it smaller).

Results (2026-10-30): typecheck, lint, `npm test` (204 tests) and build pass. The new and changed tests:
- `tests/batches.test.ts`: what joins a batch, the "now" bucket, placement, plants counted once, the litres groups, the total;
- `tests/digest.test.ts`: the batch line, "+N more", a zone-less batch, a manual reminder, `plant_id`, zone and quantity read;
- `tests/today.test.ts`: the Done-all set, when it repeats a batch, when an action clears the day;
- `tests/db.test.ts`: Skip for a set, Undo by status, a reminder's note kept;
- `tests/tasks.test.ts`: the expansion's litres read back from the title.

Before the build, three critics (a grower on a phone, edge cases, the project's rules) read the design. Their points changed it:
- reminders the grower wrote stay out of batches;
- the ticks are kept by Today, not the card;
- a plant counts once;
- each amount is shown with its plants rather than "8–40 L each";
- one unit (plants) is used on the card and its toast;
- "No zone", "Show them one by one" and a note on a batch's Done were dropped.

A review of the build (four reviewers, each finding checked by a skeptic) confirmed six points, all fixed:
- ticks lost when Today unmounted (the chevron to a plant, the tab bar), so the next Done would have closed a plant left out: kept for the session now, with a copy in sessionStorage;
- an Undo that did not untick the plants left out;
- French "Sans quantité" running under the first tag;
- "Done 14/15" wrapping on a 360 px phone;
- a coming day's toast cutting the day it names;
- test 2 asking for a Done-all count change that its setup cannot show.

Checked in the desktop app's browser at 360 and 375 px, against an in-memory copy of the data (a farm with row 2 late and today, a group of 12, a zone typed "Row 2 ", plants with no zone and one without litres, a hand-written reminder, a plant with two waterings due, a coming day's batch):
- the cards, groups, totals and counts above; the site's Done-all hidden when one batch holds all and counting the unticked plants out otherwise;
- Choose → untick → Refresh, and → the chevron to a plant's Calendar tab and back: the tick kept;
- partial Done (the tile ticks, the card stays), Undo (the tick comes back), Skip with a reason and its Undo;
- Done on Monday's batch: no leaf fall, the toast naming the day first;
- French, with every label on one line;
- no errors in the console.

Not checked here, so phone tests: the real Supabase writes and the real 06:00 push (test 9 can check the push line on the deployed functions).

Tests 1 to 9 on the phone wait for Mohamed.
