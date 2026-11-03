# Plant Care Assistant — build brief for Claude Code

Single-user plant-care app for Mohamed: photograph a plant at the backyard (walled garden at home) or at the farm (borgdanet, Menzel Bouzelfa, Cap Bon, Tunisia), identify it with the Claude API, store a species profile written for Cap Bon conditions, and get reminders for water, pruning, feeding, mulching, harvest, pest scouting, propagation and protection.

`docs/SPEC.md` is the design agreed on 2026-10-23; this file turns it into working rules, and `docs/DECISIONS.md` records every deviation from either, with its reason (the few that had no entry before, such as the spec's email fallback and digest time, are gathered in its entry of 2026-11-01). Phases 1 to 13 are built (0.13.0). `docs/USER-GUIDE.md` describes the app as it is, and `PHASE13.md` is the latest milestone. `docs/REVIEW-2026-10-30.md` is the review of 0.9.0: Phase 10 built its items 1.2, 3.1 to 3.3, 4.3, 6.1 and 6.2, and the rest are still open, though the file itself still says nothing is implemented. Each phase has its `PHASE<n>.md`: the plan, the ★ setup steps Mohamed does, the build list and the acceptance tests.

## Decisions already made (do not reopen)

- **App**: React + Vite + TypeScript, installable PWA (`vite-plugin-pwa`, which offers a Reload and never reloads by itself), phone-first for Android Chrome. Camera through `<input type="file" accept="image/*" capture="environment">`.
- **Hosting**: Vercel. Static app plus serverless functions under `api/` (Node runtime) plus one cron job, `vercel.json` → `{"crons":[{"path":"/api/daily","schedule":"0 5 * * *"}]}` (05:00 UTC = 06:00 Tunis; Tunisia has no daylight saving; on Hobby the cron fires at any minute of that hour, on the production deployment only). `vercel.json` also gives every function `maxDuration` 300 with `prompts/**` included, and rewrites every path outside `/api/` to `index.html`. `api/_claude.ts` keeps each call inside 280 s of those 300, so lower the two together.
- **AI**: Claude API, model `claude-fable-5-1`, the most capable model (it replaced `claude-sonnet-5-5` on 2026-10-25 and supersedes the model named in the spec; see `docs/DECISIONS.md`), structured outputs (`output_config.format` with `type: "json_schema"`), images as base64 blocks, prompt caching on the shared system prompt, and the server-side refusal fallback (`fallbacks: "default"` through `client.beta.messages.create`). SDK `@anthropic-ai/sdk`, current version (`output_config` is GA; the one beta header is `server-side-fallback-2026-07-01`).
- **Data**: Supabase. Postgres from `supabase/schema.sql`, a private Storage bucket `photos`, Auth with one email/password user. Functions use the service-role key; the browser uses the anon key behind RLS, whose policies accept only the account listed in the `owners` table (`is_owner()`, Phase 10). The functions accept the account named by `OWNER_USER_ID`; the `owners` row and the variable must name the same account, so change both together.
- **Notifications**: Web Push with VAPID keys (`web-push` package), sent by `/api/daily`; no email fallback.
- **Map and tags** (Phase 9): Leaflet 1.9.4, called directly in a lazy chunk. OpenStreetMap street tiles; satellite from TomTom (`VITE_TOMTOM_API_KEY`) or, with an ArcGIS key alone, Esri (`VITE_ARCGIS_API_KEY`). No tiles are stored for offline use. Tree tags are QR codes (`lean-qr`, correction Q) that hold `https://<app>/t/<first 8 hex digits of the plant id>`.
- **Secrets**: only in Vercel environment variables and a local `.env.local` that is git-ignored. Names in `.env.example`. Never print, log or commit a key value. Mohamed adds the keys himself. Every `VITE_` value is built into the app's JavaScript and is public by design: the Supabase URL and anon key (the owner-only policies guard the data), the VAPID public key, and the map keys (their domain lock guards them). A change to one needs a redeploy, then Reload on the phone.
- **Language**: every string in `src/i18n/en.ts`, mirrored key for key in `src/i18n/fr.ts` (a missing key fails the typecheck). Settings → Language stores the choice per phone and reloads the app; without a choice, the phone's language decides. The functions import `en` directly for the push and the notes the server writes on tasks; the server's error texts are English literals in `api/`, outside `en.ts`. All three stay English.

## Repo layout

```
api/                 Vercel functions (one file per route)
  _claude.ts         Anthropic client, callJson()
  _supabase.ts       service-role client, verifyUser(req), handleError()
  _tasks.ts          the task expansion (rule keys, windows, waterings, stale tasks), runExpansion()
  _push.ts           the digest (loadDigestTasks, composeDigest, sendDigest)
  _context.ts        the plant, species and weather text blocks shared by diagnose, ask and check
  _weather.ts        Open-Meteo: the point, fetch and parse, weather_days, the rain skip, the weather push (Phase 8)
  _images.ts         image validation shared by identify and diagnose
  _http.ts           the request and response types, keepAlive() and reply()
  identify.ts        POST → candidates
  profile.ts         POST → the species profile: looked up first, written by Claude when the lookup finds nothing; regenerate keeping user_edits; lookup_only after a lost reply
  diagnose.ts        POST → diagnosis
  ask.ts             POST → answer to a free question about one plant (Phase 6)
  check.ts           POST → planting check of a species against the sites and their plants (Phase 7)
  weather.ts         POST → fetch and store the forecast now, bearer-checked (Phase 8)
  expand.ts          POST → runExpansion now (one plant, or all), bearer-checked
  daily.ts           cron: fetch the weather, expand tasks, skip waterings after rain, send the weather push and the digest; ?dry=1 composes without sending
  push-subscribe.ts  POST → store or remove a push subscription (DELETE removes too)
prompts/             system-context.md, identify.md, profile.md, diagnose.md, ask.md, check.md, *.schema.json
public/              icons/, and push-sw.js (the push and notification-tap handlers the service worker imports; each push also tells the open app, which reads Today again)
scripts/             make-icons.mjs (npm run icons)
src/                 the PWA (screens: Login, Today, Capture, Check, Plant, Plants with its map, the species library, Species, Settings, Tags, and the tag link /t/:code; map/ holds the Leaflet screens, loaded lazily)
                     Today shows each site's work due now by kind of task (a heading per kind that folds for the day and shares the kind's list), the coming days below
  components/        Layout (the tab bar and the banners), TaskCard, RecordForm, the profile sections
  lib/               the data and API layer (db, api, supabase), photos (image, photoCache), push, the exports (export, csv),
                     the list a kind of work is handed out with (handout) and its share or copy (share),
                     and the pure rules: dates, batches, activities and weather, which api/ imports or could, and today, map, location, check, ask, diagnosis
  i18n/              en.ts, fr.ts, and index.ts, which picks one
  types.ts           shared types, mirrored by prompts/*.schema.json and supabase/schema.sql; the diagnosis: and manual: rule-key prefixes
  version.ts         the version Settings shows
supabase/schema.sql  tables, enums, the journal view, owners and is_owner(), RLS, the photos bucket and its policy; run once, on a new project only
tests/               vitest over the dates, the task expansion, the digest, the Today reading, the zone batches, the kinds of work and their
                     folds, the shared list and its share, the token verdict, the owner check, the app's task writes, the planting check, the
                     weather, the map and tags, the photos and their cache, the keep-alive and the app's calls to the functions (mockdb.ts
                     imitates the query builder; fixtures.ts builds rules, plants and tasks; data/ holds a real Open-Meteo answer and the spray texts)
docs/                SPEC.md (the design), DECISIONS.md (the deviations), REVIEW-2026-10-30.md (the review of 0.9.0 behind Phase 10;
                     Phase 11 is item 1 of the feature review of 2026-10-25, Phases 12 and 13 Mohamed's requests of 2026-11-01 and
                     2026-11-03), USER-GUIDE.md (the app as built)
PHASE1.md … PHASE13.md, UI-REFRESH.md   milestones with their ★ setup steps and acceptance tests
vercel.json, vite.config.ts, .env.example   the cron and the function limits; the manifest and the service worker; the variable names
```

## API conventions

- Every `/api/*` route except `daily` requires `Authorization: Bearer <supabase access token>`; verify it with `supabase.auth.getUser(token)` on the service client: a missing or rejected token is 401, a signed-in account other than `OWNER_USER_ID` is 403, and a fault of Supabase Auth itself is 502 or 500, never 401 (the app signs out on 401 only). The Vercel URL is public and the function holds the Claude key, so this check is not optional. `OWNER_USER_ID` is required: once a token is sent, every route answers 500 "Server is not configured: OWNER_USER_ID is missing" until it is set. The token check runs before the method check, so any method without a token gets 401.
- `/api/daily` accepts only `Authorization: Bearer ${process.env.CRON_SECRET}` (Vercel sends it automatically for cron invocations); an unset `CRON_SECRET` refuses every call, the cron's included. `?dry=1` (or `?dry=true`) with the secret composes the digest and the weather push without sending them and counts the rain skip without applying it; the forecast is still stored and the expansion runs in full: it writes new tasks, deletes the pending ones of rules that no longer apply, and closes ended windows and stale waterings.
- Request bodies carry images as `{ media_type, data }` base64, one or two per request (JPEG, PNG or WebP, raw base64 under 2.8 million characters; `api/_images.ts`); the client has already resized to 1,280 px on the long edge, JPEG quality 0.85, and read GPS and the time taken from EXIF (package `exifr`) before resizing. It also encodes a 320 px thumbnail at quality 0.8, which the app uploads straight to Storage as `<plant id>/<ts>.thumb.jpg` beside the photo; a tile falls back to the photo when the thumbnail is missing.
- Responses are the parsed JSON from Claude plus the usage `{ model, input_tokens, output_tokens, thinking_tokens, cache_read_input_tokens, cache_creation_input_tokens }` so usage stays visible; it is summed over a retry, and after a fallback the input, output and cache counts include the declined attempt (`thinking_tokens` comes from the top-level usage, which covers the answering attempt only). A refusal is HTTP 200 `{ refusal, ...usage }`. `/api/profile` answers `{ species, created, ...usage }`, with zero tokens when the lookup finds the species before any Claude call. A typed name matches only a stored name it equals (case aside), so another name for a stored species pays for a call, which answers `created: false` with its tokens when Claude gives the stored scientific name.
- Call `keepAlive(res)` (`api/_http.ts`) before a Claude call and answer through `reply()` or `sendError()`, never `res.status().json()` after it: a call that runs past 10 s sends its 200 early and a space every 15 s so a mobile network does not drop the silent connection, and an error after that goes in the body as `{ error, status }`, which `src/lib/api.ts` reads as that status. On the phone, `src/lib/api.ts` waits up to 300 s for a Claude route (30 s for the others) and reads a body of only spaces, or a cut one, as a lost reply (status 0); after a lost profile reply (not a regeneration's, which fails at once) it asks again with `lookup_only` at once and then every 10 s until 300 s after sending.

## Claude call conventions

- `system` is an array: first the site context from `prompts/system-context.md` with `cache_control: { type: "ephemeral" }`, then the call-specific instructions from `prompts/<call>.md`. Check the prompt-caching page before changing this: https://platform.claude.com/docs/en/build-with-claude/prompt-caching
- Images go before text in the user message, each preceded by a short label (`Image 1:`), as the vision page recommends: https://platform.claude.com/docs/en/build-with-claude/vision
- `output_config.format = { type: "json_schema", schema }` with the matching `prompts/*.schema.json`. Every property is required and every object has `additionalProperties: false`; keep it that way, the API limits optional fields and reorders them. Reference: https://platform.claude.com/docs/en/build-with-claude/structured-outputs
- `max_tokens` and `output_config.effort`: identify 2048 at low effort; profile 6000, diagnose 2048, ask 3072 and check 4096 at medium. `callJson` retries once with double `max_tokens` when `stop_reason` is `max_tokens`, and once after a rate limit, a 5xx or a connection error (honouring `retry-after`), but only while the 280 s budget leaves room. Otherwise a cut output throws "Claude output was cut at N tokens; try again", and a transient error is rethrown as the SDK's own error, which `handleError` answers 502 (rate limit, 5xx) or 500 (connection error); the "Not enough time left for the Claude call; try again" guard does not fire in practice, since every retry first needs 60 s left. On `refusal` it returns `{ ok: false, refusal, usage }` and the route surfaces the text; otherwise it parses the text blocks, joined.
- The `care_calendar` array in the profile is the single source of schedules, watering included (`every_days` and `litres` on the item); the `water` object holds needs, tolerance, signs and a summary only. This supersedes the `establishment_schedule` / `mature_schedule` fields named in the spec.
- Profile regeneration merges: the top-level blocks listed in `species.user_edits` are kept (read again after the Claude call, so a field saved during the wait survives), the scientific name and cultivar always stay, everything else is replaced, and the profile goes back to unconfirmed. Calendar items that share a rule key are folded into one when Claude writes a profile, new or regenerated (a calendar kept from `user_edits` stays as saved), and again each time the expansion reads a calendar; the rule editor refuses a new duplicate rather than folding, so a pair written before the fold can stay in the table.

```ts
// api/_claude.ts (abridged; the file is the reference)
export async function callJson<T>(opts: {
  rules: string; schema: Record<string, unknown>; content: Anthropic.Beta.BetaContentBlockParam[];
  maxTokens: number; effort?: "low" | "medium" | "high";
}): Promise<{ ok: true; data: T; usage: Usage } | { ok: false; refusal: string; usage: Usage }> {
  // In a loop bounded by FUNCTION_BUDGET_MS (280 s), with the SDK's own retries off:
  const msg = await client.beta.messages.create(
    {
      model: MODEL, // "claude-fable-5-1"
      max_tokens: maxTokens,
      system: [
        { type: "text", text: readPrompt("system-context.md"), cache_control: { type: "ephemeral" } },
        { type: "text", text: opts.rules },
      ],
      messages: [{ role: "user", content: opts.content }],
      output_config: { format: { type: "json_schema", schema: opts.schema }, effort: opts.effort ?? "medium" },
      betas: ["server-side-fallback-2026-07-01"],
      fallbacks: "default",
    },
    { timeout: remaining, maxRetries: 0 },
  );
  // max_tokens: one retry at double while time allows; refusal: { ok: false, refusal, usage };
  // otherwise { ok: true, data: JSON.parse(text blocks joined), usage }, the usage summed over the attempts.
}
```

## Reminder engine (`api/_tasks.ts` and `api/_push.ts`, run by `api/daily.ts` and `api/expand.ts`)

1. Load plants with their species `care_calendar`, confirmed or not; calendar items that share a rule key are folded into one (titles joined, instructions appended, the larger litres kept). The digest's early notice does not see the fold: it reads `lead_days` from the stored calendar and takes the first item with the task's key.
2. For each plant and rule: age in whole months from `planted_on` (treat null as mature); under 24 months is establishment, 24 or more mature; skip when the rule's `age` does not match (`any` always matches).
3. For the next 90 days: split `months` into runs of consecutive months on the 12-month circle (April and October are two runs, November to March one). Window rules (every type except water, and a water rule whose `every_days` is not a whole number of 1 or more) create one task per yearly window of a run that overlaps today to today + 90 (a run covering most of the year can give two: an all-year rule on 1 November has one due 1 January of this year and one due 1 January of next year): `due_on` = the run's first day, even when it has passed (so an open window shows at once as "Open since …"), `window_end` = the run's last day. Water rules with `every_days` create a task every `every_days` days from the run's first day, written only from today to today + 90; the title ends with the litres, "(40 L)", which Today and the digest read back.
4. Insert only when no task exists with the same `plant_id`, `rule_key` (`${type}:${months.join("-")}:${age}`, with `:${every_days}` appended for a periodic watering, the months sorted) and `due_on`, and do not re-seed a window already open that the grower acted on under a key that no longer applies. Then tidy the pending rows: delete those whose rule no longer applies (gone, changed, or the plant changed stage), and close as skipped, with a note from `en.ts`, windows past their end ("Window ended"), older due waterings of a rule ("Superseded by the next watering") and a rule's newest pending watering once its interval has passed with none newer ("Missed watering"; usually the season's last, but also mid-season when the next one was done early or snoozed). A snooze's copy is written under the rule's own key, so the expansion treats it as one of its own rows. The rows the app writes under keys of its own are never deleted or closed (`isAppWrittenRule`): a diagnosis's follow-up (`diagnosis:<photo id>`) and treatments (`diagnosis:<photo id>:treated`), and the manual log and one-off reminders (`manual:<uuid>`).
5. Digest: pending tasks with `due_on <= today`, grouped by site, one push per site per subscription (Farm, then Backyard; a site with nothing sends nothing), after the weather push: title "Farm: 6 tasks", body the first three lines in digest order (early notices, late, due today, open windows), each `title · tag`; a zone's batch of a site (plants with no zone count as one zone), for two plant records or more, shares one line at the place of the most pressing of its tasks (`src/lib/batches.ts`, which Today uses for its batch cards): the periodic waterings the calendar wrote that fall due together, `Water 9 plants (20 L each) · zone` (Phase 11), and the windows the calendar wrote of one kind, title and window, `Scout for olive fly · 10 plants · zone` (Phase 12; an early notice's batch takes the "From 1 Nov: " in front). No zone part when the plants have none; a group of 12 in one record stays a single line; the rows the app wrote never batch; the title and "+N more" still count tasks. A window task's early notice goes out on the one day exactly `lead_days` before its `due_on`, as "From 1 Nov: …"; waterings get none. A push lives 12 hours at the push service; a 404 or 410 deletes the subscription, and a 403 is logged as a key mismatch and kept.
6. Weather (Phase 8; the spec had it out of scope, Mohamed asked for it on 2026-10-26): the run first fetches Open-Meteo into `weather_days` (a failure is reported and the rest runs, but that morning has no rain skip and no weather push), and after the expansion closes the periodic waterings (`window_end` null, a manual water reminder included) due today or overdue as skipped when the last two days' rain, or today's rain forecast at 70 % or more, reaches the `weather` setting's threshold (on at 10 mm by default; 5, 10, 15 or 20 in Settings). A read of the setting that fails for another reason than a missing row or table skips nothing. Alerts (heat, sirocco, frost, gale, heavy rain) for today and tomorrow, and the skip, go out as one more push, sent first; Today's card shows the alerts of today and the next two days. The rules live in `src/lib/weather.ts`, shared with Today's card.

