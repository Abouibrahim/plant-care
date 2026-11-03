# Phase 13 — Today by kind of work

Done when, on the deployed Vercel URL, each site on Today shows its work due now by kind of task, under a heading that folds the kind away for the day and shares its list. The kinds come in the calendar's order: Water, Prune, Feed, Mulch, Harvest, Scout, Propagate, Protect. The list goes as plain text to whoever does the work (WhatsApp, SMS), and the coming days follow under "Later this week".

Reference: Mohamed's request of 2026-11-03: "what if we have all tasks grouped by activity. this will make it easier to assign tasks across the farm. think of this proposition, plan then implement". An activity is read as a kind of task.

## Plan

Four drafts answered the request from different angles: activity sections kept minimal, assignment first, one card per activity, and a skeptic of the idea. Three critics then scored them: a grower at 06:00 with workers waiting, edge cases checked against the code, and the project's rules. `docs/DECISIONS.md` (2026-11-03) gives every decision with its reason.

- **Sites stay the outer level.** Farm, then Backyard, and the kinds sit inside each: work is handed out per place, and batches and the push are per site.
- **The kinds hold the work due now.** That is what is late, due today, or a window that is open, opens today or has ended. The coming days follow under "Later this week", batched and sorted as in 0.12.0. A day chosen in the strip is grouped by kind, without the tail; today's tile shows the same kinds as the week.
- **The order is fixed**, the calendar's, so each worker's kind is in the same place every morning. Urgency shows through the heading's "Overdue" flag, the order inside each kind, the hero's overdue count and the strip's dot.
- **Inside a kind, everything is as in 0.12.0.** The batch and single cards keep their order, their buttons and their rules. A batch is one kind by construction, so the split never cuts one.
- **The heading.**
  - It shows the kind's tile and name, its tasks counted in rows (adding up, with "Later this week", to the site heading), "Overdue" when one is late, and a chevron.
  - A tap folds the kind for the day: per site, kind and view, kept like the Choose ticks.
  - A fold opens by itself when a task it did not have appears, and then stays open until a tap; folded cards stay mounted.
  - A kind leaves with its last card.
- **Nothing closes a kind as a whole.** One Done on Water would close today's rounds, a watering window for the season and Thursday's waterings. Done-all moves into the Water section, unchanged, and hides while Water is folded.
- **The share button** beside each heading sends the kind's list through the phone's share sheet, text only, built from what the section shows:
  - every task whatever the Choose ticks, every tag with ×N for a group, the litres per amount, the due lines and the instruction the plants share;
  - where there is no share sheet, the list is copied and a note says so.
- **Today reads its list again when a push arrives.** `push-sw.js` tells the open app, so a list handed out after the morning notification never carries a watering the rain skip closed.
- **Unchanged.** The push (most pressing first), the round, the badge, the leaf fall, the chips, the strip and the task writes. No SQL, no Claude call, no new read.

## Setup (Mohamed does the parts marked ★)

- [ ] ★ After the deploy, tap "Reload" on the update banner (or close and reopen the installed app), so the phone runs the 0.13.0 shell and the new service worker.
- [ ] ★ Run PHASE12.md's tests first, or with test 2 below, so a fault is traced to the right phase.
- [x] Nothing else: no SQL, no key.

## Build

- [x] `src/lib/activities.ts` (`kindOf`, `byActivity`, `splitNow`) and the `src/lib/today.ts` helpers (`sectionFacts`, the folds, `parseLeftOut`, `roundDueLabel`, `sharedInstruction`), pure and tested.
- [x] `ActivitySection` and Today: the kinds, "Later this week", the folds, Done-all in Water, the share.
- [x] `src/lib/handout.ts` (the list) and `src/lib/share.ts` (share or copy), tested.
- [x] `public/push-sw.js` tells the open app of each push, and Today reads its list again.
- [x] Strings in `en.ts` and `fr.ts`; Settings phase card; version 0.13.0; README, CLAUDE.md, `docs/USER-GUIDE.md` and `docs/DECISIONS.md`.

## Acceptance tests (run on the phone, installed app on 0.13.0)

1. **Kinds and counts.** Whole week:
   - Farm comes first, then Backyard. Each shows its kinds due now in the order Water, Prune, Feed, Mulch, Harvest, Scout, Propagate, Protect, each with its tile, name and number.
   - "Overdue" shows only where something is late, never for a window that is merely open.
   - The kinds' numbers plus "Later this week" add up to the site heading.
2. **Cards as in 0.12.0.**
   - Inside the kinds, PHASE12's tests 1 to 7 hold: one card per shared job, a plain Done while a window is merely open, Done with a note, Choose → Untick all → tick two → "Done 2/N", Skip, and Undo.
   - A "Remind me" watering sits under Water with Snooze, and a diagnosis follow-up under Scout.
3. **Later this week and the strip.**
   - The coming days sit under "Later this week" at the end of each site, by day, with plain batch Done buttons.
   - Tap Thursday: Thursday's tasks by kind, with no tail.
   - Tap today's tile: the same kinds as the week view, with no tail.
4. **Folding.**
   - Tap Water: its cards hide, the heading keeps its number and flag, and the chevron points right.
   - Open a plant from a Prune card and come back, tap Refresh, then change the chip and the day: Water is still folded on the week view.
   - Open Choose on a batch and type in its note, then fold and unfold: both are still there.
   - With Water folded and waterings due, Done on the last other due task drops no leaves.
   - The next morning every kind is open.
