# Phase 1 — Capture, identify, profile, save

Done when Mohamed can photograph a tree at the farm on his Android phone, confirm the identification, read its profile and see it in the plant list, on the deployed Vercel URL.

## Setup (Mohamed does the parts marked ★)

- [ ] ★ Supabase project created; URL, anon key and service-role key noted.
- [ ] ★ `supabase/schema.sql` run in the Supabase SQL editor; bucket `photos` created, private.
- [ ] ★ One user created in Supabase Auth (email + password).
- [ ] ★ Claude API key created at platform.claude.com.
- [ ] ★ Vercel project created from the GitHub repo; environment variables from `.env.example` filled in the Vercel dashboard (Production and Preview).
- [ ] `.env.local` present locally with the same names (never committed).

## Build

- [ ] Vite + React + TypeScript scaffold, `vite-plugin-pwa` with manifest (name "Plant Care", standalone, portrait, icons 192 and 512), `vercel.json` with the cron entry.
- [ ] Supabase client in `src/lib/supabase.ts`; login screen; session kept in local storage; every API call sends the access token.
- [ ] `api/_claude.ts` and `api/_supabase.ts` with `verifyUser`.
- [ ] `api/identify.ts`: 1–2 images → candidates JSON from `prompts/identify.md` + `identify.schema.json`.
- [ ] Capture screen: camera or gallery → EXIF GPS (`exifr`) → resize to 1,280 px JPEG 0.85 on a canvas → POST identify → candidates list with confidence bars and evidence → Confirm, pick another, or type a name → second-photo prompt when top confidence < 0.6.
- [ ] Record form: tag, quantity (default 1), site (backyard / farm), zone (free text with recent values suggested), planted on (date, optional), source, rootstock (optional); GPS pre-filled when found.
- [ ] Save: upload the photo to `photos/{plant_id}/{timestamp}.jpg`, insert `plants` and `photos` rows (`kind = identify`, `ai_result` = the candidates JSON).
- [ ] `api/profile.ts`: if no `species` row matches `lower(scientific_name)` + cultivar, call Claude with `prompts/profile.md` + `profile.schema.json`, insert with `confirmed = false`; else return the existing row.
- [ ] Profile review screen: all profile sections readable, "AI-written, confirm" banner, Confirm button sets `confirmed = true`; field edits go to `user_edits`.
- [ ] Plant screen with tabs Needs, Calendar (rules listed by month; tasks come in Phase 2), Health (pests by month), Guild and uses (toxicity badge), Journal (photos newest first).
- [ ] Plants screen: cards with photo, tag, species common name, site and zone; filter by site; search by tag or name.
- [ ] Deployed to Vercel; installed on the phone from Chrome ("Add to Home screen").

## Acceptance tests (run on the phone, on the deployed URL)

1. Photograph an olive at the farm → top candidate *Olea europaea* with the French and Arabic names shown → confirm → profile appears with water, sun, salinity, pruning window in February, olive fly under pests, toxicity for chickens and goats → plant listed under Farm.
2. Photograph the same olive again → the existing species profile is attached, no new profile call (check `input_tokens` in the response: no profile usage logged).
3. Photograph the loquat in the backyard → candidates include *Eriobotrya japonica* → save with site Backyard → it appears when the Plants filter is Backyard only.
4. Photograph a blurry wall → one candidate "unknown" with confidence 0 and advice on what to photograph; nothing is saved unless the user types a name.
5. Sign out, open `/api/identify` directly → 401.

## Usage check

After the three test plants, the Claude Console usage page shows under $0.20 spent.
