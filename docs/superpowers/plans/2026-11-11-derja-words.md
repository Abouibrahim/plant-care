# Derja Words on a Diagnosis Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A diagnosis shows the Tunisian (derja) word in Arabic letters beside each key term, and Mohamed's corrections are remembered, shown everywhere the term stands, and given to Claude.

**Architecture:** Claude returns a `terms` list with the diagnosis; it never writes Arabic into the text. A pure module, `src/lib/derja.ts`, cleans words, normalises terms, merges Claude's list with the corrections and cuts a text into pieces to draw. Corrections live in the `settings` row `derja`, written by the browser and read by `/api/diagnose`, which adds them to the user message.

**Tech Stack:** TypeScript, React, Vite, vitest, Supabase JS, the existing `callJson` structured output.

**Spec:** `docs/superpowers/specs/2026-11-11-derja-words-design.md`. Read it first; this plan argues from it.

## Global Constraints

- Phase 15 (0.15.0) must be committed before this work starts; the tree must be clean.
- One commit for the whole feature, at the end of Task 7 (CLAUDE.md: one commit per feature). Tasks 1 to 6 end with the checks, not a commit. Do not push; Mohamed approves the push.
- `npm run typecheck`, `npm run lint`, `npm test` and `npm run build` pass before the commit.
- `prompts/system-context.md` is not changed by a single byte.
- Schema: every property required, `additionalProperties: false`.
- Every UI string in `src/i18n/en.ts`, mirrored key for key in `src/i18n/fr.ts`.
- No plant fact and no derja word hard-coded in `src/` or `api/`. Tests may use example words.
- No Arabic letter may reach a task title, a task note, a notification or a shared list.
- Never use `\b` in a regex over diagnosis text; use `(?<![\p{L}\p{N}])` and `(?![\p{L}\p{N}])` with the `u` flag.
- Exact values: at most 8 terms a diagnosis; at most 200 corrections; correction write bound 8 s; settings key `derja`; separator inside parentheses ` · ` (space, U+00B7, space).

## Review Focus

Inputs the spec implies and a grower will meet; each has its test in the task named.

1. Claude's word mixes scripts ("الفحمة (fumagine)", "el fahma"): it counts as no word, and the row says "add your word". Task 1.
2. The `derja` settings row holds something unexpected (an object, a string, entries with missing fields): corrections read as an empty list, the card and the route carry on. Task 1.
3. Claude lists the same term twice in two forms ("Aphids", "aphid"): one row, the first one's label. Task 1.
4. A term carries regex characters or ends in a non-letter ("Bt (Bacillus thuringiensis)", "copper 0.5%"): it is found and nothing throws. Task 2.
5. The correction's Save fails or hangs (no signal in the field): the editor stays open with the typed word and shows the network sentence. Task 6.

---

## File structure

| File | Responsibility |
|---|---|
| `src/lib/derja.ts` (create) | Pure rules: clean a word, normal form, read `terms` and corrections, strip Arabic, word sources, place words in a text, edit the corrections list |
| `src/types.ts` | `DerjaTerm`, `Correction`, `Diagnosis.terms?` |
| `src/lib/diagnosis.ts` | `problemResult` keeps `terms`; `shortCause` strips Arabic |
| `prompts/diagnose.schema.json`, `prompts/diagnose.md` | The `terms` array and its rules |
| `api/diagnose.ts` | Reads the `derja` row, adds the corrections block to the user message |
| `src/lib/db.ts` | `loadCorrections`, `saveCorrection`, `removeCorrection` |
| `src/screens/plant/DerjaText.tsx` (create) | Draws one text with its words |
| `src/screens/plant/DerjaWords.tsx` (create) | The "Derja words" card and its editor |
| `src/screens/plant/DiagnosisCard.tsx` | Uses both; loads corrections |
| `tests/derja.test.ts`, `tests/diagnosis.test.ts`, `tests/diagnose.test.ts` (create), `tests/db.test.ts` | Tests |

---

### Task 1: Words, terms and corrections (pure)

**Files:**
- Create: `src/lib/derja.ts`
- Modify: `src/types.ts` (beside `Diagnosis`)
- Test: `tests/derja.test.ts`

**Interfaces:**
- Produces, in `src/types.ts`:
  ```ts
  /** One key term of a diagnosis with the word said in Tunisian; derja is "" when Claude knows none. */
  export interface DerjaTerm { term: string; derja: string }
  /** The grower's word for a term: term in normal form, word "" for "no word", at an ISO time. */
  export interface Correction { term: string; word: string; at: string }
  ```
  and `terms?: DerjaTerm[]` on `Diagnosis` (comment: absent on diagnoses saved before 0.16.0).
