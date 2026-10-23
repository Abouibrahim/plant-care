# Decisions log

Deviations from `docs/SPEC.md` or `CLAUDE.md`, with the alternative taken. Newest first.

## 2026-10-23 — Phase 1 build

- **Thinking effort on Claude calls.** `claude-sonnet-5-5` thinks adaptively by default and bills thinking as output tokens. `api/_claude.ts` sets `output_config.effort: "medium"` on every call so the identify call stays inside its 2,048-token budget most of the time and the Phase 1 usage check (under $0.20 for three plants) holds. Raise it per call if identification quality disappoints.
- **Refusal fallbacks not enabled.** The Anthropic SDK guidance suggests the server-side `fallbacks` parameter on Sonnet 5.5. CLAUDE.md says to surface a refusal to the user instead, and a fallback would run a model other than the one decided, so the parameter is left out. The identify and profile routes return `{ refusal, ...usage }` with HTTP 200 and the UI shows the text.
- **Prompt files on Vercel.** `api/_claude.ts` reads `prompts/*.md` and `*.schema.json` at runtime through `import.meta.url`, with `process.cwd()/prompts` as fallback, and `vercel.json` lists `prompts/**` in `functions.includeFiles` so the files ship with the functions.
- **`/api/daily` is a stub in Phase 1.** The cron entry in `vercel.json` needs a target, so the route exists and only checks `CRON_SECRET`; task expansion and the digest come in Phase 2.
- **SPA routing.** `vercel.json` rewrites every non-`/api/` path to `index.html` so deep links such as `/plants/<id>` open on the phone.
- **Function duration.** `maxDuration` is 120 s for the functions: the profile call can run close to a minute at 6,000 output tokens. If the Vercel plan rejects 120, lower it to 60.
- **Profile edits are stored per top-level field.** `species.user_edits` keeps whole top-level JSON blocks (`water`, `uses`, …), not individual nested keys. A regeneration keeps those blocks verbatim. Editing `care_calendar` and `pests` by hand is deferred; regenerate instead.
- **i18n entry point.** All strings stay in `src/i18n/en.ts`; `src/i18n/index.ts` only exports the active table as `t`, where Phase 5 will pick `fr`.
- **Profile call timing.** The profile request starts when a candidate is confirmed, before the record form is filled, so the wait overlaps with typing. Save is disabled until the profile is ready.
- **Toolchain pins.** TypeScript stays on 5.9 because typescript-eslint does not support TypeScript 7 yet; Vite 8 and the current React 19 are used.
- **Photos in the journal.** Journal photos (kind `journal`) can be added from the Plant screen already in Phase 1; it costs nothing and fills the journal before tasks arrive.
