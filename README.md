# Plant Care

Phone-first PWA for one grower with two sites in Cap Bon, the backyard at home and the farm at borgdanet. Photograph a plant, let Claude identify it and write a species profile for Cap Bon conditions, and the app turns the profile into a task calendar, a daily round on Today and a push digest every morning.

How to use it: [`docs/USER-GUIDE.md`](docs/USER-GUIDE.md). Design in `docs/SPEC.md`, working rules in `CLAUDE.md`, deviations from the design in `docs/DECISIONS.md`, milestones in `PHASE1.md` to `PHASE13.md` and `UI-REFRESH.md`, the review behind Phase 10 in `docs/REVIEW-2026-10-30.md` (the Phase 11 it proposes is still open).

## What it does

- **Capture**: a photo goes to Claude, which names up to three candidates with their confidence and evidence; a confirmed species gets its profile once, shared by every plant of it.
- **Profiles**: site fit, water, sun and heat, salinity, frost and chill, a care calendar, pests, companions, uses and toxicity. The grower confirms them and edits any part, the care calendar and the pests included; hand edits survive a regeneration.
- **Today**: the tasks late, due today, open now (a window that has started) and due in the next six days, by site and then by kind of task (water, prune, harvest…), each kind folding away for the day and shared as a plain-text list with whoever does it, the coming days below; with Done (and a note), Skip, Snooze and Undo; a zone's waterings due together in one card, and so a zone's plants sharing a window job (a pruning, a harvest), done or skipped together with any plant left out; a site's waterings done in one tap.
- **Morning push**: each morning at 06:00 Tunis time or within the hour after, one notification per site with something due (a zone's waterings, or a window job its plants share, on one line) and a weather notification when an alert or a rain skip applies.
- **Health**: Diagnose weighs a problem photo against the plant's own context and sets a follow-up reminder; treatments are logged from it.
- **Ask Claude** about one plant, with the answers kept in its journal; **Check before planting** weighs a species against the sites before it is bought.
- **Weather** (Open-Meteo): waterings skipped after rain; alerts for heat, sirocco, frost, gales and heavy rain; the hours that suit spraying when a task or a recent diagnosis asks for a spray.
- **Map and tags**: the plants on a map (satellite with a map key, otherwise the street map), placed from the phone's location or by hand, and printable QR tags that open a tree's page.
- **Journal**: photos, tasks, treatments and questions per plant; care done by hand can be logged and a one-off reminder set; a plant can be deleted from its page.
- **Settings**: English or French, zone lists per site, the rain-skip threshold, CSV export of plants and tasks.
- Each photo is stored with a thumbnail and the phone keeps the photos it has shown; the tables are closed to every account but the owner's.

## Stack

React + Vite + TypeScript PWA on Vercel, serverless functions under `api/`, Claude API (`claude-fable-5-1`, the most capable model, with structured outputs and the server-side refusal fallback), Supabase (Postgres, Storage, Auth), Open-Meteo for the weather, Leaflet for the map.

## One-time setup (Mohamed)

1. **Supabase**: create a project and note its URL, its anon key and its service-role key from the project's settings. In the SQL editor run `supabase/schema.sql` once, on a new project only (it creates the tables, the `owners` table and the `is_owner()` function every policy reads, the private bucket `photos` and its storage policy). If the run ends with a notice about the "owner photos" policy, add that policy from Storage → Policies: bucket `photos`, all operations for authenticated users, both expressions `bucket_id = 'photos' and is_owner()`. In Authentication create one user with email and password, then run `insert into owners (user_id) select id from auth.users where email = '<your email>';` in the SQL editor, and check that `select count(*) as owners from owners;` says 1: the policies accept that account only (the `/api` routes accept the one named by `OWNER_USER_ID`, see step 3; the two must be the same user). Under Sign In / Providers turn off "Allow new users to sign up".
2. **Claude**: create an API key at platform.claude.com. Keep the organisation on the default 30-day data retention: under zero data retention every call answers 400. What each call costs is in `docs/USER-GUIDE.md`, chapter 13.
3. **Vercel**: create a project from this repository. Add the environment variables named in `.env.example` (Production and Preview): `ANTHROPIC_API_KEY`, `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, `OWNER_USER_ID` (the UUID of your user under Supabase → Authentication → Users: the `/api` routes accept that account only), `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY`, `CRON_SECRET` (any long random string). Redeploy after adding them, since every `VITE_` value is built into the app. Check that Settings → Cron Jobs lists `/api/daily` at `0 5 * * *`. `vercel.json` asks for 300 s functions, which Vercel allows on Hobby with Fluid compute, the default for new projects. If the plan refuses it anyway, lower `maxDuration` in `vercel.json` and `FUNCTION_BUDGET_MS` in `api/_claude.ts` together, keeping the budget about 20 s under the limit; a short limit makes new species profiles fail with "Request timed out.", since one takes Claude a minute or more.
4. **Web Push**: generate a VAPID pair once with `npx web-push generate-vapid-keys` and add `VAPID_PUBLIC_KEY`, `VAPID_PRIVATE_KEY`, `VAPID_SUBJECT` (`mailto:` plus your address) and `VITE_VAPID_PUBLIC_KEY` (the public key again) to Vercel, then redeploy: the `VITE_` copy is baked into the app at build time.
5. **Locally**: copy `.env.example` to `.env.local` and fill the same names. `.env.local` is git-ignored.
6. **Phone**: open the Vercel URL in Chrome, menu → Add to Home screen; then Settings → Reminders → Turn on. After each deploy, tap Reload on the "A new version is ready." banner: the app never reloads by itself.

Steps 7 to 10 and 12 bring a project set up before those phases up to date; step 11, the satellite map, is optional for any project, a new one included. Run their SQL in the order given: the Phase 10 SQL rewrites the policies of the tables that steps 7 to 10 create. Do not run the Phase 6, 7 or 8 SQL again after step 12, since each run sets its table back to "any signed-in account"; if one was run again, run the Phase 10 SQL again.

7. **Zone lists (Phase 5)**: a project set up before Phase 5 needs the `settings` table; run the SQL from the Setup section of `PHASE5.md` once in the Supabase SQL editor. A fresh project gets it from `supabase/schema.sql`.
8. **Ask Claude (Phase 6)**: a project set up before Phase 6 needs the `questions` table and the rebuilt `journal` view; run the SQL from the Setup section of `PHASE6.md` once in the Supabase SQL editor. A fresh project gets both from `supabase/schema.sql`.
9. **Check before planting (Phase 7)**: a project set up before Phase 7 needs the `planting_checks` table; run the SQL from the Setup section of `PHASE7.md` once in the Supabase SQL editor. A fresh project gets it from `supabase/schema.sql`.
10. **Weather (Phase 8)**: a project set up before Phase 8 needs the `weather_days` table; run the SQL from the Setup section of `PHASE8.md` once in the Supabase SQL editor. Open-Meteo needs no key; its free tier is for non-commercial use.
11. **Satellite map (Phase 9, optional)**: create a free TomTom API key at my.tomtom.com (Map Display API, domains locked to the app's address and `localhost`; add no prepaid credit, so use past the free 200,000 tiles a month is refused rather than billed) and add it as `VITE_TOMTOM_API_KEY` in Vercel, then redeploy; the key is baked into the app. An ArcGIS Location Platform key in `VITE_ARCGIS_API_KEY` also works when the TomTom key is blank. Without either the map shows the OpenStreetMap street map. Steps in `PHASE9.md`.
12. **Owner-pinned tables (Phase 10)**: a project set up before Phase 10 needs the `owners` table and the policies that read it; run the SQL from the Setup section of `PHASE10.md` once in the Supabase SQL editor, with your email in its `insert`. Its last line must say 1. A fresh project gets them from `supabase/schema.sql` (step 1).

## Running it

The 06:00 run can be checked without sending anything. With the cron secret, a dry run composes the digest and the weather push and counts what the rain would skip; it still stores the forecast and writes the tasks, as a real run does. In PowerShell, type `curl.exe`.

```bash
curl -H "Authorization: Bearer <CRON_SECRET>" "https://plant-care-phi-fawn.vercel.app/api/daily?dry=1"
```

The logs, rotating a key and changing the owner are covered in `docs/USER-GUIDE.md`, chapter 15. The in-app notices that name a `PHASE*.md` file are in chapter 14, which points to their SQL in chapter 15.

## Commands

Node 22.12 or newer.

```bash
npm install
```

```bash
npm run dev
```

The dev server serves the app only. The functions under `api/` run on Vercel (or with `vercel dev` if the Vercel CLI is installed and linked).

```bash
npm run typecheck
```

```bash
npm run lint
```

```bash
npm test
```

```bash
npm run build
```

`npm test` runs the vitest suite under `tests/`: the dates, the task expansion, the digest, the Today reading, the zone batches, the kinds of work and their folds, the shared list and its share, the token verdict, the app's task writes, the planting check, the weather, the map and tags, the photos and their cache, the owner check, the keep-alive and the app's calls to the functions. The app's task writes, the photos and the saved checks, and parts of the expansion, digest, weather and planting-check tests, run against an in-memory copy of the tables (`tests/mockdb.ts`); the rest test pure functions or stub the client. `npm run preview` serves the built app, and `npm run icons` regenerates the PWA icons under `public/icons`.

## Layout

```
api/            Vercel functions: identify, profile, diagnose, ask, check, weather, expand, push-subscribe, daily (cron: weather, expansion, rain skip, push digest);
                helpers _claude.ts, _context.ts, _http.ts, _images.ts, _supabase.ts, _tasks.ts, _push.ts, _weather.ts
prompts/        system context, per-call rules, JSON schemas sent to Claude
public/         icons and push-sw.js (push handlers imported by the generated service worker)
scripts/        make-icons.mjs
src/            the PWA: screens, components, lib (data and API calls, photos, push, dates, tasks, batches, weather, map, exports), i18n (en, fr)
supabase/       schema.sql
tests/          the vitest suite, with mockdb.ts (an in-memory copy of the tables) and data/
docs/           SPEC.md, DECISIONS.md, REVIEW-2026-10-30.md, USER-GUIDE.md
vercel.json     the cron, the function limits and the rewrite to the app; .env.example names every variable
```