- Produces, in `src/lib/derja.ts`:
  ```ts
  export const MAX_TERMS = 8;
  export const MAX_CORRECTIONS = 200;
  export function cleanWord(raw: string): string;            // the word, or "" when it is not one
  export function normalTerm(term: string): string;
  /** Two normal forms name one term: equal, or one is the other plus "s" or "es". */
  export function sameTerm(a: string, b: string): boolean;
  export function cleanTerms(v: unknown): DerjaTerm[];       // one entry per term by sameTerm, the first kept
  export function readCorrections(v: unknown): Correction[]; // newest first, one per term
  export function stripArabic(text: string): string;
  export function withCorrection(list: Correction[], term: string, word: string, at: string): Correction[];
  export function withoutCorrection(list: Correction[], term: string): Correction[];
  ```

- [ ] **Step 1: Write the failing tests** in `tests/derja.test.ts`

```ts
import { describe, expect, it } from "vitest";
import { cleanTerms, cleanWord, MAX_CORRECTIONS, normalTerm, readCorrections, sameTerm, stripArabic, withCorrection, withoutCorrection } from "../src/lib/derja";

describe("cleanWord", () => {
  it("trims, removes direction marks and tatweel, collapses spaces", () => {
    expect(cleanWord(" ‏الفحمة‎ ")).toBe("الفحمة");
    expect(cleanWord("الفـحمة")).toBe("الفحمة");
    expect(cleanWord("سافون   نوار")).toBe("سافون نوار");
  });
  it("keeps the Tunisian letters", () => {
    expect(cleanWord("ڨمل")).toBe("ڨمل");
    expect(cleanWord("ڥيروس")).toBe("ڥيروس");
  });
  it("is empty for a word with a Latin letter, or with no Arabic letter", () => {
    expect(cleanWord("الفحمة (fumagine)")).toBe("");
    expect(cleanWord("el fa7ma")).toBe("");
    expect(cleanWord("،؟ ٣")).toBe("");
    expect(cleanWord("")).toBe("");
  });
});

describe("normalTerm", () => {
  it("lower-cases, unifies apostrophes, hyphens and spaces", () => {
    expect(normalTerm("  Sooty-Mould ")).toBe("sooty mould");
    expect(normalTerm("Peacock’s eye")).toBe("peacock's eye");
    expect(normalTerm("savon noir")).toBe("savon noir");
  });
});

describe("sameTerm", () => {
  it("pairs a term with its plural, both ways, and nothing else", () => {
    expect(sameTerm("aphid", "aphids")).toBe(true);
    expect(sameTerm("bushes", "bush")).toBe(true);
    expect(sameTerm("scale", "scale")).toBe(true);
    expect(sameTerm("scale", "black scale")).toBe(false);
    expect(sameTerm("mould", "mold")).toBe(false);
  });
});

describe("cleanTerms", () => {
  it("keeps well-formed entries, cleans the word, caps at 8", () => {
    const raw = [{ term: " Sooty mould ", derja: " الفحمة " }, { term: "copper", derja: "cuivre" }, { term: "", derja: "x" }, 5, null];
    expect(cleanTerms(raw)).toEqual([{ term: "Sooty mould", derja: "الفحمة" }, { term: "copper", derja: "" }]);
    expect(cleanTerms(Array.from({ length: 12 }, (_, i) => ({ term: `t${i}`, derja: "" })))).toHaveLength(8);
  });
  it("keeps the first of two entries that name the same term", () => {
    expect(cleanTerms([{ term: "Aphids", derja: "ڨمل" }, { term: "aphid", derja: "" }])).toEqual([{ term: "Aphids", derja: "ڨمل" }]);
  });
  it("is empty for anything that is not an array", () => {
    expect(cleanTerms(undefined)).toEqual([]);
    expect(cleanTerms({ term: "x" })).toEqual([]);
  });
});

describe("readCorrections", () => {
  it("reads entries newest first, one per term, cleaned", () => {
    const raw = [
      { term: "sooty mould", word: "الفحمة", at: "2026-11-01T08:00:00Z" },
      { term: "Sooty Mould", word: "فحمة", at: "2026-11-05T08:00:00Z" },
      { term: "aphid", word: "", at: "2026-11-03T08:00:00Z" },
      { term: "copper", word: "cuivre", at: "2026-11-04T08:00:00Z" },
      { term: "x" },
    ];
    expect(readCorrections(raw)).toEqual([
      { term: "sooty mould", word: "فحمة", at: "2026-11-05T08:00:00Z" },
      { term: "aphid", word: "", at: "2026-11-03T08:00:00Z" },
    ]);
  });
  it("is empty for an unexpected row", () => {
    expect(readCorrections(null)).toEqual([]);
    expect(readCorrections({ "sooty mould": "الفحمة" })).toEqual([]);
    expect(readCorrections("x")).toEqual([]);
  });
});

describe("stripArabic", () => {
  it("removes Arabic runs and the empty parentheses they leave", () => {
    expect(stripArabic("Black scale (النمرة) on twigs")).toBe("Black scale on twigs");
    expect(stripArabic("Sooty mould الفحمة")).toBe("Sooty mould");
    expect(stripArabic("Black scale (Saissetia oleae)")).toBe("Black scale (Saissetia oleae)");
  });
});

describe("withCorrection, withoutCorrection", () => {
  const at = "2026-11-11T10:00:00Z";
  it("replaces the term's entry and puts it first", () => {
    const list = [{ term: "aphid", word: "ڨمل", at: "2026-11-01T00:00:00Z" }, { term: "copper", word: "نحاس", at: "2026-10-01T00:00:00Z" }];
    expect(withCorrection(list, "Copper", " النحاس ", at)).toEqual([{ term: "copper", word: "النحاس", at }, list[0]]);
  });
  it("stores an empty word as no word", () => {
    expect(withCorrection([], "aphid", "", at)).toEqual([{ term: "aphid", word: "", at }]);
  });
  it("drops the oldest past 200", () => {
    const list = Array.from({ length: MAX_CORRECTIONS }, (_, i) => ({ term: `t${i}`, word: "", at: `2026-01-01T00:00:${String(i % 60).padStart(2, "0")}Z` }));
    const next = withCorrection(list, "new", "", at);
    expect(next).toHaveLength(MAX_CORRECTIONS);
    expect(next[0].term).toBe("new");
  });
  it("removes by normal form", () => {
    expect(withoutCorrection([{ term: "sooty mould", word: "", at }], "Sooty-Mould")).toEqual([]);
  });
});
```

