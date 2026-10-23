# Plant Care

Phone-first PWA for one grower: photograph a plant at the backyard or at the farm, identify it with Claude, keep a species profile written for Cap Bon conditions, and (from Phase 2) get reminders. Design in `docs/SPEC.md`, working rules in `CLAUDE.md`, milestone in `PHASE1.md`.

## Stack

React + Vite + TypeScript PWA on Vercel, serverless functions under `api/`, Claude API (`claude-sonnet-5-5`, structured outputs), Supabase (Postgres, Storage, Auth).

## One-time setup (Mohamed)

1. **Supabase**: create a project. In the SQL editor run `supabase/schema.sql`. In Storage create a private bucket named `photos`, then run the storage policy from the comment at the end of `schema.sql`. In Authentication create one user with email and password.
2. **Claude**: create an API key at platform.claude.com.
3. **Vercel**: create a project from this repository. Add the environment variables named in `.env.example` (Production and Preview): `ANTHROPIC_API_KEY`, `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY`, `CRON_SECRET` (any long random string). The VAPID keys are for Phase 3.
4. **Locally**: copy `.env.example` to `.env.local` and fill the same names. `.env.local` is git-ignored.
5. **Phone**: open the Vercel URL in Chrome, menu → Add to Home screen.

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
api/            Vercel functions: identify, profile, daily (cron), helpers _claude.ts and _supabase.ts
prompts/        system context, per-call rules, JSON schemas sent to Claude
src/            the PWA: screens, components, lib (supabase, api, image, db), i18n
supabase/       schema.sql
docs/           SPEC.md, DECISIONS.md
```
