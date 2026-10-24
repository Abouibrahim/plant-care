# Phase 2 — Tasks and the Today screen

Done when every species' care rules are expanded into dated tasks for the next 90 days (each morning by the cron and on demand from the app), and Mohamed can read them on the Today screen grouped by site, act on them with Done, Skip and Snooze, and find the log in the plant's journal, on the deployed Vercel URL.

Reference: the "Reminder engine" section of `CLAUDE.md`, steps 1 to 4 (step 5, the push digest, is Phase 3), and the Today row of the screen table in `docs/SPEC.md`.

## Setup (Mohamed does the parts marked ★)

- [x] Nothing new to create: `CRON_SECRET` is already set in Vercel and `.env.local`; the `tasks` table and the `journal` view are part of `supabase/schema.sql`, already run.
- [ ] ★ After the deploy, check in the Vercel dashboard (project → Settings → Cron Jobs) that `/api/daily` is listed at `0 5 * * *`.

## Build

- [x] `src/lib/dates.ts`: calendar-date helpers shared by the app and the functions (ISO date strings, add days, last day of a month, the Tunis date, age in months and the establishment/mature stage). `CalendarSection` and `PlantScreen` use it instead of their own copies.
- [x] `api/_tasks.ts`: the pure expansion (`expandPlant`) and `runExpansion(db, today, plantId?)`. Age from `planted_on` (null = mature, establishment under 24 months); rules whose `age` does not match are skipped; `months` are split into contiguous runs on the 12-month circle, each run a window; window rules give one task per window that overlaps the next 90 days, `due_on` = first day of the window, `window_end` = last day; water rules give one task every `every_days` from the window's first day, only on days from today to today + 90; `rule_key` = `${type}:${months}:${age}`; insert only when no task has the same `plant_id`, `rule_key` and `due_on`, with the unique constraint as the final guard (upsert, ignore duplicates). Pending tasks whose rule no longer applies (rule gone after a regeneration, or the plant changed stage) are removed.
- [x] `api/daily.ts`: keeps the `CRON_SECRET` check, runs the expansion for all plants, answers `{ ok, tasks_created, tasks_removed, plants, pushes_sent: 0 }`.
- [x] `api/expand.ts`: `POST { plant_id? }` behind `verifyUser`; same expansion on demand, for one plant or all.
- [x] `src/lib/api.ts`: `api.expand()`. `src/lib/db.ts`: `listDueTasks`, `listPlantTasks`, `listJournal`, `completeTask`, `skipTask`, `snoozeTask`.
- [x] `src/components/TaskCard.tsx`: title, plant tag, type pill, due label (overdue, today, day of the week; window end), instruction; Done, Skip with an inline reason, Snooze 1, 3 or 7 days; the card body links to the plant.
- [x] Today screen: pending tasks due up to today + 7, Farm then Backyard with counts, overdue first; Refresh runs the expansion; the expansion also runs once per app session when Today opens.
- [x] Capture: after a plant is saved, the expansion runs for that plant before the app moves to its screen, so its first tasks are there at once.
- [x] Plant screen: Calendar tab lists the plant's next pending tasks (with the same actions) above the rules; Journal tab shows photos and the task log from the `journal` view, newest first.
- [x] All new strings in `src/i18n/en.ts`; Settings card reads Phase 2; `docs/DECISIONS.md` lists the deviations; README mentions the new routes.

## Acceptance tests

Tests 1 and 2 assume the data of 24 Oct 2026: a mature persimmon in the backyard and a mature papaya at the farm; dates shift with the day the test runs.

1. Server: call `/api/daily` with the cron secret (or open Today in the app, which calls `/api/expand`) → the `tasks` table holds, for the persimmon, "Harvest persimmons" due 1 Oct with window end 31 Dec, "Check fruit for fruit fly" due 1 Jul with window end 31 Oct, "Winter structural pruning" and "Graft onto seedling rootstock" due 1 Jan 2027; for the papaya, "Shoulder-season watering, mature papaya (15 L)" due 31 Oct, "Winter cold and wet protection" due 1 Nov with window end 31 Mar 2027, "Scout for aphids and mites" due 1 May, "Scout fruit for fruit fly" due 1 Sep, "Harvest ripening papayas" due 1 Aug. No establishment rule produced a task. A second call creates 0 tasks.
2. Phone: Today shows Farm first, then Backyard, each with its count; the open windows (due date in the past) come first and read "Open since …" with "until …"; the 31 Oct watering shows its day of the week; every card shows the plant tag, the type pill and the instruction; tapping the card body opens the plant.
3. Done on "Harvest persimmons" → the card leaves the list; the persimmon's Journal tab shows the task with status Done, dated today; it does not come back after Refresh.
4. Skip on "Scout for aphids and mites" with the reason "window closing" → the card leaves the list; the papaya's Journal shows the reason with the Scout and Skipped pills; Refresh does not recreate it.
5. Snooze 3 days on the 31 Oct watering → it leaves Today (unless the new date is within the week) and the papaya's Calendar tab lists it with the new date; the Journal shows the original with status Snoozed; after Refresh there is still exactly one pending watering for that rule.
6. Edit the papaya record, set "Planted on" to 1 Jun 2026 → after the save (Refresh on Today if needed) the mature tasks of the papaya are gone and the establishment ones appear: "Shoulder-season watering, young papaya (8 L)" every 7 days from 1 Oct (next on 29 Oct) and "Guard young papaya from animals" due 1 Oct with window end 30 Nov. Clearing the date brings the mature set back.
7. Signed out, `POST /api/expand` → 401; `GET /api/daily` without the secret → 401.

Results (2026-10-24): test 1 passed from the server (first cron call: 9 tasks created, the rows listed above; second call: 0); test 7 passed for both routes (401 without credentials). Test 2 checked read-only in the desktop browser on the deployed build: Farm (4) then Backyard (2), open windows first with "Open since … · until …", the 31 Oct watering with its weekday, the papaya's Calendar tab listing its five next tasks and its Journal tab loading from the view, no console errors. Tests 3 to 6 (Done, Skip, Snooze, the planting-date edit) wait for the phone.

## Usage check

Phase 2 makes no Claude call; the Claude Console usage page does not move.