- [ ] **Step 2: Run** `npx vitest run tests/derja.test.ts` — expected: FAIL, module not found.

- [ ] **Step 3: Implement** the types and the eight exports.
  - `cleanWord`: trim, `normalize("NFC")`, remove `[‎‏‪-‮⁦-⁩ـ]`, collapse whitespace; return it when `/\p{Script=Arabic}/u` and `\p{L}` hold for at least one same character (`/(?=\p{L})\p{Script=Arabic}/u`) and `/\p{Script=Latin}/u` does not match; else `""`.
  - `normalTerm`: NFC, lower case, `[’‘ʼ]` → `'`, `[-‐‑ ]` → space, collapse, trim.
  - `readCorrections`: entries need a string `term` (non-empty after `normalTerm`), a string `word` and a string `at`; a non-empty `word` that `cleanWord` empties drops the entry; sort by `at` descending; keep the first per term.
  - `stripArabic`: remove runs of `[\p{Script=Arabic}‎‏]` (with spaces between Arabic words), then `\(\s*[·\s]*\)`, then collapse spaces and trim.
  - `withCorrection`: the caller has already validated the word; store `cleanWord(word)`; when over 200, sort by `at` descending and cut.

- [ ] **Step 4: Run** `npx vitest run tests/derja.test.ts` — expected: PASS. Then `npm run typecheck`.

---

### Task 2: Placing the words in a text (pure)

**Files:**
- Modify: `src/lib/derja.ts`
- Test: `tests/derja.test.ts`

**Interfaces:**
- Consumes: `DerjaTerm`, `Correction`, `normalTerm` from Task 1.
- Produces:
  ```ts
  export type WordState = "claude" | "yours" | "none" | "missing"; // none: cleared by the grower; missing: Claude gave no word
  export interface WordSource {
    key: string;        // the term a correction is saved or removed under: the applied correction's own term when one applies, else the label's normal form
    label: string;      // the term as Claude listed it, or the correction's term
    word: string;       // the word to draw, "" for none
    state: WordState;
    claudeWord: string; // Claude's own word, "" when none
    listed: boolean;    // in the diagnosis's own list
  }
  /** Listed terms first, in their order, each with its correction applied; then the other corrections, newest first. */
  export function wordSources(terms: DerjaTerm[], corrections: Correction[]): WordSource[];
  export type Piece = { kind: "text"; text: string } | { kind: "word"; word: string; place: "paren" | "lead" | "trail" };
  /** The text cut into pieces: its own slices, in order, with a word piece after each annotated term. */
  export function annotate(text: string, sources: WordSource[]): Piece[];
  /** Whether a source's term stands in the text, by the same matching as annotate. */
  export function occurs(text: string, key: string): boolean;
  /** The rows of the card: every listed source, then the unlisted ones that stand in one of the texts. */
  export function cardRows(texts: string[], sources: WordSource[]): WordSource[];
  ```
  Drawing contract for a word piece: `paren` → ` (` word `)`; `lead` → word then ` · ` (it sits just after an existing `(`); `trail` → ` · ` then word (it sits just before an existing `)`). Text pieces joined give back the original text exactly.

- [ ] **Step 1: Write the failing tests** (append to `tests/derja.test.ts`)

