# Plant Care Assistant — build brief for Claude Code

Single-user plant-care app for Mohamed: photograph a plant at the backyard (walled garden at home) or at the farm (borgdanet, Menzel Bouzelfa, Cap Bon, Tunisia), identify it with the Claude API, store a species profile written for Cap Bon conditions, and get reminders for water, pruning, feeding, mulching, harvest and pest scouting.

Read `docs/SPEC.md` first. It is the agreed design; this file turns it into working rules. Start with `PHASE1.md`.

## Decisions already made (do not reopen)

- **App**: React + Vite + TypeScript, installable PWA (`vite-plugin-pwa`), phone-first for Android Chrome. Camera through `<input type="file" accept="image/*" capture="environment">`.
- **Hosting**: Vercel. Static app plus serverless functions under `api/` (Node runtime) plus one cron job, `vercel.json` → `{"crons":[{"path":"/api/daily","schedule":"0 5 * * *"}]}` (05:00 UTC = 06:00 Tunis; Tunisia has no daylight saving).
- **AI**: Claude API, model `claude-fable-5-1`, the most capable model (it replaced `claude-sonnet-5-5` on 2026-10-25 and supersedes the model named in the spec; see `docs/DECISIONS.md`), structured outputs (`output_config.format` with `type: "json_schema"`), images as base64 blocks, prompt caching on the shared system prompt, and the server-side refusal fallback (`fallbacks: "default"` through `client.beta.messages.create`). SDK `@anthropic-ai/sdk`, current version (`output_config` is GA; the one beta header is `server-side-fallback-2026-07-01`).
- **Data**: Supabase. Postgres from `supabase/schema.sql`, a private Storage bucket `photos`, Auth with one email/password user. Functions use the service-role key; the browser uses the anon key behind RLS.
- **Notifications**: Web Push with VAPID keys (`web-push` package), sent by `/api/daily`.
- **Secrets**: only in Vercel environment variables and a local `.env.local` that is git-ignored. Names in `.env.example`. Never print, log or commit a key value. Mohamed adds the keys himself.
- **Language**: English UI first, all strings in one `src/i18n/en.ts` so a French toggle can follow in Phase 5.

## Repo layout

```
api/                 Vercel functions (one file per route)
  _claude.ts         Anthropic client, buildSystem(), callJson()
  _supabase.ts       service-role client, verifyUser(req)
  identify.ts        POST → candidates
  profile.ts         POST → species profile, upsert
  diagnose.ts        POST → diagnosis
  daily.ts           cron: expand tasks, then send the digest
  push-subscribe.ts  POST → store a push subscription
prompts/             system-context.md, identify.md, profile.md, diagnose.md, *.schema.json
src/                 the PWA (screens: Today, Capture, Plant, Plants, Species, Settings)
supabase/schema.sql  tables, enums, RLS
docs/SPEC.md         the design spec
PHASE1.md            first milestone with acceptance tests
```

## API conventions

- Every `/api/*` route except `daily` requires `Authorization: Bearer <supabase access token>`; verify it with `supabase.auth.getUser(token)` on the service client and reject with 401 otherwise. The Vercel URL is public and the function holds the Claude key, so this check is not optional.
- `/api/daily` accepts only `Authorization: Bearer ${process.env.CRON_SECRET}` (Vercel sends it automatically for cron invocations).
- Request bodies carry images as `{ media_type, data }` base64; the client has already resized to 1,280 px on the long edge, JPEG quality 0.85, and read GPS from EXIF (package `exifr`) before resizing.
- Responses are the parsed JSON from Claude plus `{ model, input_tokens, output_tokens }` so usage stays visible.

## Claude call conventions

- `system` is an array: first the site context from `prompts/system-context.md` with `cache_control: { type: "ephemeral" }`, then the call-specific instructions from `prompts/<call>.md`. Check the prompt-caching page before changing this: https://platform.claude.com/docs/en/build-with-claude/prompt-caching
- Images go before text in the user message, each preceded by a short label (`Image 1:`), as the vision page recommends: https://platform.claude.com/docs/en/build-with-claude/vision
- `output_config.format = { type: "json_schema", schema }` with the matching `prompts/*.schema.json`. Every property is required and every object has `additionalProperties: false`; keep it that way, the API limits optional fields and reorders them. Reference: https://platform.claude.com/docs/en/build-with-claude/structured-outputs
- `max_tokens`: identify 2048, profile 6000, diagnose 2048. If `stop_reason` is `max_tokens`, retry once with double; if `refusal`, surface the text to the user; otherwise parse the first text block.
- The `care_calendar` array in the profile is the single source of schedules, watering included (`every_days` and `litres` on the item); the `water` object holds needs, tolerance and signs only. This supersedes the `establishment_schedule` / `mature_schedule` fields named in the spec.
- Profile regeneration merges: fields listed in `species.user_edits` are kept, everything else is replaced.

```ts
// api/_claude.ts (shape, not final code)
import Anthropic from "@anthropic-ai/sdk";
import { readFileSync } from "node:fs";

const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
const SITE_CONTEXT = readFileSync(new URL("../prompts/system-context.md", import.meta.url), "utf8");

export async function callJson(opts: {
  rules: string; schema: object; content: Anthropic.Beta.BetaContentBlockParam[]; maxTokens: number;
}) {
  const msg = await client.beta.messages.create({
    model: "claude-fable-5-1",
    max_tokens: opts.maxTokens,
    system: [
      { type: "text", text: SITE_CONTEXT, cache_control: { type: "ephemeral" } },
      { type: "text", text: opts.rules },
    ],
    messages: [{ role: "user", content: opts.content }],
    output_config: { format: { type: "json_schema", schema: opts.schema } },
    betas: ["server-side-fallback-2026-07-01"],
    fallbacks: "default",
  });
  if (msg.stop_reason !== "end_turn") throw new Error(`stop_reason ${msg.stop_reason}`);
  const text = msg.content.find((b) => b.type === "text");
  return { data: JSON.parse(text?.text ?? "{}"), usage: msg.usage };
}
```

## Reminder engine (`api/daily.ts`)

1. Load plants with their species `care_calendar`.
2. For each plant and rule: age in months from `planted_on` (treat null as mature); skip when the rule's `age` does not match (`any` always matches).
3. For the next 90 days: window rules (every type except water) create one task on the first day of the first month in `months` that falls in range, `due_on` = that day, `window_end` = last day of the last listed month; water rules create a task every `every_days` on days whose month is in `months`.
4. Insert only when no task exists with the same `plant_id`, `rule_key` (`${type}:${months.join("-")}:${age}`) and `due_on`.
5. Digest: pending tasks with `due_on <= today`, grouped by site, one push per subscription: title "Farm: 6 tasks", body the first three task titles. Send `lead_days` early for window rules by including tasks with `due_on <= today + lead_days` once.
6. Store nothing about weather; it is out of scope.

## Working agreements

- `npm run typecheck`, `npm run lint` and `npm run build` pass before every commit; one commit per feature with a plain message.
- No plant facts hard-coded in the app or seed data; facts come from Claude calls and the user's review. Test fixtures may use an olive profile saved from a real call.
- Keep the UI plain and fast: large tap targets, no component library unless it saves real time, dark mode by `prefers-color-scheme`.
- When something in the spec cannot be done as written, note it in `docs/DECISIONS.md` with the alternative taken, and continue.
