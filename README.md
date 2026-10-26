# Plant Care

Phone-first PWA for one grower: photograph a plant at the backyard or at the farm, identify it with Claude, keep a species profile written for Cap Bon conditions, get a task calendar from it and a push digest every morning, and diagnose a problem photo against the plant's own context. The interface is in English or French, plants and tasks export as CSV, each site keeps a list of zones, a species' care calendar and pests can be edited by hand, any plant can be discussed with Claude, the answers kept in its journal, a plant can be checked against the sites before it is bought or planted, and the local weather (Open-Meteo) skips waterings after rain, warns of heat, sirocco, frost and gales, and shows the hours that suit spraying. Design in `docs/SPEC.md`, working rules in `CLAUDE.md`, milestones in `PHASE1.md` to `PHASE8.md`.

## Stack

React + Vite + TypeScript PWA on Vercel, serverless functions under `api/`, Claude API (`claude-fable-5-1`, the most capable model, with structured outputs and the server-side refusal fallback), Supabase (Postgres, Storage, Auth).

## One-time setup (Mohamed)

1. **Supabase**: create a project. In the SQL editor run `supabase/schema.sql` once (it creates the tables, the private bucket `photos` and its storage policy). If the run ends with a notice about the "owner photos" policy, add that policy from Storage → Policies: bucket `photos`, all operations for authenticated users, expression `bucket_id = 'photos'`. In Authentication create one user with email and password, and under Sign In / Providers turn off "Allow new users to sign up": the table policies trust any signed-in user (the `/api` routes accept the one named by `OWNER_USER_ID`, see step 3).
2. **Claude**: create an API key at platform.claude.com.
3. **Vercel**: create a project from this repository. Add the environment variables named in `.env.example` (Production and Preview): `ANTHROPIC_API_KEY`, `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, `OWNER_USER_ID` (the UUID of your user under Supabase → Authentication → Users: the `/api` routes accept that account only), `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY`, `CRON_SECRET` (any long random string).
4. **Web Push**: generate a VAPID pair once with `npx web-push generate-vapid-keys` and add `VAPID_PUBLIC_KEY`, `VAPID_PRIVATE_KEY`, `VAPID_SUBJECT` (`mailto:` plus your address) and `VITE_VAPID_PUBLIC_KEY` (the public key again) to Vercel, then redeploy: the `VITE_` copy is baked into the app at build time.
5. **Locally**: copy `.env.example` to `.env.local` and fill the same names. `.env.local` is git-ignored.
6. **Phone**: open the Vercel URL in Chrome, menu → Add to Home screen; then Settings → Reminders → Turn on.
7. **Zone lists (Phase 5)**: a project set up before Phase 5 needs the `settings` table; run the SQL from the Setup section of `PHASE5.md` once in the Supabase SQL editor. A fresh project gets it from `supabase/schema.sql`.
8. **Ask Claude (Phase 6)**: a project set up before Phase 6 needs the `questions` table and the rebuilt `journal` view; run the SQL from the Setup section of `PHASE6.md` once in the Supabase SQL editor. A fresh project gets both from `supabase/schema.sql`.
9. **Check before planting (Phase 7)**: a project set up before Phase 7 needs the `planting_checks` table; run the SQL from the Setup section of `PHASE7.md` once in the Supabase SQL editor. A fresh project gets it from `supabase/schema.sql`.
10. **Weather (Phase 8)**: a project set up before Phase 8 needs the `weather_days` table; run the SQL from the Setup section of `PHASE8.md` once in the Supabase SQL editor. Open-Meteo needs no key; its free tier is for non-commercial use.

## Commands

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

`npm test` runs the vitest suite under `tests/` (dates, the task expansion, the digest, the Today reading, the token verdict, the app's task writes, the planting check and the weather, against an in-memory copy of the tables). `npm run icons` regenerates the PWA icons under `public/icons`.

## Layout

```
api/            Vercel functions: identify, profile, diagnose, ask, check, weather, expand, push-subscribe, daily (cron: weather, expansion, rain skip, push digest);
                helpers _claude.ts, _context.ts, _images.ts, _supabase.ts, _tasks.ts, _push.ts, _weather.ts
prompts/        system context, per-call rules, JSON schemas sent to Claude
public/         icons and push-sw.js (push handlers imported by the generated service worker)
src/            the PWA: screens, components, lib (supabase, api, image, db, push, csv, export), i18n (en, fr)
supabase/       schema.sql
docs/           SPEC.md, DECISIONS.md
```