```ts
import { annotate, cardRows, occurs, wordSources, type Piece } from "../src/lib/derja";

const W = { mould: "الفحمة", scale: "النمرة", copper: "النحاس", hydroxide: "هيدروكسيد", bord: "بوردو", aphid: "ڨمل", oil: "زيت" };
/** Draws pieces the way the screen does, for readable assertions. */
function draw(pieces: Piece[]): string {
  return pieces.map((p) => (p.kind === "text" ? p.text : p.place === "paren" ? ` (${p.word})` : p.place === "lead" ? `${p.word} · ` : ` · ${p.word}`)).join("");
}
const src = (terms: Array<[string, string]>, corrections: Array<[string, string]> = []) =>
  wordSources(terms.map(([term, derja]) => ({ term, derja })), corrections.map(([term, word], i) => ({ term, word, at: `2026-11-0${9 - i}T00:00:00Z` })));

describe("wordSources", () => {
  it("applies a correction, marks states, appends unlisted corrections", () => {
    const s = src([["Sooty mould", W.mould], ["copper", ""], ["Aphids", W.aphid]], [["sooty mould", "فحمة"], ["aphids", ""], ["neem oil", W.oil]]);
    expect(s.map((x) => [x.label, x.word, x.state, x.listed])).toEqual([
      ["Sooty mould", "فحمة", "yours", true],
      ["copper", "", "missing", true],
      ["Aphids", "", "none", true],
      ["neem oil", W.oil, "yours", false],
    ]);
    expect(s[0].claudeWord).toBe(W.mould);
  });
  it("matches a correction to a listed term across the plural", () => {
    const s = src([["Aphids", ""]], [["aphid", W.aphid]]);
    expect(s).toHaveLength(1);
    expect([s[0].key, s[0].word, s[0].state]).toEqual(["aphid", W.aphid, "yours"]);
    expect(src([["Aphids", W.aphid]])[0].key).toBe("aphids");
  });
  it("takes the newest of two corrections that pair with one listed term", () => {
    const s = src([["Aphids", ""]], [["aphids", "ڨمل"], ["aphid", "قمل"]]);
    expect(s).toHaveLength(1);
    expect([s[0].key, s[0].word]).toEqual(["aphids", "ڨمل"]);
  });
});

describe("annotate", () => {
  it("adds the word after the first occurrence only, any case", () => {
    expect(draw(annotate("Sooty mould covers the leaves; wash the sooty mould off.", src([["sooty mould", W.mould]])))).toBe(
      `Sooty mould (${W.mould}) covers the leaves; wash the sooty mould off.`,
    );
  });
  it("gives back the text when nothing matches or the word is empty", () => {
    expect(annotate("Water deeply.", src([["copper", W.copper]]))).toEqual([{ kind: "text", text: "Water deeply." }]);
    expect(draw(annotate("Spray copper.", src([["copper", ""]])))).toBe("Spray copper.");
  });
  it("places the longer term first and the shorter at its next free occurrence", () => {
    expect(draw(annotate("Spray copper hydroxide at leaf fall; repeat the copper after rain.", src([["copper", W.copper], ["copper hydroxide", W.hydroxide]])))).toBe(
      `Spray copper hydroxide (${W.hydroxide}) at leaf fall; repeat the copper (${W.copper}) after rain.`,
    );
    expect(draw(annotate("Spray copper hydroxide.", src([["copper", W.copper], ["copper hydroxide", W.hydroxide]])))).toBe(`Spray copper hydroxide (${W.hydroxide}).`);
  });
  it("does not match inside a word, across accents included", () => {
    expect(draw(annotate("Check the soil; the oil helps.", src([["oil", W.oil]])))).toBe(`Check the soil; the oil (${W.oil}) helps.`);
    expect(draw(annotate("Apply huile d'été in June.", src([["huile d'été", W.oil]])))).toBe(`Apply huile d'été (${W.oil}) in June.`);
    expect(draw(annotate("Bois taillé hier.", src([["taill", W.oil]])))).toBe("Bois taillé hier.");
  });
  it("skips a compound or a possessive and takes the next occurrence", () => {
    expect(draw(annotate("A copper-based spray, or plain copper.", src([["copper", W.copper]])))).toBe(`A copper-based spray, or plain copper (${W.copper}).`);
    expect(draw(annotate("The scale's honeydew feeds it; scrape the scale.", src([["scale", W.scale]])))).toBe(`The scale's honeydew feeds it; scrape the scale (${W.scale}).`);
  });
  it("tolerates a trailing s or es, hyphens and curly apostrophes", () => {
    expect(draw(annotate("Aphids cluster on shoots.", src([["aphid", W.aphid]])))).toBe(`Aphids (${W.aphid}) cluster on shoots.`);
    expect(draw(annotate("One scale insect per leaf.", src([["Scale insects", W.scale]])))).toBe(`One scale insect (${W.scale}) per leaf.`);
    expect(draw(annotate("Sooty-mould film.", src([["sooty mould", W.mould]])))).toBe(`Sooty-mould (${W.mould}) film.`);
    expect(draw(annotate("Peacock’s eye spots.", src([["peacock's eye", W.mould]])))).toBe(`Peacock’s eye (${W.mould}) spots.`);
  });
  it("goes inside a parenthesis that follows the term, or before one that closes after it", () => {
    expect(draw(annotate("Black scale (Saissetia oleae) with sooty mould", src([["Black scale", W.scale], ["sooty mould", W.mould]])))).toBe(
      `Black scale (${W.scale} · Saissetia oleae) with sooty mould (${W.mould})`,
    );
    expect(draw(annotate("Use copper (Bordeaux mixture) now.", src([["Bordeaux mixture", W.bord]])))).toBe(`Use copper (Bordeaux mixture · ${W.bord}) now.`);
  });
  it("finds terms with regex characters and non-letter ends", () => {
    expect(draw(annotate("Spray Bt (Bacillus thuringiensis) at dusk.", src([["Bt (Bacillus thuringiensis)", W.oil]])))).toBe(`Spray Bt (Bacillus thuringiensis) (${W.oil}) at dusk.`);
    expect(draw(annotate("Mix copper 0.5% in water.", src([["copper 0.5%", W.copper]])))).toBe(`Mix copper 0.5% (${W.copper}) in water.`);
  });
  it("uses a correction for a term Claude did not list", () => {
    expect(draw(annotate("Spray neem oil.", src([], [["neem oil", W.oil]])))).toBe(`Spray neem oil (${W.oil}).`);
  });
  it("keeps the text pieces equal to the original", () => {
    const text = "Black scale (Saissetia oleae), copper (Bordeaux mixture).";
    const pieces = annotate(text, src([["Black scale", W.scale], ["Bordeaux mixture", W.bord]]));
    expect(pieces.filter((p) => p.kind === "text").map((p) => (p as { text: string }).text).join("")).toBe(text);
  });
});

