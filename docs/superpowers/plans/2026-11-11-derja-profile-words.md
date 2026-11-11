# Derja Words on the Species Profile Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** The Needs, Calendar, Health and Guild tabs show the derja word beside each key term, from a per-species word list fetched on demand, an app-wide list of Claude's first words, and Mohamed's corrections.

**Architecture:** A new route, `POST /api/derja`, reads a stored profile and returns up to 40 `{ term, derja }`, kept in the settings row `derja:species:<id>`. The server also keeps `derja:words`, the first word Claude gave for each term. The pure module `src/lib/derja.ts` merges three sources (correction, app-wide word, the page's own list); one hook, `useDerja`, reads them for a screen; the profile components draw their prose through `DerjaText`, which takes its sources from a React context.

**Tech Stack:** TypeScript, React 19, Vite, vitest (node environment, no component tests), Supabase JS, `callJson` structured output.

**Spec:** `docs/superpowers/specs/2026-11-11-derja-profile-words-design.md` (binding), which extends `docs/superpowers/specs/2026-11-11-derja-words-design.md`. Read both first.

## Global Constraints

- Work on a branch `phase-17-derja-profile` cut from `main`. One commit for the feature, at the end of Task 7. Do not merge or push; Mohamed approves that.
- `npm run typecheck`, `npm run lint`, `npm test` and `npm run build` pass before the commit.
- No SQL step. Everything new is in `settings` rows.
- `prompts/system-context.md`, `prompts/profile.md`, `prompts/profile.schema.json` and `pestLine` in `api/_context.ts` are not changed.
- The fetch never writes the `species` table.
- No Arabic in a task title, note, notification or shared list; no words on `TaskCard`, in the editors, in Past diagnoses.
- Without a session no settings read is made by these cards.
- Strings in `src/i18n/en.ts`, mirrored in `fr.ts`. No derja word hard-coded outside tests.
- Regex over prose never uses `\b` (Phase 16 rule).
- Exact values: 40 terms per species; 600 app-wide words; 200 corrections (unchanged); 8 terms per diagnosis (unchanged); `max_tokens` 3072, effort medium; settings keys `derja`, `derja:words`, `derja:species:<species id>`; ledger route `derja`; Settings label "derja word lists" / "listes de mots derja".
- Shell note for whoever executes: write files with the editor tools, not shell heredocs; on this machine a heredoc halves backslashes and turns `\uXXXX` into characters.

## Review Focus

1. A species with an empty calendar, no pests or no companions: the tabs and their cards draw without error, and the card still offers the button. Task 1 (`tabTexts`) and Task 6.
2. Claude lists no term (`terms: []`): the list counts as fetched; the card says so and offers "Refresh words", not "Get derja words". Task 1 (`readSpeciesWords`) and Task 6.
3. The row `derja:species:<id>` or `derja:words` holds something unexpected: read as not fetched / empty, nothing throws. Task 1.
4. A diagnosis and a species call end at the same moment: both sets of terms reach `derja:words`. Task 2.
5. "Refresh words" whose reply is lost while the old list is still stored: the lookup does not take the old list for the answer. Task 4.

---

## File structure

| File | Responsibility |
|---|---|
| `src/types.ts` | `AppWord`, `SpeciesWords`, `DerjaRequest`, `DerjaResponse`; `UsageRoute` gains `derja` |
| `src/lib/derja.ts` | + keys and caps, `readWords`, `readSpeciesWords`, `withWords`, three-source `wordSources`, `narrowSources`, `cardRows` mode, `cleanTerms` cap, `stripArabic` tidy |
| `src/lib/profileTexts.ts` (create) | The prose of each tab, as lists of strings |
| `api/_derja.ts` (create) | Server helpers: corrections read that tells failure from none, `correctionsBlock`, `extendWords`, `upsertSetting` |
| `api/derja.ts` (create), `prompts/derja.md`, `prompts/derja.schema.json` (create) | The route and its call |
| `api/diagnose.ts` | Uses `_derja.ts`; extends `derja:words` after its row |
| `src/lib/db.ts` | `loadDerja`, `getSpeciesWords`, `saveSpeciesWords`, `deleteSetting`; `deleteSpeciesIfUnused` cleans up |
| `src/lib/api.ts` | `api.derja` with lost-reply recovery |
| `src/lib/useDerja.ts` (create) | The one reading of the words for a screen, and the fetch's state |
| `src/components/derja/` (create; `DerjaText.tsx` and `DerjaWords.tsx` move here from `src/screens/plant/`) | `DerjaText`, `DerjaWord`, `DerjaSources` context, `DerjaWords`, `ProfileDerjaCard` |
| `src/components/profile/*`, `src/screens/PlantScreen.tsx`, `src/screens/SpeciesScreen.tsx`, `src/screens/plant/DiagnosisCard.tsx` | Draw through `DerjaText`; hold the hook; show the cards |
| `tests/derja.test.ts`, `tests/profile-texts.test.ts`, `tests/derja-server.test.ts`, `tests/derja-route.test.ts` (create), `tests/db.test.ts`, `tests/api.test.ts`, `tests/usage.test.ts` | Tests |

---

### Task 1: The pure rules

**Files:** Modify `src/types.ts`, `src/lib/derja.ts`. Create `src/lib/profileTexts.ts`. Tests: `tests/derja.test.ts`, `tests/profile-texts.test.ts`.

**Interfaces — produces:**

```ts
// src/types.ts
/** Claude's first word for a term, app-wide: term in normal form, word never empty, ISO time. */
export interface AppWord { term: string; word: string; at: string }
/** A species' fetched word list: the settings row derja:species:<id>. */
export interface SpeciesWords { terms: DerjaTerm[]; at: string; asked_at: string }

// src/lib/derja.ts
export const WORDS_KEY = "derja:words";
export const MAX_WORDS = 600;
export const MAX_SPECIES_TERMS = 40;
export function speciesWordsKey(speciesId: string): string;            // `derja:species:${speciesId}`
export function cleanTerms(v: unknown, cap: number = MAX_TERMS): DerjaTerm[];
export function readWords(v: unknown): AppWord[];                      // cleaned, word non-empty, first entry per term (sameTerm), stored order kept
export function readSpeciesWords(v: unknown): SpeciesWords | null;     // terms cleaned at cap 40; null unless terms is an array and at, asked_at are strings
/** Adds each term that has a word, no entry yet (sameTerm) and no correction (sameTerm, cleared ones included); past 600 the oldest by `at` go. */
export function withWords(list: AppWord[], terms: DerjaTerm[], corrections: Correction[], at: string): AppWord[];
export function wordSources(terms: DerjaTerm[], corrections: Correction[], words?: AppWord[]): WordSource[];
/** The sources a page needs: the listed ones, and the unlisted ones whose term stands in one of the texts. */
export function narrowSources(texts: string[], sources: WordSource[]): WordSource[];
export function cardRows(texts: string[], sources: WordSource[], mode?: "listed" | "standing"): WordSource[];

// src/lib/profileTexts.ts
export type ProfileTab = "needs" | "calendar" | "health" | "guild";
export function tabTexts(s: SpeciesProfile): Record<ProfileTab, string[]>;
```

Rules the signatures do not say:

- `wordSources` with `words`. For a listed term: `correction` = first correction pairing by `sameTerm`; `app` = first app word pairing by `sameTerm`; `claudeWord = app?.word || term.derja`; `word = correction ? correction.word : claudeWord`; state `yours`/`none` with a correction, else `claude` when `claudeWord` is not empty, else `missing`; `key = correction?.term ?? normalTerm(term.term)`. Then each app word no listed term used, in list order: with a pairing correction `{ key: correction.term, label: app.term, word: correction.word, state yours/none, claudeWord: app.word, listed: false }`, else `{ key: app.term, label: app.term, word: app.word, state: "claude", claudeWord: app.word, listed: false }`. Then the corrections still unused, as today (`claudeWord: ""`).
- `cardRows`. `standing(s)` = its key occurs in one of the texts. Mode `"listed"` (default, the diagnosis): `s.listed || (standing(s) && (s.word !== "" || s.claudeWord !== ""))`. Mode `"standing"` (a profile tab): `standing(s) && (s.listed || s.word !== "" || s.claudeWord !== "")`.
- `tabTexts`: needs = `site_fit.note`, `water.summary`, `water.stress_signs`, `water.overwatering_signs`, `sun.note`, `salinity_tolerance.note`, `climate_note`; calendar = each rule's `title`, `instruction`; health = each pest's `name_en`, `symptoms`, `organic_treatment`, `prevention`; guild = `companions.good`, `.bad`, `.root_warnings` items, `uses.edible_parts`, `.preparation`, `.storage`, `.harvest_cues`, `toxicity.note`. Missing objects, non-arrays and empty strings give no entry. (The pest's French name is left plain: ruling of this plan on the spec's open point.)
- `stripArabic`: first remove the direction marks (U+200E, U+200F, U+202A–U+202E, U+2066–U+2069), then the Arabic runs, then separators left just inside parentheses (after `(` or before `)`: any of `, ، ; · / | – — -` with spaces), then empty parentheses, then a trailing run of spaces and those separators, then collapse spaces.

- [ ] **Step 1: Write the failing tests.** In `tests/derja.test.ts` add:

```ts
describe("stripArabic, tidy (Phase 17)", () => {
  it("leaves no separator, mark or empty parenthesis behind", () => {
    expect(stripArabic("Sooty mould (الفحمة, el-fahma)")).toBe("Sooty mould (el-fahma)");
    expect(stripArabic("Black scale (النمرة · Saissetia oleae)")).toBe("Black scale (Saissetia oleae)");
    expect(stripArabic("Scale (النمرة / الفحمة)")).toBe("Scale");
    expect(stripArabic("Sooty mould - الفحمة")).toBe("Sooty mould");
    expect(stripArabic("Sooty mould (‏الفحمة)")).toBe("Sooty mould");
    expect(stripArabic("Black scale (Saissetia oleae), on twigs")).toBe("Black scale (Saissetia oleae), on twigs");
  });
});

describe("the app-wide words (Phase 17)", () => {
  const at = "2026-11-12T08:00:00Z";
  const old = { term: "pruning", word: "زبيرة", at: "2026-11-01T00:00:00Z" };
  it("adds a new term's first word and keeps an existing entry", () => {
    const next = withWords([old], [{ term: "Pruning", derja: "تقليم" }, { term: "Mulch", derja: "تبن" }, { term: "copper", derja: "" }], [], at);
    expect(next).toEqual([old, { term: "mulch", word: "تبن", at }]);
  });
  it("pairs across the plural and skips a term the grower corrected or cleared", () => {
    const corrections = [{ term: "aphid", word: "ڨمل", at }, { term: "scale", word: "", at }];
    expect(withWords([], [{ term: "Aphids", derja: "ڨمل" }, { term: "scale", derja: "نمرة" }, { term: "prunings", derja: "زبيرة" }], corrections, at)).toEqual([{ term: "prunings", word: "زبيرة", at }]);
    expect(withWords([old], [{ term: "prunings", derja: "تقليم" }], [], at)).toEqual([old]);
  });
  it("drops the oldest past 600", () => {
    const list = Array.from({ length: 600 }, (_, i) => ({ term: `t${i}x`, word: "كلمة", at: `2026-01-01T00:${String(Math.floor(i / 60)).padStart(2, "0")}:${String(i % 60).padStart(2, "0")}Z` }));
    const next = withWords(list, [{ term: "new", derja: "جديد" }], [], at);
    expect(next).toHaveLength(600);
    expect(next.some((w) => w.term === "t0x")).toBe(false);
    expect(next.some((w) => w.term === "new")).toBe(true);
  });
  it("reads a stored list, and nothing from an unexpected value", () => {
    expect(readWords([old, { term: "Pruning", word: "x", at }, { term: "oil", word: "", at }, 3])).toEqual([old]);
    expect(readWords({ a: 1 })).toEqual([]);
    expect(readWords(null)).toEqual([]);
  });
});

describe("a species' word list (Phase 17)", () => {
  it("reads the row, cleans the terms and caps them at 40", () => {
    const terms = Array.from({ length: 45 }, (_, i) => ({ term: `term${i}x`, derja: "كلمة" }));
    const row = readSpeciesWords({ terms, at: "a", asked_at: "b" });
    expect(row?.terms).toHaveLength(40);
    expect(readSpeciesWords({ terms: [], at: "a", asked_at: "b" })).toEqual({ terms: [], at: "a", asked_at: "b" });
  });
  it("is null for anything else", () => {
    expect(readSpeciesWords(null)).toBeNull();
    expect(readSpeciesWords({ terms: "x", at: "a", asked_at: "b" })).toBeNull();
    expect(readSpeciesWords({ terms: [] })).toBeNull();
  });
  it("keeps the diagnosis cap at 8 by default", () => {
    expect(cleanTerms(Array.from({ length: 12 }, (_, i) => ({ term: `t${i}x`, derja: "" })))).toHaveLength(8);
  });
});

describe("three sources of words (Phase 17)", () => {
  const at = "2026-11-12T08:00:00Z";
  const app = [{ term: "pruning", word: "زبيرة", at }, { term: "mulch", word: "تبن", at }, { term: "neem oil", word: "زيت النيم", at }];
  it("puts the correction first, then the app-wide word, then the call's own", () => {
    const s = wordSources(
      [{ term: "Pruning", derja: "تقليم" }, { term: "Mulch", derja: "" }, { term: "copper", derja: "نحاس" }, { term: "sulphur", derja: "" }],
      [{ term: "mulch", word: "قش", at }],
      app,
    );
    expect(s.map((x) => [x.label, x.word, x.state, x.claudeWord, x.listed])).toEqual([
      ["Pruning", "زبيرة", "claude", "زبيرة", true],
      ["Mulch", "قش", "yours", "تبن", true],
      ["copper", "نحاس", "claude", "نحاس", true],
      ["sulphur", "", "missing", "", true],
      ["neem oil", "زيت النيم", "claude", "زيت النيم", false],
    ]);
  });
  it("keeps a cleared unlisted term that has a Claude word, keyed by the correction", () => {
    const s = wordSources([], [{ term: "neem oil", word: "", at }], app);
    const neem = s.find((x) => x.label === "neem oil")!;
    expect([neem.key, neem.word, neem.state, neem.claudeWord, neem.listed]).toEqual(["neem oil", "", "none", "زيت النيم", false]);
    expect(s.filter((x) => x.label === "neem oil")).toHaveLength(1);
  });
  it("still works with two arguments", () => {
    expect(wordSources([{ term: "copper", derja: "نحاس" }], [])).toHaveLength(1);
  });
});

describe("the rows of a card (Phase 17)", () => {
  const at = "2026-11-12T08:00:00Z";
  const sources = wordSources(
    [{ term: "copper", derja: "نحاس" }, { term: "sulphur", derja: "" }, { term: "kaolin", derja: "كاولان" }],
    [{ term: "neem oil", word: "", at }, { term: "ash", word: "", at }],
    [{ term: "neem oil", word: "زيت النيم", at }, { term: "pruning", word: "زبيرة", at }],
  );
  const texts = ["Spray copper or sulphur.", "Neem oil and ash at dusk."];
  it("on a profile tab, lists only what stands in its texts", () => {
    expect(cardRows(texts, sources, "standing").map((r) => r.label)).toEqual(["copper", "sulphur", "neem oil"]);
  });
  it("on a diagnosis, lists every term of its own list, then what stands", () => {
    expect(cardRows(texts, sources).map((r) => r.label)).toEqual(["copper", "sulphur", "kaolin", "neem oil"]);
  });
  it("narrows the sources of a page to the listed ones and those that stand", () => {
    expect(narrowSources(texts, sources).map((r) => r.label)).toEqual(["copper", "sulphur", "kaolin", "neem oil", "ash"]);
  });
});
```

Add the new names to the file's import. Create `tests/profile-texts.test.ts`: build one `SpeciesProfile` by hand (cast a partial through `unknown`) with one rule, one pest, companions and uses, and assert each tab's list in the order given under "Rules"; a second case with `care_calendar: []`, `pests: []`, empty companion lists and empty strings asserts `{ needs: [], calendar: [], health: [], guild: [] }` (Review Focus 1); a third asserts the pest's `name_fr` is in no list.

- [ ] **Step 2: Run** `npx vitest run tests/derja.test.ts tests/profile-texts.test.ts` — expected: FAIL (missing exports, and the `stripArabic` cases).
- [ ] **Step 3: Implement** as specified. Phase 16's test "lists every listed source and only the unlisted ones that stand in a text" must still pass unchanged.
- [ ] **Step 4: Run** the two files, then `npm test`, `npm run typecheck`, `npm run lint` — expected: PASS.

---

### Task 2: Server helpers, and the diagnosis feeds the app-wide list

**Files:** Create `api/_derja.ts`. Modify `api/diagnose.ts`. Tests: `tests/derja-server.test.ts` (create); `tests/diagnose.test.ts` keeps passing.

**Interfaces — consumes:** `readCorrections`, `readWords`, `withWords`, `cleanTerms`, `DERJA_KEY`, `WORDS_KEY` (Task 1). **Produces, in `api/_derja.ts`:**

```ts
export const WORDS_TIMEOUT_MS = 8_000;
/** The grower's corrections, newest first; null when the row could not be read (a missing row is []). */
export async function loadCorrectionsOrNull(db: SupabaseClient): Promise<Correction[] | null>;
/** The glossary block; null without corrections. subject names the call: "diagnosis" (default) or "profile". */
export function correctionsBlock(corrections: Correction[], subject?: "diagnosis" | "profile"): string | null;
/** Adds Claude's first words to derja:words. False, and nothing written, when corrections is null or the write fails. Never throws. */
export async function extendWords(db: SupabaseClient, terms: DerjaTerm[], corrections: Correction[] | null, now?: Date): Promise<boolean>;
/** A bounded upsert of one settings row (ROW_TIMEOUT_MS). False on failure, logged. Never throws. */
export async function upsertSetting(db: SupabaseClient, key: string, value: unknown): Promise<boolean>;
```

`api/diagnose.ts` keeps exporting `correctionsBlock` (re-export) and `loadCorrections` (now `(await loadCorrectionsOrNull(db)) ?? []`), so `tests/diagnose.test.ts` stays as it is.

- `correctionsBlock` heading: `` `The grower's own derja words, a glossary for the terms that belong in this ${subject}; use these exactly:` ``.
- `extendWords` follows `recordUsage` in `api/_usage.ts` exactly (select `value, updated_at`; insert when missing, `23505` → read again; else update guarded by `.eq("updated_at", row.updated_at).select("key")`), with two tries and one `AbortSignal.timeout(WORDS_TIMEOUT_MS)` shared by every request of the call. When `withWords` returns a list equal in length to the one read, nothing is written and the result is `true`.
- Handler of `api/diagnose.ts`: read with `loadCorrectionsOrNull`; pass `corrections ?? []` to `describeContext`; after `storeRow` and before `await result.recorded`, `await extendWords(db, cleanTerms(result.data.terms), corrections)`.

- [ ] **Step 1: Write the failing tests** in `tests/derja-server.test.ts`, with `makeState` / `makeClient` from `./mockdb`:
  - `extendWords` on an empty table creates `derja:words` with the new terms; a second call with one known and one new term keeps the first word and adds the new.
  - Two calls at once, `await Promise.all([extendWords(db, [a], [], now), extendWords(db, [b], [], now)])`, leave one row holding both terms (Review Focus 4).
  - `corrections: null` writes nothing and resolves `false`; a term matching a correction is not added.
  - A client that throws on every query (`makeClient(state, { onQuery: () => { throw new Error("boom"); } })`) resolves `false`.
  - `upsertSetting` inserts, then replaces the value of the same key (one row); resolves `false` on the throwing client.
  - `loadCorrectionsOrNull`: `[]` without a row, the list with one, `null` on the throwing client.
  - `correctionsBlock([c], "profile")` first line ends "that belong in this profile; use these exactly:"; with one argument it is the Phase 16 line.
- [ ] **Step 2: Run** `npx vitest run tests/derja-server.test.ts` — FAIL, module not found.
- [ ] **Step 3: Implement.**
- [ ] **Step 4: Run** `npx vitest run tests/derja-server.test.ts tests/diagnose.test.ts tests/rows.test.ts` and `npm run typecheck` — PASS.

---

### Task 3: The route, its prompt, and the ledger kind

**Files:** Create `api/derja.ts`, `prompts/derja.md`, `prompts/derja.schema.json`. Modify `src/types.ts` (`UsageRoute`, `USAGE_ROUTES`, `DerjaRequest`, `DerjaResponse`), `src/i18n/en.ts` and `fr.ts` (`settings.usage.routes.derja`). Tests: `tests/derja-route.test.ts` (create), `tests/usage.test.ts`.

**Interfaces — consumes:** Task 1 and Task 2 exports; `speciesBlock`, `calendarBlock`, `guildUsesBlock`, `monthList` from `api/_context.ts`; `UUID`, `isInstant` from `api/_rows.ts`. **Produces:**

```ts
// src/types.ts
export type UsageRoute = "identify" | "profile" | "diagnose" | "ask" | "check" | "derja";   // and "derja" last in USAGE_ROUTES
export interface DerjaRequest { species_id: string; asked_at: string }
export type DerjaResponse = (SpeciesWords & Usage) | ({ refusal: string } & Usage);

// api/derja.ts
export function parseDerjaRequest(body: unknown): DerjaRequest | string;   // "species_id must be a UUID", "asked_at must be an ISO time"
/** The pest lines of the profile with each pest's prevention, which the shared pestLine leaves out. */
export function pestsWithPrevention(s: Species): string;
/** The user message: the profile's text, the grower's glossary when there is one, the instruction. */
export function describeProfile(s: Species, corrections: Correction[]): string;
/** The settings row the route writes: { key: speciesWordsKey(id), value: { terms (cleaned, cap 40), at, asked_at } }. */
export function speciesWordsRow(input: DerjaRequest, terms: unknown, at: string): { key: string; value: SpeciesWords };
export default async function handler(req, res): Promise<void>;
```

- `pestsWithPrevention`: heading `Pests and diseases of this species in Cap Bon, from its profile:` then one line per pest, `` `- ${name_en}${fr}, ${monthList(months)}: ${symptoms} Organic treatment: ${organic_treatment} Prevention: ${prevention}` `` (`fr` as `pestLine` writes it); without pests, `The profile lists no pests or diseases for this species.`
- `describeProfile` joins with blank lines: `speciesBlock`, `calendarBlock`, `pestsWithPrevention`, `guildUsesBlock`, `correctionsBlock(corrections, "profile")` when not null, then `List the key terms of this profile with the word said for each in Tunisian.`
- Handler, in the order of `api/ask.ts`: `verifyUser` (401) → method (405) → `parseDerjaRequest` (400) → read the species row by id (`Species not found`, 404) → `loadCorrectionsOrNull` → `keepAlive` → `callJson<{ terms: DerjaTerm[] }>` with `readPrompt("derja.md")`, `readSchema("derja.schema.json")`, `content: [{ type: "text", text }]`, `maxTokens: 3072`, `effort: "medium"`, `onUsage: (usage, outcome) => recordUsage(db, "derja", usage, outcome)` → refusal: `reply(res, 200, { refusal, ...usage })` → read the species id again; gone: `sendError(res, 404, "Species not found")` with nothing written → `upsertSetting(db, row.key, row.value)` → `extendWords(db, row.value.terms, corrections)` → `await result.recorded` → `reply(res, 200, { ...row.value, ...result.usage })`.
- `prompts/derja.schema.json`: `{ "type": "object", "properties": { "terms": { "type": "array", "items": <the same item object as in diagnose.schema.json> } }, "required": ["terms"], "additionalProperties": false }`.
- `prompts/derja.md` must say, in the builder's words: the task (the grower will have to say these terms aloud to a worker or a supplier); up to 40 terms in this priority: pests and diseases, products and inputs, operations (pruning, mulching, grafting, thinning), tools, companion plants last; no ratings, adjectives or general vocabulary; `term` copied exactly as written in the profile text, in the text's language, with no Arabic letters and no transliteration, whatever the site context says about names; `derja` the word people in Cap Bon really say, Arabic letters only, short, the French name as pronounced in Arabic letters when that is what people say, an empty string rather than a guess or a textbook term; the grower's glossary is not a list to include: only when one of its terms is listed, use the grower's word exactly, and "no local word" means an empty derja.
- Strings: `routes.derja` = `"derja word lists"` (en), `"listes de mots derja"` (fr).

- [ ] **Step 1: Write the failing tests** in `tests/derja-route.test.ts`:
  - `parseDerjaRequest`: a good body; a bad UUID; a bad time; a non-object.
  - The schema: `required` is `["terms"]` and `properties.terms.items` equals the item object of `prompts/diagnose.schema.json` (read both files).
  - The prompt: matches `/40/`, `/no Arabic letters/i`, `/empty string/i`, and carries no Arabic letter.
  - `pestsWithPrevention` on a species with one pest contains ` Prevention: ` followed by the pest's prevention text; without pests it is the "lists no pests" sentence.
  - `describeProfile`: contains the calendar block's heading, ends with the instruction, has the "this profile" glossary heading with one correction and no glossary line with none.
  - `speciesWordsRow`: key `derja:species:<id>`; 45 terms in → 40 stored; a mixed-script word stored as `""`; `asked_at` and `at` carried.
  In `tests/usage.test.ts` add: `recordUsage(db, "derja", call())` then `parseLedger` of the stored row has `by_route.derja.calls === 1`.
- [ ] **Step 2: Run** `npx vitest run tests/derja-route.test.ts tests/usage.test.ts` — FAIL.
- [ ] **Step 3: Implement.** No `vercel.json` change (`api/*.ts` covers the route).
- [ ] **Step 4: Run** the two files, `npm run typecheck` (a missing `routes.derja` in `fr.ts` fails here), `npm run lint` — PASS.

---

### Task 4: The app's data layer

**Files:** Modify `src/lib/db.ts`, `src/lib/api.ts`. Tests: `tests/db.test.ts`, `tests/api.test.ts`.

**Interfaces — produces:**

```ts
// src/lib/db.ts
export interface DerjaData { corrections: Correction[]; words: AppWord[]; species: SpeciesWords | null }
/** One read of the derja rows a screen needs: the corrections, the app-wide words and, with a species, its list. */
export async function loadDerja(speciesId: string | null, signal?: AbortSignal): Promise<DerjaData>;
export async function getSpeciesWords(speciesId: string, signal?: AbortSignal): Promise<SpeciesWords | null>;
export async function saveSpeciesWords(speciesId: string, words: SpeciesWords, signal?: AbortSignal): Promise<void>;
export async function deleteSetting(key: string): Promise<void>;

// src/lib/api.ts, a member of `api`
derja: (req: DerjaRequest, opts?: RecoverOptions) => Promise<DerjaResponse>;
```

- `loadDerja`: `supabase.from("settings").select("key, value").in("key", keys)` with the signal; errors through `settingsError`; each value through `readCorrections`, `readWords`, `readSpeciesWords`.
- `deleteSpeciesIfUnused`: after the species row is deleted, `await deleteSetting(speciesWordsKey(id)).catch(() => undefined)`, then `return true` as before.
- `api.derja`: `withRecovery(() => callApi<DerjaResponse>("derja", req), () => getSpeciesWords(req.species_id, lookupBound()).then((row) => (row && row.asked_at === req.asked_at ? { ...row, model: null, input_tokens: 0, output_tokens: 0, thinking_tokens: 0, cache_read_input_tokens: 0, cache_creation_input_tokens: 0 } : null)), opts)`.

- [ ] **Step 1: Write the failing tests.**
  `tests/db.test.ts`, a new `describe("the derja rows of a screen (Phase 17)")`:
  - `loadDerja("s1")` with the three rows seeded returns the three parts; with none, `{ corrections: [], words: [], species: null }`; `loadDerja(null)` never asks for a species key (count the keys through the returned data: a seeded `derja:species:s1` row is not read).
  - an unexpected value in each row reads as empty / null (Review Focus 3).
  - `saveSpeciesWords` then `getSpeciesWords` round-trips; a second save replaces (one row).
  - `deleteSpeciesIfUnused` on a species with no plant removes its `derja:species:<id>` row and resolves `true`; with a plant it removes nothing and resolves `false`.
  `tests/api.test.ts`, beside "a lost reply looked for in the tables (Phase 14)", following that block's own harness:
  - a lost reply (status 0) with the row present under the same `asked_at` resolves to that list with zero tokens;
  - with a row whose `asked_at` differs (an older fetch), the lookup keeps waiting and, in the block's fake-timer style, ends in `LostReplyError` at the deadline (Review Focus 5).
- [ ] **Step 2: Run** `npx vitest run tests/db.test.ts tests/api.test.ts` — FAIL.
- [ ] **Step 3: Implement.**
- [ ] **Step 4: Run** the two files and `npm run typecheck` — PASS.

---

### Task 5: One reading of the words, shared components, the diagnosis card on it

**Files:** Create `src/lib/useDerja.ts`, `src/components/derja/index.ts`, `src/components/derja/ProfileDerjaCard.tsx`. Move `src/screens/plant/DerjaText.tsx` and `DerjaWords.tsx` to `src/components/derja/` (use `git mv`). Modify `src/screens/plant/DiagnosisCard.tsx`, `src/i18n/en.ts`, `fr.ts`, `src/styles.css`.

No component test harness exists (vitest runs in node, no jsdom), so this task's logic that can be pure was placed in Tasks 1 and 4; what remains is verified in the browser (Task 6, Step 4) and by the typecheck.

**Interfaces — produces:**

```ts
// src/lib/useDerja.ts
export interface DerjaView {
  /** "off": no session, or not wanted; nothing was read. "failed": the read failed and will be retried. */
  status: "off" | "loading" | "ready" | "failed";
  corrections: Correction[];
  words: AppWord[];
  /** The species' fetched list; null when there is none, or while status is not "ready". */
  species: SpeciesWords | null;
  fetching: boolean;
  /** The last fetch's failure or refusal, in the app's words; null otherwise. */
  fetchError: string | null;
  /** A card saved or removed a correction: the list as stored. */
  saved: (list: Correction[]) => void;
  /** Runs the species call; a no-op without a species, while fetching, or unless status is "ready". */
  fetchWords: () => Promise<void>;
}
export function useDerja(opts: { speciesId?: string | null; enabled?: boolean }): DerjaView;

// src/components/derja/
export const DerjaSources: React.Context<WordSource[]>;                 // default []
export function DerjaText({ text, sources }: { text: string; sources?: WordSource[] }): JSX.Element;   // sources default to the context; pieces memoised on (text, sources)
export function DerjaWord({ word }: { word: string }): JSX.Element;
export function DerjaWords({ rows, onSaved, note, footer }: { rows: WordSource[]; onSaved: (list: Correction[]) => void; note?: string | null; footer?: React.ReactNode }): JSX.Element | null;
export function ProfileDerjaCard({ rows, derja, disabled }: { rows: WordSource[]; derja: DerjaView; disabled?: boolean }): JSX.Element | null;
```

Behaviour:

- `useDerja`: reads with `loadDerja(speciesId ?? null, AbortSignal.timeout(DERJA_WRITE_MS))` when `enabled !== false` and `useAuth().session` is set; otherwise `status: "off"` and no read. On failure `status: "failed"`, and it reads again on the window's `online` event and when `document.visibilityState` becomes `"visible"` (the listeners exist only while failed). A read that resolves after `saved()` was called keeps the saved corrections and takes the rest. A new `speciesId` reads again. `fetchWords`: `api.derja({ species_id, asked_at: new Date().toISOString() })`; a refusal sets `fetchError` to the refusal text; an error sets it to `` `${t.diagnose.derjaFetchFailed}: ${describeError(err)}` ``; an answer sets `species` and then `saveSpeciesWords(...)` best effort (its failure is ignored); then `loadDerja` once more so the new app-wide words show.
- `DerjaWords`: returns `null` only when there are no rows, no `note` and no `footer`. The title and list as today; `note` as one `p.small.muted` under the title; `footer` after the list. "Use Claude's word" shows when `(row.state === "yours" || row.state === "none") && (row.listed || row.claudeWord !== "")`.
- `ProfileDerjaCard`: `null` when `derja.status === "off"`. Otherwise `DerjaWords` with `onSaved={derja.saved}` and:
  - `status "loading"`: note `t.common.loading`, no footer;
  - `status "failed"`: note `derjaUnread`, no footer (no button: a failed read must not look like "not fetched");
  - `status "ready"`, `species === null`: note `derjaNotFetched` when there are no rows; footer button `derjaGet`;
  - `status "ready"`, a list: note `derjaNoneHere` when there are no rows; footer button `derjaRefresh` and muted `derjaFetchedOn(date)` (the date by `toLocaleDateString(undefined, { day: "numeric", month: "short" })`);
  - the button is `block`, disabled when `disabled || derja.fetching`, and shows `<Spinner label={derjaFetching} />` while fetching; `fetchError` shows in a `Banner kind="error"` above it.
- `DiagnosisCard`: drop its own `corrections` state, `savedHere` ref and effect; `const derja = useDerja({ enabled: hasTerms })`; `sources = useMemo(() => hasTerms ? narrowSources(texts, wordSources(cleanTerms(diagnosis.terms), derja.corrections, derja.words)) : [], …)` with `texts` the list it already builds for the card; keep passing `sources` to its `DerjaText`s; the card is `<DerjaWords rows={cardRows(texts, sources)} onSaved={derja.saved} note={derja.status === "failed" ? s.derjaUnread : null} />`. A diagnosis without `terms` reads nothing and shows no card, as now.

Strings to add under `t.diagnose` (exact English; French by the builder):

- `derjaGet: "Get derja words"`, `derjaRefresh: "Refresh words"`, `derjaFetching: "Asking Claude…"`
- `derjaFetchedOn: (date: string) => \`Fetched ${date}\``
- `derjaNotFetched: "No derja words for this species yet."`
- `derjaNoneHere: "No key term on this page."`
- `derjaUnread: "Your own words could not be read; showing Claude's"`
- `derjaFetchFailed: "The words could not be fetched"`

- [ ] **Step 1:** Move the two files, create the context and the barrel, fix the imports (`npm run typecheck` green before going on).
- [ ] **Step 2:** Write `useDerja`, the `DerjaWords` changes and `ProfileDerjaCard`; add the strings.
- [ ] **Step 3:** Put `DiagnosisCard` on the hook.
- [ ] **Step 4: Run** `npm run typecheck`, `npm run lint`, `npm test` — PASS (no test changes expected here; a failure is a regression).

---

### Task 6: The four tabs and the species page

**Files:** Modify `src/components/profile/NeedsSection.tsx`, `CalendarSection.tsx` (`RuleCard`), `HealthSection.tsx` (`PestCard`), `GuildUsesSection.tsx`, `ToxicityBadges.tsx`, `src/screens/PlantScreen.tsx`, `src/screens/SpeciesScreen.tsx`.

**Interfaces — consumes:** `DerjaText`, `DerjaSources`, `ProfileDerjaCard`, `useDerja` (Task 5); `tabTexts`, `wordSources`, `narrowSources`, `cardRows` (Task 1).

- [ ] **Step 1: The profile components.** Wrap exactly the prose `tabTexts` lists in `<DerjaText text={…} />` (no `sources` prop: the context supplies them): the seven Needs texts; `rule.title` and `rule.instruction`; `pest.name_en`, `symptoms`, `organic_treatment`, `prevention`; each companion item, the four uses (`uses.x ? <DerjaText text={uses.x} /> : t.common.none`), `toxicity.note`. Pills, ratings, month grids and `pest.name_fr` stay as they are. Without a provider the context is `[]` and `DerjaText` returns the plain text, so the editors' previews and any other use are unchanged.
- [ ] **Step 2: `PlantScreen`.** `const derja = useDerja({ speciesId: species.id })`; `const texts = useMemo(() => tabTexts(species), [species])`; `const sources = useMemo(() => narrowSources([...texts.needs, ...texts.calendar, ...texts.health, ...texts.guild], wordSources(derja.species?.terms ?? [], derja.corrections, derja.words)), [texts, derja.species, derja.corrections, derja.words])`. Wrap the four profile sections (not the task cards, not `PastDiagnoses`, not the journal) in `<DerjaSources.Provider value={sources}>`, and after each section add `<ProfileDerjaCard rows={cardRows(texts[tab], sources, "standing")} derja={derja} disabled={busy} />`: after `NeedsSection`; after `CalendarSection`; between `HealthSection` and `PastDiagnoses`; after `GuildUsesSection`. The hooks go above the screen's early returns; if `species` is not available there, compute with `loaded`'s species or an empty profile guard.
- [ ] **Step 3: `SpeciesScreen`.** The same hook and memo with `speciesId: id`; the provider around the Needs `SectionCard`, the two `ListCard`s and the Guild `SectionCard` (an open editor draws its own inputs, which do not use `DerjaText`); one `<ProfileDerjaCard rows={cardRows(all, sources, "standing")} derja={derja} disabled={busy !== null || editing !== null} />` between the Guild `SectionCard` and the Regenerate card. While `derja.fetching`: `cardProps.disabled` and both `ListCard`s' `disabled` are true, and the Regenerate and Delete buttons are disabled; `regenerate()` and `remove()` return at once.
- [ ] **Step 4: Verify in the browser** on the mock harness (`.claude/launch.json` → `ask-mock`; its files live in `node_modules/.cache/ask-mock/`, outside the repository). Copy `supabase-p20.ts` to `supabase-p21.ts`, point `vite.config.ts` at it, seed `settings` with a `derja:words` row and a `derja:species:<id>` row for one olive only, and add a `/api/derja` middleware that waits 1.5 s and answers a list for the species asked (and `{ refusal }` when `localStorage["mock.derjaRefuse"]` is set). At 375 px check, reading the page text and one screenshot per screen:
  - a fetched species: words in the prose of all four tabs, one card per tab with only that tab's terms, "Refresh words" with its date; the task cards on the Calendar tab and the Past diagnoses list are plain;
  - a species never fetched: known terms carry their word; the card offers "Get derja words"; the fetch shows the spinner, then the words, and the usage is untouched in the mock;
  - a species with no rules, pests or companions: no error, the cards show the sentence and the button (Review Focus 1); a fetch answering `terms: []` shows `derjaNoneHere` and "Refresh words" (Review Focus 2);
  - correct a word on one tab: it changes on the other tabs, on the species page and on the diagnosis card; clear an app-wide term: its line stays with "no word" and "Use Claude's word" brings it back;
  - `mock.offline`: the cards show the "could not be read" line with no button; back online they recover without a reload;
  - the species page: one card at the bottom; while the fetch runs Regenerate, Delete and the edit buttons are disabled, and with an editor open the fetch button is disabled;
  - a refusal shows its text in the card; dark mode (`resize_window` colorScheme) reads well.
- [ ] **Step 5: Run** `npm run typecheck`, `npm run lint`, `npm test` — PASS.

---

### Task 7: Version, documents, the checks, one commit

**Files:** Create `PHASE17.md` (the form of `PHASE16.md`). Modify `src/version.ts` and `package.json`/lock (`npm version 0.17.0 --no-git-tag-version`), the Settings phase card strings (`phaseTitle: "Phase 17"`, the body's last clause, both languages), `README.md` (`PHASE17.md`), `docs/USER-GUIDE.md`, `docs/DECISIONS.md`, `CLAUDE.md`.

- [ ] **Step 1: `PHASE17.md`:** the plan in prose; ★ setup: Reload after the deploy (the Arabic keyboard of Phase 16 still applies; no SQL, no key); the build list; the eight phone tests of the spec in order; the usage check (the estimate of 5 to 10 cents a species, to be replaced by the measured figure).
- [ ] **Step 2: The guide.** Chapter 1 (one sentence under Health or a new line), chapter 6 (a section "Derja words on the profile": where they show, the three sources and which wins, Get / Refresh, what an edit does, the cards, what stays plain), chapter 8 (the species page's card), chapter 10 (the usage line "derja word lists"), chapter 13 (a "Derja words" row in the cost table: each Get or Refresh, the estimate), chapter 14 (the two new messages), and the version in the header. Also correct chapter 6's Phase 16 text where the rule changed: a cleared term that has a Claude word now keeps its line everywhere.
- [ ] **Step 3: `docs/DECISIONS.md`**, a new first entry "2026-11-12 — Phase 17: derja words on the species profile (0.17.0)" (use the build's date): the 17 decisions by reference to the spec; a separate call and settings rows instead of the profile schema, and why; the app-wide list, first word wins, corrected terms never enter it; the consequence for existing diagnoses; the ledger pattern for its write; the pest's French name left plain; no hook tests for lack of a component harness; every ruling made during the build.
- [ ] **Step 4: `CLAUDE.md`:** the phases line and latest milestone; `api/_derja.ts` and `api/derja.ts` in the layout; `prompts/derja.*`; `src/lib` (`profileTexts`, `useDerja`), `src/components/derja/`; the tests list; in "Claude call conventions" the derja call (3072, medium) and one paragraph on the three sources and the three settings rows; `PHASE1.md … PHASE17.md`.
- [ ] **Step 5: Run the four checks** and read their output: `npm run typecheck`, `npm run lint`, `npm test`, `npm run build`.
- [ ] **Step 6: Commit** on the branch, with explicit paths or `git add -A` after checking `git status` shows only this feature's files (`.superpowers/` is excluded locally):

```bash
git commit -m "Phase 17: derja words on the species profile (0.17.0)"
```

Not in this plan, and to be said to Mohamed at the end: one real fetch on one species after the deploy, to measure the cost and read Claude's list (it costs one call and needs his go-ahead), after which the measured figure replaces the estimate in the guide and `docs/DECISIONS.md`.
