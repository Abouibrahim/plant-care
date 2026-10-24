# Plant Care

Phone-first PWA for one grower: photograph a plant at the backyard or at the farm, identify it with Claude, keep a species profile written for Cap Bon conditions, get a task calendar from it and a push digest every morning, and diagnose a problem photo against the plant's own context. Design in `docs/SPEC.md`, working rules in `CLAUDE.md`, milestones in `PHASE1.md` to `PHASE4.md`.

## Stack

React + Vite + TypeScript PWA on Vercel, serverless functions under `api/`, Claude API (`claude-sonnet-5-5`, structured outputs), Supabase (Postgres, Storage, Auth).

## One-time setup (Mohamed)

1. **Supabase**: create a project. In the SQL editor run `supabase/schema.sql` once (it creates the tables, the private bucket `photos` and its storage policy). If the run ends with a notice about the "owner photos" policy, add that policy from Storage → Policies: bucket `photos`, all operations for authenticated users, expression `bucket_id = 'photos'`. In Authentication create one user with email and password.
2. **Claude**: create an API key at platform.claude.com.
3. **Vercel**: create a project from this repository. Add the environment variables named in `.env.example` (Production and Preview): `ANTHROPIC_API_KEY`, `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY`, `CRON_SECRET` (any long random string).
4. **Web Push**: generate a VAPID pair once with `npx web-push generate-vapid-keys` and add `VAPID_PUBLIC_KEY`, `VAPID_PRIVATE_KEY`, `VAPID_SUBJECT` (`mailto:` plus your address) and `VITE_VAPID_PUBLIC_KEY` (the public key again) to Vercel, then redeploy: the `VITE_` copy is baked into the app at build time.
5. **Locally**: copy `.env.example` to `.env.local` and fill the same names. `.env.local` is git-ignored.
6. **Phone**: open the Vercel URL in Chrome, menu → Add to Home screen; then Settings → Reminders → Turn on.

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
npm run build
```

`npm run icons` regenerates the PWA icons under `public/icons`.

## Layout

```
api/            Vercel functions: identify, profile, diagnose, expand, push-subscribe, daily (cron: expansion + push digest);
                helpers _claude.ts, _images.ts, _supabase.ts, _tasks.ts, _push.ts
prompts/        system context, per-call rules, JSON schemas sent to Claude
public/         icons and push-sw.js (push handlers imported by the generated service worker)
src/            the PWA: screens, components, lib (supabase, api, image, db, push), i18n
supabase/       schema.sql
docs/           SPEC.md, DECISIONS.md
```