describe("occurs, cardRows", () => {
  it("lists every listed source and only the unlisted ones that stand in a text", () => {
    const sources = src([["Bordeaux mixture", W.bord]], [["neem oil", W.oil], ["sulphur", W.copper]]);
    expect(cardRows(["Spray bouillie bordelaise.", "Then neem oil."], sources).map((r) => r.label)).toEqual(["Bordeaux mixture", "neem oil"]);
    expect(occurs("Then neem oils.", "neem oil")).toBe(true);
  });
});
```

- [ ] **Step 2: Run** `npx vitest run tests/derja.test.ts` — expected: FAIL on the new imports.

- [ ] **Step 3: Implement.** One private `termPattern(key: string): RegExp` builds the matcher from the normal form: escape every regex character; a space becomes `[\s \-‐‑]+`; `'` becomes `['’‘ʼ]`; the last word takes an optional `(?:e?s)?`, and when the key's last word ends in `es` or `s` the stem without it is accepted too; wrap in `(?<![\p{L}\p{N}])` … `(?![\p{L}\p{N}])(?![-‐‑'’]\p{L})`; flags `giu`. `wordSources` pairs a correction with a listed term by `sameTerm` (Task 1); the first pairing correction in the list (the newest) is applied and any older one pairing with the same listed term is left out of the sources. `annotate`: sources with a non-empty word, longest key first; for each, the first match that overlaps no span already taken; then cut the text in order. Placement of each word: if the text after the match is optional spaces then `(`, cut after that `(` and emit `lead`; else if the character after the match is `)`, emit `trail` at the match end; else `paren` at the match end.

- [ ] **Step 4: Run** `npx vitest run tests/derja.test.ts` — expected: PASS. `npm run typecheck`, `npm run lint`.

---

### Task 3: A stored diagnosis keeps its terms; titles stay free of Arabic

**Files:**
- Modify: `src/lib/diagnosis.ts` (`problemResult`, `shortCause`)
- Modify: `src/screens/plant/DiagnosisCard.tsx:55` (the treatment note's fallback)
- Test: `tests/diagnosis.test.ts` (create)

**Interfaces:**
- Consumes: `cleanTerms`, `stripArabic` (Task 1).
- Produces: `problemResult(ai)` returns `terms` (cleaned) exactly when the stored object has an array `terms`, and no `terms` key otherwise. `shortCause(cause)` strips Arabic before cutting.

- [ ] **Step 1: Write the failing tests**

```ts
import { describe, expect, it } from "vitest";
import { problemResult, rephotoTask, shortCause } from "../src/lib/diagnosis";

const base = { summary: "s", likely_causes: [{ cause: "Black scale (النمرة) on twigs", kind: "pest", likelihood: 0.8, evidence: "" }], checks_to_do: [], organic_treatment: "", prevention: "", urgency: "this_week", rephotograph_in_days: 7 };

describe("problemResult and terms", () => {
  it("keeps the cleaned terms of a stored diagnosis", () => {
    const r = problemResult({ ...base, terms: [{ term: "Black scale", derja: " النمرة " }, { term: "copper", derja: "cuivre" }, 3] });
    expect(r?.terms).toEqual([{ term: "Black scale", derja: "النمرة" }, { term: "copper", derja: "" }]);
  });
  it("keeps an empty list as a list", () => {
    expect(problemResult({ ...base, terms: [] })?.terms).toEqual([]);
  });
  it("has no terms key for a diagnosis stored before 0.16.0", () => {
    const r = problemResult(base);
    expect(r && "terms" in r).toBe(false);
  });
  it("survives a second pass, as after a recovered lost reply and the app's save", () => {
    const once = problemResult({ ...base, terms: [{ term: "Black scale", derja: "النمرة" }] });
    expect(problemResult({ ...once, note: "n" })?.terms).toEqual([{ term: "Black scale", derja: "النمرة" }]);
  });
});

describe("titles carry no Arabic", () => {
  it("shortCause strips it", () => {
    expect(shortCause("Sooty mould الفحمة, on leaves")).toBe("Sooty mould");
    expect(shortCause("Black scale (النمرة) on twigs")).toBe("Black scale on twigs");
  });
  it("the follow-up task's title and instruction carry none", () => {
    const { title, instruction } = rephotoTask(problemResult(base)!, "OLV-1");
    expect(/\p{Script=Arabic}/u.test(title + instruction)).toBe(false);
  });
});
```

- [ ] **Step 2: Run** `npx vitest run tests/diagnosis.test.ts` — expected: FAIL.

- [ ] **Step 3: Implement.** In `problemResult`, after the `spray` line: `...(Array.isArray(r.terms) ? { terms: cleanTerms(r.terms) } : {})`. In `shortCause`, apply `stripArabic` to `cause` first. In `DiagnosisCard.tsx` line 55, the fallback `top?.cause` becomes `stripArabic(top.cause)` (the note "Treated: …" is a task note).

- [ ] **Step 4: Run** `npx vitest run tests/diagnosis.test.ts` and `npm run typecheck` — expected: PASS.

---

### Task 4: Claude writes the terms; the route passes the grower's words

**Files:**
- Modify: `prompts/diagnose.schema.json`, `prompts/diagnose.md`
- Modify: `api/diagnose.ts` (`DiagnoseContext`, `describeContext`, the handler)
- Test: `tests/diagnose.test.ts` (create)

**Interfaces:**
- Consumes: `Correction`, `readCorrections` (Task 1).
- Produces, in `api/diagnose.ts`:
  ```ts
  /** The block of the grower's own words for the user message; null when there are none. */
  export function correctionsBlock(corrections: Correction[]): string | null;
  /** The settings row `derja`, read with the service client; [] on any error or an unexpected value. */
  export async function loadCorrections(db: SupabaseClient): Promise<Correction[]>;
  ```
  `DiagnoseContext` gains `corrections: Correction[]`.

- [ ] **Step 1: Write the failing tests**

```ts
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { correctionsBlock } from "../api/diagnose";

describe("the diagnose schema", () => {
  const schema = JSON.parse(readFileSync("prompts/diagnose.schema.json", "utf8"));
  it("requires terms of { term, derja }, nothing else", () => {
    expect(schema.required).toContain("terms");
    expect(schema.properties.terms.items).toEqual({
      type: "object",
      properties: { term: { type: "string" }, derja: { type: "string" } },
      required: ["term", "derja"],
      additionalProperties: false,
    });
  });
});

describe("correctionsBlock", () => {
  it("is null without corrections", () => {
    expect(correctionsBlock([])).toBeNull();
  });
  it("lists them in the order given, an empty word as no local word", () => {
    const block = correctionsBlock([
      { term: "sooty mould", word: "الفحمة", at: "2026-11-05T00:00:00Z" },
      { term: "aphid", word: "", at: "2026-11-03T00:00:00Z" },
    ])!;
    const lines = block.split("\n");
    expect(lines[0]).toBe("The grower's own derja words; use these exactly:");
    expect(lines[1]).toBe("- sooty mould: الفحمة");
    expect(lines[2]).toBe("- aphid: no local word; list it with an empty derja");
  });
});
```

Add a test that `describeContext` with `corrections` puts the block just before the final "Diagnose what the photo shows on this plant." line and omits it when the list is empty; build the plant with `tests/fixtures.ts` as the existing context tests do (find them with `grep -n "describeContext" tests/*.ts`; if they live in another file, put this test beside them and give them `corrections: []`).

- [ ] **Step 2: Run** `npx vitest run tests/diagnose.test.ts` — expected: FAIL.

- [ ] **Step 3: Schema.** Add to `properties`, and to `required`:
  ```json
  "terms": { "type": "array", "items": { "type": "object", "properties": { "term": { "type": "string" }, "derja": { "type": "string" } }, "required": ["term", "derja"], "additionalProperties": false } }
  ```

- [ ] **Step 4: Prompt.** Append these rules to `prompts/diagnose.md` (wording may be tightened; every point must stay):
  - terms: up to eight key terms the grower will have to say aloud to a worker or a supplier: the names of the likely causes first, then the products, then the action (spraying, cutting out) and a tool when it matters. `term` is copied exactly as it is written in one of the text fields above.
  - derja: the word people in Cap Bon really say for it, in Tunisian Arabic, Arabic letters only, one short word or phrase with no explanation. When people use the French name, give that name as pronounced, in Arabic letters. When you do not know a word people really use, give an empty string; never a guess and never a textbook Arabic term.
  - Write every text field in English; French product names as sold in Tunisia stay as they are. Put no Arabic letters and no transliteration in any field except `terms[].derja`, whatever the site context says about names.
  - When the user message lists the grower's own derja words, use each exactly for its term, and write that term in the text with the grower's spelling.

- [ ] **Step 5: Route.** `loadCorrections`: `db.from("settings").select("value").eq("key", "derja").maybeSingle()`; error or thrown → `[]`; else `readCorrections(data?.value)`. Call it beside `loadWeather`. `describeContext` pushes `correctionsBlock(corrections)` when not null, before the final line. `maxTokens` stays 2048.

- [ ] **Step 6: Run** `npx vitest run tests/diagnose.test.ts tests/rows.test.ts tests/api.test.ts` and `npm run typecheck` — expected: PASS (the photos row carries `terms` untouched because `photoRow` stores the whole result; add one assertion to the existing `photoRow` test that a `terms` array in the result is in `ai_result`).

---

### Task 5: Saving a correction

**Files:**
- Modify: `src/lib/db.ts` (beside `ZONES_KEY`)
- Test: `tests/db.test.ts`

**Interfaces:**
- Consumes: `readCorrections`, `withCorrection`, `withoutCorrection` (Task 1).
- Produces:
  ```ts
  export const DERJA_KEY = "derja";
  export const DERJA_WRITE_MS = 8000;
  export async function loadCorrections(): Promise<Correction[]>;
  /** Reads the row again, sets the term's word ("" for no word), writes the row; returns the list as stored. */
  export async function saveCorrection(term: string, word: string, at?: string): Promise<Correction[]>;
  /** Reads the row again, drops the term's entry, writes the row; returns the list as stored. */
  export async function removeCorrection(term: string): Promise<Correction[]>;
  ```
  `getSetting` and `setSetting` gain an optional last parameter `signal?: AbortSignal` (applied with `.abortSignal(signal)`); existing callers are unchanged.

- [ ] **Step 1: Write the failing tests** in `tests/db.test.ts`, with the file's existing mock of `supabase` (`tests/mockdb.ts`), a `settings` table seeded with `{ key: "derja", value: [{ term: "aphid", word: "ڨمل", at: "2026-11-01T00:00:00Z" }] }`:
  - `saveCorrection("Sooty mould", "الفحمة", "2026-11-11T10:00:00Z")` resolves to two entries, `sooty mould` first, and the stored row's `value` equals them.
  - A row changed between the page's load and the save is not overwritten: seed the row, call `loadCorrections()`, change the stored row directly to add `{ term: "copper", … }`, then `saveCorrection("x", "", at)`; the stored value has `x`, `copper` and `aphid`.
  - `saveCorrection` on a missing row creates it with one entry.
  - `removeCorrection("Aphid")` leaves `[]` stored; `removeCorrection("copper")` leaves the row as it was. (Entries are matched by `normalTerm` equality here; the card passes the source's `key`, which is the stored term.)
  - `loadCorrections()` on a row holding `{ a: 1 }` resolves to `[]`.

- [ ] **Step 2: Run** `npx vitest run tests/db.test.ts` — expected: FAIL.

- [ ] **Step 3: Implement.** Each write makes one `AbortSignal.timeout(DERJA_WRITE_MS)` and passes it to both the read and the upsert; `at` defaults to `new Date().toISOString()`.

- [ ] **Step 4: Run** `npx vitest run tests/db.test.ts` — expected: PASS.

---

### Task 6: The card shows the words and takes corrections

**Files:**
- Create: `src/screens/plant/DerjaText.tsx`, `src/screens/plant/DerjaWords.tsx`
- Modify: `src/screens/plant/DiagnosisCard.tsx`, `src/i18n/en.ts`, `src/i18n/fr.ts`, `src/styles.css`

**Interfaces:**
- Consumes: `wordSources`, `annotate`, `cardRows`, `cleanWord`, `WordSource` (Tasks 1, 2); `loadCorrections`, `saveCorrection`, `removeCorrection` (Task 5); `describeError` from `src/lib/errors.ts`.
- Produces:
  ```tsx
  export function DerjaText({ text, sources }: { text: string; sources: WordSource[] }): JSX.Element; // a fragment
  export function DerjaWords({ rows, onSaved }: { rows: WordSource[]; onSaved: (list: Correction[]) => void }): JSX.Element | null; // null without rows
  ```

- [ ] **Step 1: Strings.** Add to `t.diagnose` in `en.ts` (exact copy), and the French in `fr.ts`:
  - `derjaTitle: "Derja words"`
  - `derjaYours: "your word"`, `derjaNone: "no word"`, `derjaAdd: "add your word"`
  - `derjaField: (term: string) => \`Derja word for ${term}\`` (the input's aria-label)
  - `derjaUseClaude: "Use Claude's word"`
  - `derjaNotArabic: "Write the word in Arabic letters"`
  - `derjaSaveFailed: "The word could not be saved"`
  Save and Cancel use `t.common`.

- [ ] **Step 2: `DerjaText`.** Maps `annotate(text, sources)` to nodes by the drawing contract of Task 2; each word is `<bdi dir="rtl" lang="aeb" className="arabic derja">`. Add `.derja { font-style: normal; font-weight: 400; letter-spacing: normal; text-transform: none; }` to `styles.css` after `.arabic`.

- [ ] **Step 3: `DerjaWords`.** A `section.card` titled `derjaTitle`, one button row per source: the label, then the word in the same `bdi` (or, by state, `derjaNone` / `derjaAdd` muted), and a small muted `derjaYours` when the state is `yours`. Tapping a row opens its editor in place: `<input dir="rtl" lang="aeb" className="arabic" autoCorrect="off" autoCapitalize="none" spellCheck={false} autoComplete="off" enterKeyHint="done">` holding the current word; Save; Cancel; and `derjaUseClaude` only when the state is `yours` or `none`. Save: with `raw.trim() !== ""` and `cleanWord(raw) === ""`, show `derjaNotArabic` and write nothing; otherwise `saveCorrection(row.key, raw)`, then `onSaved(list)` and close. `derjaUseClaude` calls `removeCorrection(row.key)`. A failure shows `` `${derjaSaveFailed}: ${describeError(err)}` `` in a `Banner kind="error"`, leaves the editor open with the typed word, and re-enables the buttons. One editor open at a time; buttons disabled while a write runs.

- [ ] **Step 4: `DiagnosisCard`.** When `diagnosis.terms` is an array: load the corrections once on mount (`loadCorrections()`; a failure leaves `[]` and shows nothing), keep them in state, compute `sources = wordSources(cleanTerms(diagnosis.terms), corrections)` (a fresh reply has not passed through `problemResult`), and draw through `<DerjaText>`: the summary, each cause's name and evidence, each check, the treatment, the prevention. Put `<DerjaWords rows={cardRows(allTexts, sources)} onSaved={setCorrections} />` between the Treatment and Prevention sections. When `diagnosis.terms` is undefined, the card draws exactly as before and makes no settings read. The `key` of a cause row stays built from the raw `c.cause`.

- [ ] **Step 5: Verify in the browser.** Start the dev server with the preview tool, open a plant with a stored diagnosis (or temporarily seed one in the dev database with a `terms` array through the app's own diagnose call), and check: the words stand in parentheses in the right places and the English reads left to right around them; the row editor saves and the text changes at once; a Latin word is refused with the message; with the network off in DevTools, Save shows "The word could not be saved: Network error. Check the connection and try again." and keeps the typed word (Review Focus 5); dark mode; 375 px width; a diagnosis without `terms` is unchanged. Take a screenshot for Mohamed.

- [ ] **Step 6: Run** `npm run typecheck`, `npm run lint`, `npm test`.

---

### Task 7: Version, documents, the checks, one commit

**Files:**
- Create: `PHASE16.md` (in the form of `PHASE15.md`: plan, ★ setup, build list, acceptance tests, usage check)
- Modify: `src/version.ts` (0.16.0), the Settings phase card in `src/screens/SettingsScreen.tsx` and its strings, `docs/USER-GUIDE.md` (the diagnosis chapter and the header), `docs/DECISIONS.md` (entry of the build date: derja words on a diagnosis; the system context's name rule overridden for diagnose; corrections in a settings row), `CLAUDE.md` (phases line, `src/lib` list with `derja`, the diagnose call's `terms`, the tests list), `README.md` if it lists phases

- [ ] **Step 1: `PHASE16.md`.** ★ setup: an Arabic keyboard in Gboard (Languages → Arabic; ڨ ڥ پ under a long press on ق ف ب); Reload after the deploy; no SQL, no key. Acceptance tests: the seven phone tests of the spec's "Tests and acceptance", copied in order. Usage check: about 100 to 250 more output tokens a diagnosis, the corrections list as input.
- [ ] **Step 2: The other documents and the version**, as listed above.
- [ ] **Step 3: Run the four checks:** `npm run typecheck`, `npm run lint`, `npm test`, `npm run build` — all pass, output read.
- [ ] **Step 4: One real call** (costs one diagnosis; ask Mohamed first): against a local `vercel dev` or after deploy, diagnose one problem photo and read the stored `ai_result`: `terms` is present, every `term` occurs in a text field, every non-empty `derja` passes `cleanWord`, and no other field holds an Arabic letter. If the output was cut at 2,048 tokens more than once, raise `maxTokens` to 2560 and note it in `docs/DECISIONS.md`.
- [ ] **Step 5: Commit** (not pushed):

```bash
git add -A
```

```bash
git commit -m "Phase 16: derja words on a diagnosis (0.16.0)"
```
