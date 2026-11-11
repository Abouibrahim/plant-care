# Phase 15 — Housekeeping: checks on every push, a leaner morning read, the functions beside the database, one error reader

Done when, on the deployed Vercel URL: every push runs the four checks on GitHub; the morning run reads each species' calendar once and the tasks only as far ahead as an early notice can reach, and sends the same notifications as before; the functions run in Vercel's Dublin region, beside the database; and no screen shows the browser's own error wording.

Reference: the review of 2026-10-30 (`docs/REVIEW-2026-10-30.md`), whose suggested first phase listed 4.1, 2.5 and 7.1 beside the items Phase 10 built, and the architecture review of 2026-11-09, whose first candidate was one `describeError` (the review's 7.2). Mohamed chose the phase on 2026-11-11 ("Housekeeping phase"). The four items are small and were argued in those reviews, so the design went straight to the build; a review of the build follows, as for every phase.

## Plan

### Checks on every push (review 7.1)

- **A workflow, `.github/workflows/checks.yml`.** On every push, to any branch, and on demand from the Actions tab: a clean install from the lockfile (`npm ci`), then `npm run typecheck`, `npm run lint`, `npm test` and `npm run build`, on Ubuntu with the Node version `engines` in `package.json` names, which Vercel builds and runs with too: `24.x` (see the review below). A newer push to the same branch cancels the run it supersedes; the job may read the repository and nothing else, and gives up after 15 minutes.
- **What it catches that this machine hides.** A file left out of a commit, a lockfile out of step with `package.json`, a test that depends on the time zone (the runner is on UTC; the suite passes there, checked on 2026-11-11) or on Windows.
- **What it does not do.** Vercel still deploys a push to `main` whatever the workflow says: the workflow reports a red push within minutes, it does not stop it. Making Vercel wait was weighed and left: the build command could run the four checks first, which doubles every deploy's half minute for a risk the local checks before each commit already cover. It stays a one-line change if pushes start to come from elsewhere.

### A leaner morning read (review 4.1)

- **The calendars once, the tasks only as far as a notice reaches.** `loadDigestTasks` read every pending task up to today + 90 days with its species' care calendar copied onto each row (2 to 4 KB, a thousand rows in a wet summer). It now reads each species' calendar once (`id, care_calendar`), takes the longest early notice across them (`longestLead`: the largest whole `lead_days`, at most the 90-day horizon), and reads the pending tasks up to today + that lead with the plant's tag, site, zone, quantity and species; the calendar is joined in memory. Both reads page past 1,000 rows, as before.
- **The same notifications.** A task reaches the digest when it is due by today or, for a window, on the one day exactly its lead before it opens; both fall within today + the longest lead, so the messages cannot change. A test composes the digest from the new read and from every pending task, morning after morning over two weeks, and compares.
- **The species read** covers the whole library, planted or not: a species checked before planting can lengthen the task read by its own lead, which costs a few rows and keeps the code plain.

### The functions beside the database (review 2.5)

- **Where the database is.** The Supabase project's database answers on an address in AWS's eu-west-1 range (Ireland): the public AAAA record of its host, matched against AWS's published `ip-ranges.json` on 2026-11-11. The functions ran in Vercel's default region, `iad1` (Washington), so every query crossed the Atlantic (the review: 80 to 120 ms each; Ask makes six, the expansion about ten, the morning run more).
- **`"regions": ["dub1"]` in `vercel.json`** puts every function, the cron's included, in Dublin. Hobby allows one region. The phone in Cap Bon is nearer Dublin than Washington too. The Claude call, which takes seconds to minutes, changes by a transatlantic round trip at most; the cron still fires at 05:00 UTC.
- **Checked after the deploy** by the `x-vercel-id` header of an `/api` answer, which names the region that ran the function.

### One error reader (review 7.2; architecture review 2026-11-09)

- **One rule in `src/lib/errors.ts`.** `describeError(err)` says what a failure is in the app's words: a lost reply looked for in vain, "No answer was found…"; a sign-in the server no longer accepts (401), "Signed out. Sign in again."; no connection (an API status 0, or the browser's wording, a write cut by its bound included), "Network error. Check the connection and try again."; a photo too large (413), its sentence; any other error from a function or the database, its own message as written (the functions' texts are English literals, CLAUDE.md); nothing readable, "Something went wrong". It is the union of the copies it replaces.
- **What it replaces.** The six `describeError` copies (Capture, Check, Ask, Diagnose, the Log sheet, Species), the three `message()` helpers (Today, a plant's page, Settings), the twelve inline readings (Plants, the species library, the tag link, the tag sheet, the Position sheet twice, the diagnosis card twice, the field editor, the list card, Login, the saved actions' failure line on Today), and the sign-in's own message, so Login says "Network error…" instead of "Failed to fetch".
- **`ApiError` and `LostReplyError` move into `src/lib/errors.ts`**, beside the rule that reads them; `src/lib/api.ts` imports them from there. The errors module imports nothing but the strings, so there is no import cycle.
- **What the grower sees change.** Wherever the browser's "TypeError: Failed to fetch" could show (the saved checks on Check, the earlier answers in Ask, Species, the Log sheet, a plant's page, Settings, Plants, the tags, the Position sheet, the diagnosis card, Login), and a Refresh or a Turn on that waited 30 seconds no longer reads "signal is aborted without reason", the network sentence shows instead. Capture's profile, when the five minutes of looking for a lost reply run out, reads "No answer was found…" like Ask, Check and Diagnose, instead of "Network error…": the signal is usually back by then, and the call may simply have been declined.

