# Phase 7 — Check before planting

Done when Mohamed can, at a nursery or before ordering, type a plant's name (or carry on from a Capture photo, or open a species already in the library), say which site he has in mind, and get a verdict written for his ground: plant, plant with care, or avoid, with the reasons factor by factor (saline well water, water, heat, cold and chill hours, lime, animals, space, pests), where it would go among the plants already recorded, when to plant, what to look for when buying, the first year's care and better-suited alternatives; and when the species and its checks stay in the library as "not planted yet", from where the check reopens or runs again, on the deployed Vercel URL.

Reference: the "Check before planting" item of the feature review of 2026-10-25 (Planta's light meter answers "which plant suits this spot"; the permaculture forums say food-forest planning tools are missing; a salt-sensitive tree bought for a saline well is the costliest mistake this site can make), and the Phase 6 Ask route it is built like. This phase goes beyond the five of `docs/SPEC.md`; the choices are in `docs/DECISIONS.md`.

## Plan

- **One new Claude call, `POST /api/check`**, `{ species_id, site?, zone?, note?, lang? }`. It reads the species profile and the plant inventory (every plant with its species, grouped by site and zone, the zone lists from Settings, and how many plants of this species are already recorded) and asks Claude for a structured verdict (`prompts/check.md`, `prompts/check.schema.json`): `verdict` (plant, plant_with_care, avoid), `summary`, `best_site` (farm, backyard, either, neither), `placement`, eight `factors` each good, caution or problem with a note, `planting_time`, `buying_tips`, `first_year`, and `alternatives` (name and why, empty for a plain "plant"). Text in the app's language. It follows the CLAUDE.md conventions like the other calls (owner token, cached site context, structured output, the refusal fallback); `max_tokens` 4,096 at medium effort. The route only reads.
- **The species comes from the profile route.** A typed name goes through `/api/profile` as Capture's "type a name" does: a name that matches a stored scientific or common name exactly costs nothing; any other spelling is profiled (about 15 cents) and then matched to the species already kept, or kept as a new species with no plant, which is what "not planted yet" means. The screen shows the usage whenever a profile call spent tokens. An alternative opened with "Check this one" carries its binomial, so a species already in the library is found without a call. Nothing deletes a species behind the grower's back; the species screen still offers Delete for a profile no plant uses, and its confirm says the checks go with it.
- **Checks are kept in a new `planting_checks` table** (species, time, site, zone, note, the result with its usage), written by the app under an id made on the phone like the Ask answers, so a retried save cannot double it and a check answered after the screen was left is still saved. One ★ SQL run; until then a check still runs and the screen says it is not kept.
- **Three ways in.** The Species tab gets a "Check before planting" button and filter chips (All, Planted, Not planted yet) with the latest verdict on each card. Capture, once a candidate is confirmed and its profile is ready, offers "Not planted yet? Check it instead" (the profile is then kept, not discarded with the capture). Every species screen gets a "Before planting" card: the latest check with Open and Check again, or a first Check button.
- **The check screen** (`/check`): with no species, a name field; with one, its name. Then the site (Farm, Backyard, Not decided), an optional zone (chips from the Settings lists) and an optional note ("shade for the chicken run"). The result card leads with the verdict and the summary, then the factors, placement, planting time, buying tips, first year and alternatives (each with "Check this one", which opens the check prefilled with the alternative's name, the same site and note), the usage and the save state. A stored check opens read-only with "Check again".

## Setup (Mohamed does the parts marked ★, in this order)

- [ ] ★ After the deploy, tap "Reload" on the update banner (or close and reopen the installed app) so the phone runs the 0.7.0 shell.
- [ ] ★ Before the SQL below: run acceptance test 1.
- [ ] ★ Then run this once in the Supabase SQL editor (project → SQL Editor → New query → Run). It creates the `planting_checks` table; `supabase/schema.sql` has the same lines for a fresh project. Running it twice does no harm.

  ```sql
  create table if not exists planting_checks (
    id          uuid primary key default gen_random_uuid(),
    species_id  uuid not null references species(id) on delete cascade,
    checked_at  timestamptz not null default now(),
    site        site_t,
    zone        text not null default '',
    note        text not null default '',
    result      jsonb not null
  );
  create index if not exists planting_checks_species_idx on planting_checks (species_id, checked_at desc);
  alter table planting_checks enable row level security;
  drop policy if exists owner_all on planting_checks;
  create policy owner_all on planting_checks for all to authenticated using (true) with check (true);
  ```

- [x] Nothing else to create: the route uses the keys already in Vercel.

## Build

- [x] `POST /api/check` with its prompt, schema, context and inventory helpers (`api/check.ts`, reusing the profile blocks of `api/_context.ts`; `prompts/check.md`, `prompts/check.schema.json`); tests for the request validation, the context text and the inventory read (`tests/check.test.ts`).
- [x] `planting_checks` in `supabase/schema.sql`; `src/lib/db.ts` reads and writes it (`ChecksUnavailable` until the SQL is run; the library reads only each check's verdict), with tests (`tests/checks-db.test.ts`).
- [x] Check screen (`src/screens/CheckScreen.tsx`, route `/check`) and the verdict card (`src/screens/check/VerdictCard.tsx`).
- [x] Species tab: the button, the filter chips and the verdict pills; species screen: the "Before planting" card (`src/screens/species/BeforePlantingCard.tsx`); Capture: "Not planted yet? Check it instead".
- [x] Strings in `en.ts` and `fr.ts`; Settings phase card; version 0.7.0; README, CLAUDE.md and `docs/DECISIONS.md`.

## Acceptance tests (run on the phone, installed app on 0.7.0)

1. Before the ★ SQL: Species → "Check before planting" → type a plant you do not have yet (for example "avocado") → Farm → Check → "Finding the species (a new one is profiled first)…", then "Checking the fit…", then the verdict card with its summary, eight factors, placement, planting time, buying tips, first year and alternatives; under the species name, "New profile written" with its usage; a notice says the check is not kept. Back to Species → the avocado is listed under "Not planted yet", without a verdict pill.
2. After the ★ SQL: open the avocado → "Before planting" → Check before planting → Backyard → Check → the verdict card, no notice. Back on the species screen, the card shows this verdict with today's date; Species → the avocado's card shows the verdict pill.
3. Species → "Check before planting" → type a species you already have (for example "olive") → Farm → Check → "Finding the species…" passes quickly and no "New profile written" line or profile usage appears under the species name before "Checking the fit…"; the placement names zones and plants from your farm.
4. On a verdict with alternatives → "Check this one" on one of them → the check screen opens with its name, the same site and note, and nothing runs until Check → Check → a verdict for the alternative.
5. Capture → photograph a plant whose species is not in your library yet → Confirm → once the profile is ready, "Not planted yet? Check it instead" → the check screen with that species → Check → verdict. Species → it is listed under "Not planted yet".
6. Settings → Français → check a plant → the verdict text and the labels are in French. English again afterwards.
7. Species → filter chips: All, Planted, Not planted yet each list the right species.

## Usage check

A check is one Claude call: about 3,000 to 6,000 input tokens (the profile, the inventory, the rules) and 1,500 to 2,500 output tokens with the thinking, so about 10 to 18 cents at Fable 5.1 prices ($10 and $50 per million tokens). A name not yet in the library adds one profile call, about 15 cents.

Results (2026-10-26): typecheck, lint, `npm test` (78 tests, 14 of them new: the request validation, the context text, the inventory read past 1,000 plants, the zone lists, the check rows written once under their id, the newest verdict per species, the cascade from an unused species, and `storedCheck`) and build pass. A review workflow (four reviewers, each checked by a skeptic) kept 21 findings, all low or medium, all fixed:
- "Check this one" could pay for a profile already in the library and hide its usage: alternatives now carry their binomial, and every profile call that spent tokens shows its usage.
- "Check again" could drop a check whose save had failed.
- Plants with no planting date were described as mature.
- The prompt asked about health and zone sizes the context does not hold.
- A long Settings zone was refused.
- The library downloaded every full result.
- The species card read a failed load as "not checked yet".
- The species delete confirm did not mention the checks.
- Two French strings and several doc claims were off.

The screens were then driven in the desktop app's browser at phone width, against an in-memory copy of the data with `/api/identify`, `/api/profile` and `/api/check` mocked (nothing sent to Supabase or Claude):
- a new name profiled then checked, with the table missing (notice) and present (saved);
- the eight factors, placement and alternatives;
- "Check this one" opening a prefilled form, found by its binomial;
- another spelling matched with its usage shown;
- an existing species;
- a failed save with Save again, and a failed save retried on "Check again";
- a refusal and an API error;
- "Check another plant";
- the species screen card: verdict, Open, Check again, and a failed read with Retry;
- the library chips and verdict pills;
- Capture → "Not planted yet? Check it instead", with the species kept after Capture closed;
- French and dark mode.

Tests 1 to 7 on the phone, with real Claude answers, wait for Mohamed.