The app runs the expansion itself through `/api/expand`: at Today's first opening in an app session and on Refresh (all plants), after Save plant and after Edit record (that plant), and after a care rule is saved or deleted (all plants); not after a regeneration, whose calendar waits for the next run. These runs never apply the rain skip or send pushes; like the 06:00 run, they close ended windows and stale waterings as skipped. Today also reads its list again as soon as a push reaches an open app, once per burst of 10 s (`public/push-sw.js` posts `plantcare:push` to the windows), so a list read before the morning run does not outlive its rain skip.

## Working agreements

- `npm run typecheck`, `npm run lint`, `npm test` and `npm run build` pass before every commit; one commit per feature with a plain message. A change to the task expansion, the digest or the app's task writes comes with its test.
- A change the grower can see (a screen, a label, a rule, a cost) updates `docs/USER-GUIDE.md` in the same commit, and a release updates the Settings phase card. The `PHASE*.md` files are the record of each milestone and stay as written; the guide and `docs/DECISIONS.md` are the current account.
- No plant facts hard-coded in the app or seed data; facts come from Claude calls and the user's review. Test fixtures may use an olive profile saved from a real call.
- Keep the UI plain and fast: large tap targets, no component library unless it saves real time, dark mode by `prefers-color-scheme`.
- When something in the spec cannot be done as written, note it in `docs/DECISIONS.md` with the alternative taken, and continue.