5. **New work opens a fold.** Fold Water. On a plant, **Log something done** → **Remind me**, a watering for today. Back on Today, Water is open with the reminder. Tap Done on the reminder: Water stays open.
6. **Done-all.**
   - "Done: all N waterings" is the first row of Water. It closes them with one toast and one Undo.
   - It is hidden while Water is folded, when one batch holds every due watering, and on a coming day.
7. **A kind leaves with its last card.** Done on the only card of a kind: the card and its heading fold away together, and Undo brings both back.
8. **Share.**
   - Share Water, then WhatsApp, then yourself. The message reads as in chapter 4 of the guide: the heading, zones, plants, litres per amount, every tag with ×N, due lines and shared instructions.
   - A plant unticked in Choose is still listed.
   - Dismiss the sheet once: nothing changes.
   - Share from a folded heading.
   - Share Thursday's Water from its tile: the heading reads "Water · Farm · Thu 5 Nov".
9. **Copy fallback.** On a computer's browser without a share sheet (Firefox), share a kind far down the page: the list is copied, the share button shows a tick for a moment, and the note at the top says "List copied: paste it into a message.". An earlier Undo toast stays. Paste the list into a message.
10. **Today follows the morning run.**
    - Open Today before the morning notification and leave the app in the background.
    - When the notification comes, return without Refresh. The weather card's "Forecast of …" shows the run's time, and on a rain-skip morning the skipped waterings are gone.
11. **French and dark mode at 360 px, outdoors in daylight.**
    - The headings stay on one line; "Fait : les N arrosages" and "Plus tard cette semaine" each fit on one line.
    - The French list reads "Arroser · Ferme · …" and "40 L : …".
    - The card button rows are unchanged.
    - In dark mode the tiles, the numbers, the rule and the flag are readable.
12. ★ **Optional, the push.** The next morning's notification reads as in 0.12.0, most pressing first. Or `GET /api/daily?dry=1` on the deployed URL, with the header `Authorization: Bearer <CRON_SECRET>`, shows the same digest lines.

## Usage check

No Claude call, no new read, no SQL: Today's read already carries each task's kind, title, instruction and dates, and its plant's tag, site, zone and quantity.

Results (2026-11-03): typecheck, lint, `npm test` (260 tests) and build pass. The new tests:
- `tests/activities.test.ts`:
  - the kinds in the calendar's order whatever the list's order;
  - a stable split holding every entry once;
  - Today's order inside a kind;
  - a kind's batches equal to those it makes on its own;
  - the app's own rows under their kind;
  - a kind outside the list kept last;
  - the split of now and later, which never cuts a batch.
- `tests/today.test.ts`:
  - the heading's count in rows and its late flag;
  - the counts adding up to the site heading;
  - the fold keys, folding and opening, a fold kept while tasks leave and opened by new work, which then stays open, a fold made while a task was being saved opening when it comes back, another day's folds dropped;
  - the stored folds and ticks read safely;
  - the round's due line and the shared instruction, moved from the card.
- `tests/handout.test.ts`:
  - the heading and blocks;
  - a round's litres per amount, with "No amount" last;
  - a window job's every tag, ticked or not;
  - an instruction only when shared;
  - a card of its own with a group's size;
  - titles and instructions with line breaks kept on one line;
  - a coming day's list.
- `tests/share.test.ts`: the share called on the navigator itself before anything is awaited, shared, dismissed, copied when there is no share sheet or it refuses, and failing when neither works.

Checked in the desktop app's browser at 360 px, in English and French, light and dark, against an in-memory copy of the data. The copy held both sites, every kind, zone rounds, window jobs, a hand-set reminder, a diagnosis follow-up, an ended window and the coming days. What was checked:
- **The kinds.** They came in order with numbers adding up to each site heading, "Overdue" on Water and Harvest only, and Done-all as Water's first row.
- **Folding.** It hid Done-all, held through Refresh, and kept an open Choose and a typed "180 kg".
- **A push message.** A watering added to the data and a push message opened folded Water with the new card at once, and Water stayed open after that card's Done.
- **Sharing.** A stubbed share sheet received the text alone. The Water and Harvest lists read as designed.
- **No share sheet.** The list was copied, the share button showed a tick for 2.5 seconds, and the note said so; a second tap at once opened nothing more. A dismissed sheet changed nothing, and a list neither shared nor copied said so in the note.
- **A kind leaving.** Done on the only Prune card took its heading away with it, and Undo brought both back.
- **Folding while a card saves.** Water folded while a watering was being saved stayed folded once it was saved, and its Undo opened Water with the card.
- **The strip.** Thursday's tile showed its one kind, and today's tile the kinds with no tail.
- **French at 360 px.** Every heading was one 48 px line, with a 48 px share button beside it. The heading's words now wrap in their own box, so a three-digit French count with "En retard" keeps its chevron in place. There was no sideways scroll.
- **The console** showed no errors besides Chrome blocking vibration on scripted taps.

A review of the build (four reviewers, a skeptic per reviewer) raised 14 findings. The skeptics refuted 4, and the 10 they confirmed came to 8 points, all fixed (`docs/DECISIONS.md` gives each):
- a kind that new work opened folded itself again once that task was done;
- a fold made while a card was being saved hid that card after its Undo;
- the share buttons could stay greyed on Android, whose share sheet does not always report;
- a copy was said only at the top of Today, out of sight from a lower kind;
- the read after a push waited 2 seconds for nothing, and the badge was not counted again;
- an instruction with a blank line split the shared list;
- no test pinned how the share is called.

Not checked here, so these are phone tests: the real share sheet and WhatsApp, the service worker's message after a real push, and the real Supabase reads.

Tests 1 to 12 on the phone wait for Mohamed.