## Setup (Mohamed does the parts marked ★)

- [ ] ★ After the deploy, tap "Reload" on the update banner (or close and reopen the installed app).
- [ ] ★ Optional: Supabase → Project Settings → General should give the region as West EU (Ireland). If it names another region, say so: `vercel.json` then takes the Vercel region nearest it.
- [x] Nothing else: no SQL, no key, no setting. GitHub runs the workflow as soon as it is pushed.

## Build

- [x] `.github/workflows/checks.yml`.
- [x] `api/_push.ts`: `loadDigestTasks` with the calendars read once and `longestLead`; `tests/digest.test.ts`: the comparison over two weeks of mornings, the tasks read without a calendar, the paging past 1,000 rows with a lead that spans the horizon, `longestLead`.
- [x] `vercel.json`: `"regions": ["dub1"]`.
- [x] `src/lib/errors.ts`: `describeError`, with `ApiError` and `LostReplyError` moved in; every screen and the sign-in on it; `tests/errors.test.ts`, with the network checks moved there from `tests/offline.test.ts`.
- [x] Settings phase card, version 0.15.0; README, CLAUDE.md, `docs/USER-GUIDE.md` (chapters 5 and 14, the header) and `docs/DECISIONS.md`.

## Acceptance tests

1. **Checks on GitHub.** The repository's Actions tab shows a green "Checks" run for the 0.15.0 push.
2. **The functions in Dublin.** After the deploy, an `/api` answer's `x-vercel-id` header names `dub1` (checked by Claude). On the phone, Ask a question: the answer comes as before.
3. **The morning's notifications.** The next 06:00 run sends the same kind of notifications as before: the due-now lines, and an early notice on its day ("From 1 Dec: …") when one falls due. Settings → Weather shows the run's record as before.
4. **No browser wording.** In airplane mode, open Plants, the species library, a plant's page and Settings → Export plants, and save a log entry on a plant: every failure reads "Network error. Check the connection and try again."; nothing reads "TypeError" or "Failed to fetch".
5. **A lost profile (optional, costs one profile).** Capture a new species and switch to airplane mode while the profile is being written, for the full five minutes: the message reads "The profile could not be written: No answer was found…". Back online, **Retry the profile** finds it if the server finished.

## Found in review of the build

Two reviewers read the build, one the error reader, the other the morning read, the region and CI. They raised ten points; each was checked against the code and fixed:

- **Production ran Node 26, not 24.** `engines` in `package.json` read `>=22.12.0`, which overrides the project's 24.x setting: Vercel built and ran the functions on 26.x, and its build log said it would move to each new major by itself. It now reads `24.x`, the project setting and this machine's version, and the workflow takes its version from that field (`node-version-file`), so the checks and production cannot drift. Production moves from Node 26 back to 24 with this deploy; every test has always run on 24.
- **The network check read an error's name.** A push service refusing a subscription throws an AbortError, which read as "Network error…" on Turn on. `isNetworkFailure` reads the message only now; every lost request still matches, since the browsers' and supabase-js's messages carry the words.
- **"The photo upload failed" matched Safari's "Load failed".** The phrase now needs a word boundary, so Diagnose's own upload failure shows as written, in English as it already did in French.
- **The reminders card said its line twice** ("Reminders could not be turned on: Reminders could not be turned on") when the push setup failed with the card's own sentence; it says it once.
- **The guide kept a row for "signal is aborted without reason",** which no screen shows any more: Refresh and Turn on or off read "Network error…" after their 30 s. The row went, and the network row names those cases.
- **Two tests could not fail on a read that stops short.** The comparison of the two digest reads now starts on the morning of the longest notice, and the read's own test checks that it reaches the longest notice's day; three wrong horizons (7 days, one day short, `lt` for `lte`) each fail them now.
- **The error reader's test** pins a function's own "Request timed out." (it stays as written), the sign-in without a connection, the push refusal and the upload text.
- **The list of screens that showed the browser's wording** named Check's save, which shows a fixed line, and left out Ask's earlier answers and the saved checks; it names them now, here and in `docs/DECISIONS.md`. The guide's steps for a new installation name the region.

## Usage check

No new Claude call. The morning run reads less (each calendar once; the tasks only as far as the longest notice), and the functions' queries no longer cross the Atlantic. GitHub Actions: about two minutes a push, inside the free allowance.
