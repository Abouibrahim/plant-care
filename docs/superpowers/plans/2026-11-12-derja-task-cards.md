# Derja Words on Task Cards Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Task cards show the derja word beside the plants, pests and diseases, products and tools their title and instruction name, at no cost, offline too, with one switch to turn it off.

**Architecture:** Claude labels each term's kind in both term lists; the kind travels with the term through the app-wide list and the corrections. A pure module builds a task card's words: the known words of the four shown kinds, the species' own Arabic names, and every other known term as a wordless placeholder that only holds its place. Today reads the words through the existing hook, which now keeps a copy on the phone.

**Tech Stack:** TypeScript, React 19, Vite, vitest (node environment, no component tests), Supabase JS.

**Spec:** `docs/superpowers/specs/2026-11-12-derja-task-cards-design.md` (binding). It extends the two designs of 2026-11-11 in the same folder. Read it first.

## Global Constraints

- Branch `phase-18-derja-tasks` cut from `main` (at `aa84f7b`, 0.17.1). The design and this plan are committed first, on the branch; then one commit for the feature at the end of Task 7. Do not merge or push; Mohamed approves that.
- `npm run typecheck`, `npm run lint`, `npm test` and `npm run build` pass before the commit.
- No SQL step. `prompts/system-context.md` unchanged.
- `tasks.title` and `tasks.instruction` are never written with Arabic; the words are placed when a card is drawn.
- No words on: a task's note, toasts, journal lines, kind headings, the map popup (`src/screens/map/PlantMap.tsx:220`), the handout, the digest, the exports.
- Without a session Today makes no settings read; it uses the kept copy.
- Structured output: every property required, `additionalProperties: false`.
- Strings in `en.ts` and `fr.ts`. No derja word and no plant fact hard-coded outside tests.
- Never `\b` in a regex over prose. Never run `prettier --write` (the project has no config).
- Exact values: kinds `plant`, `pest`, `product`, `tool`, `operation`, `other`; shown on task cards: `plant`, `pest`, `product`, `tool`; `localStorage` keys `plantcare.derja` (the kept words) and `plantcare.taskDerja` (the switch, value `"off"` when off, absent when on).
- Shell note: write patch scripts as files with the editor tools; on this machine a heredoc halves backslashes and the Write tool turns `\uXXXX` into characters.

## Review Focus

1. A Today list kept on the phone before this phase (its plants carry no species): no names, no crash. Tasks 2 and 4.
2. An app-wide entry stored without a kind, then listed by a call with one: the kind is filled, the word unchanged, one write; the same call again writes nothing. Tasks 1 and 3.
3. A profile's names in odd shapes: empty, missing, Latin letters in the Arabic name, several names in one string. Task 2.
4. `localStorage` that throws or holds something unexpected under either key: the cards are plain and the switch reads as on. Task 4.
5. A plant's name inside a longer term the app knows but does not show ("olive fly" with no kind): "Scout for olive fly" stays plain. Task 2.

---

## File structure

| File | Responsibility |
|---|---|
| `src/types.ts` | `DerjaKind`; `kind?` on `DerjaTerm`, `AppWord`, `Correction`; `TaskWithPlant.plant.species?` |
| `src/lib/derja.ts` | Kinds carried by every reader and writer; `withWords` remembers kinds; `WordSource.kind`; the quantity parenthesis |
| `src/lib/taskDerja.ts` (create) | A task card's words: plant-name terms, the filter with placeholders, the texts of a list, the switch |
| `prompts/diagnose.*`, `prompts/derja.*` | `kind` in both term lists |
| `src/lib/db.ts` | `saveCorrection` takes a kind; `listDueTasks` brings the species' names |
| `src/lib/offline.ts` | `keepDerja` / `recallDerja` |
| `src/lib/useDerja.ts` | Options `kept` and `reloadKey`; keeps every good read |
| `src/components/TaskCard.tsx`, `src/screens/today/BatchCard.tsx`, `src/screens/TodayScreen.tsx`, `src/components/derja/ProfileDerja.tsx`, `src/components/derja/DerjaWords.tsx`, `src/screens/PlantScreen.tsx`, `src/screens/SettingsScreen.tsx` | Drawing and the switch |
| `tests/derja-kinds.test.ts`, `tests/task-derja.test.ts` (create), existing derja, server, route, db and offline tests | Tests |

---

### Task 1: A kind for every term (pure rules)

**Files:** Modify `src/types.ts`, `src/lib/derja.ts`. Tests: create `tests/derja-kinds.test.ts`; `tests/derja.test.ts`, `tests/derja-words.test.ts`, `tests/derja-server.test.ts` must pass unchanged.

**Interfaces — produces:**

```ts
// src/types.ts
export type DerjaKind = "plant" | "pest" | "product" | "tool" | "operation" | "other";
export interface DerjaTerm { term: string; derja: string; kind?: DerjaKind }
export interface Correction { term: string; word: string; at: string; kind?: DerjaKind }
/** word may now be "": the entry then only tells the term's kind (comment updated). */
export interface AppWord { term: string; word: string; at: string; kind?: DerjaKind }

// src/lib/derja.ts
export const KINDS: DerjaKind[];                       // the six, in the order above
export function isKind(v: unknown): v is DerjaKind;
export function withCorrection(list: Correction[], term: string, word: string, at: string, kind?: DerjaKind): Correction[];
export interface WordSource { /* as now, plus */ kind: DerjaKind | null }
```

Rules:

- `cleanTerms`, `readWords`, `readCorrections`: a valid `kind` is kept, an invalid one dropped (the entry stays). An object without a kind has no `kind` key at all (so every existing `toEqual` holds).
- `readWords` keeps an entry with an empty word only when it has a kind; without one it is dropped as today.
- `withCorrection`: the new entry takes `kind` when given, else the kind of the entry it replaces; no `kind` key when neither.
- `withWords(list, terms, corrections, at)`, for each term (normal form `term`, cleaned `word`, `kind`):
  - an entry pairs by `sameTerm`: replace it by a new object when something is to fill, else leave it: a missing kind is filled; an empty word is filled by `word` unless a correction pairs with the term; a word already there never changes;
  - no entry: with a non-empty `word` and no correction, push `{ term, word, at, kind? }` (as today, plus the kind); else, only when the term has a kind, push `{ term, word: "", at, kind }`; a term with no kind and no usable word adds nothing (as today).
  The cap and its eviction are unchanged.
- `wordSources`: `kind` is the listed term's, else the first paired app word's, else the applied correction's, else `null`. An app word with an empty word gives `claudeWord: ""`: for a listed term the call's own word still applies (`app[0]?.word || t.derja` already does this); an unlisted one with no correction gives `{ word: "", state: "missing", claudeWord: "" }` and is therefore in no card row and places nothing.
- `withoutCorrected` already spreads the term, so the kind passes; add the test only.

- [ ] **Step 1: Write the failing tests** in `tests/derja-kinds.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { cleanTerms, isKind, KINDS, readCorrections, readWords, withCorrection, withoutCorrected, withWords, wordSources } from "../src/lib/derja";

const at = "2026-11-12T08:00:00Z";
const later = "2026-11-13T08:00:00Z";

describe("kinds", () => {
  it("are the six, and nothing else is one", () => {
    expect(KINDS).toEqual(["plant", "pest", "product", "tool", "operation", "other"]);
    expect(isKind("tool")).toBe(true);
    expect(isKind("Tool")).toBe(false);
    expect(isKind(undefined)).toBe(false);
  });
  it("are kept by the readers when valid, dropped when not, and absent when absent", () => {
    expect(cleanTerms([{ term: "Kaolin", derja: "كاولان", kind: "product" }, { term: "saw", derja: "", kind: "weapon" }, { term: "mulch", derja: "تبن" }])).toEqual([
      { term: "Kaolin", derja: "كاولان", kind: "product" },
      { term: "saw", derja: "" },
      { term: "mulch", derja: "تبن" },
    ]);
    expect(readCorrections([{ term: "kaolin", word: "كاولان", at, kind: "product" }, { term: "saw", word: "", at, kind: 3 }])).toEqual([
      { term: "kaolin", word: "كاولان", at, kind: "product" },
      { term: "saw", word: "", at },
    ]);
    expect(readWords([{ term: "kaolin", word: "كاولان", at, kind: "product" }, { term: "saw", word: "", at, kind: "tool" }, { term: "oil", word: "", at }, { term: "mulch", word: "تبن", at }])).toEqual([
      { term: "kaolin", word: "كاولان", at, kind: "product" },
      { term: "saw", word: "", at, kind: "tool" },
      { term: "mulch", word: "تبن", at },
    ]);
    expect(withoutCorrected([{ term: "Kaolin", derja: "كاولان", kind: "product" }], [{ term: "kaolin", word: "x", at }])).toEqual([{ term: "Kaolin", derja: "", kind: "product" }]);
  });
});

describe("withCorrection and the kind", () => {
  it("takes the kind given, else keeps the one stored", () => {
    const first = withCorrection([], "Kaolin", "كاولان", at, "product");
    expect(first).toEqual([{ term: "kaolin", word: "كاولان", at, kind: "product" }]);
    expect(withCorrection(first, "kaolin", "الكاولان", later)).toEqual([{ term: "kaolin", word: "الكاولان", at: later, kind: "product" }]);
    expect(withCorrection([], "saw", "منشار", at)).toEqual([{ term: "saw", word: "منشار", at }]);
  });
});

describe("the app-wide list remembers kinds", () => {
  const old = { term: "kaolin", word: "كاولان", at };
  it("fills a missing kind and never changes the word", () => {
    const next = withWords([old], [{ term: "Kaolin", derja: "طين", kind: "product" }], [], later);
    expect(next).toEqual([{ term: "kaolin", word: "كاولان", at, kind: "product" }]);
    expect(next[0]).not.toBe(old);
  });
  it("leaves the list as it is, entry for entry, when nothing is to fill", () => {
    const list = [{ term: "kaolin", word: "كاولان", at, kind: "product" as const }];
    const next = withWords(list, [{ term: "kaolin", derja: "طين", kind: "tool" }], [], later);
    expect(next).toEqual(list);
    expect(next[0]).toBe(list[0]);
  });
  it("keeps the kind of a term with no word of Claude's, or one the grower corrected", () => {
    const corrections = [{ term: "saw", word: "منشار", at }];
    const next = withWords([], [{ term: "yellow traps", derja: "", kind: "tool" }, { term: "Saw", derja: "منشار", kind: "tool" }, { term: "leaf", derja: "" }], corrections, at);
    expect(next).toEqual([
      { term: "yellow traps", word: "", at, kind: "tool" },
      { term: "saw", word: "", at, kind: "tool" },
    ]);
  });
  it("fills an empty word with a later first word, unless the grower corrected the term", () => {
    const list = [{ term: "yellow traps", word: "", at, kind: "tool" as const }, { term: "saw", word: "", at, kind: "tool" as const }];
    const next = withWords(list, [{ term: "yellow trap", derja: "مصيدة", kind: "tool" }, { term: "saw", derja: "منشار", kind: "tool" }], [{ term: "saw", word: "x", at }], later);
    expect(next).toEqual([{ term: "yellow traps", word: "مصيدة", at, kind: "tool" }, list[1]]);
  });
  it("adds nothing for a term with neither a kind nor a word, as before", () => {
    expect(withWords([], [{ term: "copper", derja: "" }], [], at)).toEqual([]);
  });
});

describe("a source's kind", () => {
  it("comes from the listed term, else the app word, else the correction", () => {
    const s = wordSources(
      [{ term: "Kaolin", derja: "كاولان", kind: "product" }, { term: "pruning", derja: "زبيرة" }],
      [{ term: "saw", word: "منشار", at, kind: "tool" }, { term: "ash", word: "رماد", at }],
      [{ term: "pruning", word: "زبيرة", at, kind: "operation" }, { term: "olive fly", word: "ذبانة", at, kind: "pest" }, { term: "yellow traps", word: "", at, kind: "tool" }],
    );
    expect(s.map((x) => [x.label, x.kind, x.word])).toEqual([
      ["Kaolin", "product", "كاولان"],
      ["pruning", "operation", "زبيرة"],
      ["olive fly", "pest", "ذبانة"],
      ["yellow traps", "tool", ""],
      ["saw", "tool", "منشار"],
      ["ash", null, "رماد"],
    ]);
  });
  it("lets a correction show for a term the app-wide list only knows the kind of", () => {
    const s = wordSources([], [{ term: "yellow traps", word: "مصايد", at }], [{ term: "yellow traps", word: "", at, kind: "tool" }]);
    expect(s).toHaveLength(1);
    expect([s[0].word, s[0].state, s[0].kind, s[0].claudeWord]).toEqual(["مصايد", "yours", "tool", ""]);
  });
});
```

- [ ] **Step 2: Run** `npx vitest run tests/derja-kinds.test.ts` — expected: FAIL (missing exports).
- [ ] **Step 3: Implement.**
- [ ] **Step 4: Run** `npx vitest run tests/derja-kinds.test.ts tests/derja.test.ts tests/derja-words.test.ts tests/derja-server.test.ts tests/diagnosis.test.ts` and `npm run typecheck` — PASS. (`tests/derja-server.test.ts` "writes nothing when nothing is new" still holds: its wordless term has no kind.)

---

### Task 2: A task card's words (pure rules)

**Files:** Modify `src/lib/derja.ts` (`annotate`). Create `src/lib/taskDerja.ts`. Tests: create `tests/task-derja.test.ts`; add one case to `tests/derja.test.ts`.

**Interfaces — consumes:** Task 1. **Produces:**

```ts
// src/lib/taskDerja.ts
export const TASK_KINDS: DerjaKind[];                                   // ["plant", "pest", "product", "tool"]
export interface SpeciesNames { en?: unknown; ar?: unknown }
/** The terms a species' names give: each English name (and its form without "tree", "bush", "shrub", "vine") with the Arabic name as its word. */
export function plantNameTerms(names: SpeciesNames[]): Array<{ term: string; word: string }>;
/** The words of task cards: known words of the four kinds and the plants' names, every other known term kept without its word so it holds its place. */
export function taskSources(corrections: Correction[], words: AppWord[], names: SpeciesNames[]): WordSource[];
/** The texts of a list of tasks that carry words: each title and instruction. */
export function taskTexts(tasks: Array<{ title: string; instruction?: string | null }>): string[];
```

Rules:

- `annotate`: the "lead" placement applies only when the parenthesis that follows holds no digit and none of ½ ¼ ¾: test the text from the `(` to its first `)` (or the end) with `/[\d½¼¾]/`. With one, the word is placed as "paren", before the parenthesis. "trail" is unchanged.
- `plantNameTerms`: for each `{ en, ar }` with both strings: the word is `cleanWord` of the first part of `ar` before `,`, `،`, `/` or `(`; no word, no terms. `en` has its parenthesised parts removed, then is split on `,`, `;`, `/` and ` or `; each part trimmed is a term, and a part ending in ` tree`, ` bush`, ` shrub` or ` vine` (any case) also gives the part without it. Terms are kept in normal form, under three letters dropped, and a term already given by an earlier species is skipped (by `sameTerm`).
- `taskSources`: start from `wordSources([], corrections, words)`. For each plant-name term: a source that pairs by `sameTerm` becomes kind `plant`, and, when it is not a correction (state `claude` or `missing`), takes the profile's word (`word` and `claudeWord`, state `claude`); with no such source one is added `{ key: term, label: term, word, state: "claude", claudeWord: word, listed: false, kind: "plant" }`. Then every source whose kind is not in `TASK_KINDS` has its `word` set to `""` (it stays in the list as a placeholder).
- `taskTexts`: non-empty titles and instructions, in order.

- [ ] **Step 1: Write the failing tests.** In `tests/derja.test.ts`, inside `describe("annotate")`, using the file's `draw`, `src` and `W`:

```ts
  it("keeps a quantity's parentheses to itself (Phase 18)", () => {
    expect(draw(annotate("Spray savon noir (30 g per litre) at dusk.", src([["savon noir", W.oil]])))).toBe(`Spray savon noir (${W.oil}) (30 g per litre) at dusk.`);
    expect(draw(annotate("Water the olive (up to 40 L).", src([["olive", W.oil]])))).toBe(`Water the olive (${W.oil}) (up to 40 L).`);
    expect(draw(annotate("Black scale (Saissetia oleae) on twigs", src([["Black scale", W.scale]])))).toBe(`Black scale (${W.scale} · Saissetia oleae) on twigs`);
  });
```

`tests/task-derja.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { annotate, narrowSources, type Piece } from "../src/lib/derja";
import { plantNameTerms, taskSources, taskTexts, TASK_KINDS } from "../src/lib/taskDerja";

const at = "2026-11-12T08:00:00Z";
const draw = (pieces: Piece[]) => pieces.map((p) => (p.kind === "text" ? p.text : p.place === "paren" ? ` (${p.word})` : p.place === "lead" ? `${p.word} · ` : ` · ${p.word}`)).join("");
const olive = { en: "Olive", ar: "زيتون" };
const fig = { en: "Fig tree, Common fig", ar: "كرموس، تين" };

describe("plantNameTerms", () => {
  it("gives each English name, and its form without tree, the first Arabic name", () => {
    expect(plantNameTerms([olive, fig])).toEqual([
      { term: "olive", word: "زيتون" },
      { term: "fig tree", word: "كرموس" },
      { term: "fig", word: "كرموس" },
      { term: "common fig", word: "كرموس" },
    ]);
  });
  it("drops remarks in parentheses, short terms and a name another species already gave", () => {
    expect(plantNameTerms([{ en: "Bay (laurel) / Ui", ar: "رند (laurier)" }, { en: "Olives", ar: "زيتونة" }, olive])).toEqual([
      { term: "bay", word: "رند" },
      { term: "olives", word: "زيتونة" },
    ]);
  });
  it("gives nothing for names that are missing, empty or not in Arabic letters", () => {
    expect(plantNameTerms([{ en: "Olive", ar: "zitoun" }, { en: "", ar: "زيتون" }, { en: "Fig" }, {}, { en: 3, ar: null }])).toEqual([]);
  });
});

describe("taskSources", () => {
  const words = [
    { term: "kaolin", word: "كاولان", at, kind: "product" as const },
    { term: "pruning", word: "زبيرة", at, kind: "operation" as const },
    { term: "olive fly", word: "ذبانة الزيتون", at },
    { term: "olive", word: "الزيتونة", at, kind: "plant" as const },
  ];
  const mark = (text: string, corrections = [] as Array<{ term: string; word: string; at: string }>, names = [olive]) => {
    const sources = narrowSources([text], taskSources(corrections, words, names));
    return draw(annotate(text, sources));
  };
  it("shows the four kinds and holds operations, others and unlabelled terms back", () => {
    expect(TASK_KINDS).toEqual(["plant", "pest", "product", "tool"]);
    expect(mark("Winter pruning: spray kaolin.")).toBe("Winter pruning: spray kaolin (كاولان).");
  });
  it("does not mark a plant's name inside a longer term it does not show", () => {
    expect(mark("Scout for olive fly on the olive.")).toBe("Scout for olive fly on the olive (زيتون).");
    expect(mark("Scout for olive fly.")).toBe("Scout for olive fly.");
  });
  it("takes the profile's Arabic name over the app-wide word, and the grower's correction over both", () => {
    expect(mark("Pick the olives.")).toBe("Pick the olives (زيتون).");
    expect(mark("Pick the olives.", [{ term: "olive", word: "زيتونة", at }])).toBe("Pick the olives (زيتونة).");
    expect(mark("Pick the olives.", [{ term: "olive", word: "", at }])).toBe("Pick the olives.");
    expect(mark("Pick the olives.", [], [])).toBe("Pick the olives (الزيتونة).");
  });
  it("marks a named plant on another species' card", () => {
    expect(mark("Keep fig trees 6 m away.", [], [olive, fig])).toBe("Keep fig trees (كرموس) 6 m away.");
  });
  it("shows a correction once its term's kind is known, from itself or from the app-wide list", () => {
    expect(mark("Hang the traps.", [{ term: "trap", word: "مصيدة", at }])).toBe("Hang the traps.");
    const sources = narrowSources(["Hang the traps."], taskSources([{ term: "trap", word: "مصيدة", at }], [{ term: "traps", word: "", at, kind: "tool" }], []));
    expect(draw(annotate("Hang the traps.", sources))).toBe("Hang the traps (مصيدة).");
  });
  it("is empty with nothing known", () => {
    expect(taskSources([], [], [])).toEqual([]);
  });
});

describe("taskTexts", () => {
  it("lists titles and instructions that are not empty", () => {
    expect(taskTexts([{ title: "Prune", instruction: "Open the centre." }, { title: "Water", instruction: "" }, { title: "Log", instruction: null }])).toEqual(["Prune", "Open the centre.", "Water", "Log"]);
  });
});
```

- [ ] **Step 2: Run** `npx vitest run tests/task-derja.test.ts tests/derja.test.ts` — FAIL.
- [ ] **Step 3: Implement.**
- [ ] **Step 4: Run** the two files, `npm test`, `npm run typecheck`, `npm run lint` — PASS.

---

### Task 3: Claude labels the kind

**Files:** Modify `prompts/diagnose.schema.json`, `prompts/derja.schema.json`, `prompts/diagnose.md`, `prompts/derja.md`. Tests: `tests/diagnose.test.ts`, `tests/derja-route.test.ts`, `tests/derja-server.test.ts`, `tests/derja-handler.test.ts`.

No route code changes: both routes clean the terms with `cleanTerms` (which now keeps the kind), store them, and pass them to `extendWords`, whose "nothing new" test compares entries by identity and so sees a filled kind.

- The item of `terms` in both schemas becomes:

```json
{ "type": "object", "properties": { "term": { "type": "string" }, "derja": { "type": "string" }, "kind": { "type": "string", "enum": ["plant", "pest", "product", "tool", "operation", "other"] } }, "required": ["term", "derja", "kind"], "additionalProperties": false }
```

- Both prompts gain one rule after the `derja` rule (wording may be tightened; every point stays): `kind` says what the term is: `plant` for a plant, a companion or a crop named; `pest` for a pest or a disease; `product` for a product or input that is bought or made and applied (savon noir, compost, kaolin, mulch, a trap bait); `tool` for a tool or a piece of equipment (a pruning saw, a sprayer, a sticky band); `operation` for an action (pruning, spraying, watering, grafting); `other` for anything else. One kind per term; when a term names a thing used in an action ("kaolin spray"), the kind is the thing's.

- [ ] **Step 1: Update and add tests** (they fail first):
  - `tests/diagnose.test.ts` "the diagnose schema": the expected item is the object above; retitle "requires terms of { term, derja, kind }, nothing else". `tests/derja-route.test.ts` compares the two schemas' items and needs only its title changed.
  - Both prompt tests: the prompt names all six kinds (`for (const k of KINDS) expect(prompt).toContain(k)`).
  - `tests/derja-route.test.ts` "the row the route stores": a term with `kind: "product"` keeps it in `row.value.terms`; one with `kind: "x"` is stored without a kind.
  - `tests/derja-server.test.ts`, new describe "extendWords and kinds (Phase 18)": a row holding `{ term: "kaolin", word, at }` and a call listing kaolin with `kind: "product"` writes once and the stored entry has the kind and the old word; the same call again makes no write (count through `onQuery`, as "writes nothing when nothing is new" does); a term with an empty word and a kind is stored with `word: ""`.
  - `tests/derja-handler.test.ts`: give its `TERMS` fixture kinds and assert they are in the stored row and the reply.
- [ ] **Step 2: Run** those four files — FAIL on the schema and prompt assertions.
- [ ] **Step 3: Edit** the two schemas and the two prompts.
- [ ] **Step 4: Run** the four files — PASS.

---

### Task 4: The data layer, the kept copy and the switch

**Files:** Modify `src/types.ts` (`TaskWithPlant`), `src/lib/db.ts`, `src/lib/offline.ts`, `src/lib/taskDerja.ts`, `src/components/derja/DerjaWords.tsx`. Tests: `tests/db.test.ts`, `tests/offline.test.ts`, `tests/task-derja.test.ts`.

**Interfaces — produces:**

```ts
// src/types.ts
export interface TaskWithPlant extends Task {
  plant: (Pick<Plant, "id" | "tag" | "site" | "zone" | "quantity"> & { species?: { id: string; common_names: SpeciesNames | null } | null }) | null;
}
// src/lib/db.ts
export async function saveCorrection(term: string, word: string, at?: string, kind?: DerjaKind): Promise<Correction[]>;
// listDueTasks selects "*, plant:plants(id, tag, site, zone, quantity, species:species(id, common_names))"; listAllTasks keeps TASK_WITH_PLANT.
// src/lib/offline.ts
export const DERJA_COPY_KEY = "plantcare.derja";
export interface DerjaCopy { corrections: Correction[]; words: AppWord[]; at: number }
export function keepDerja(copy: DerjaCopy): void;
export function recallDerja(): DerjaCopy | null;       // null when absent or not an object with two arrays; the lists go through readCorrections and readWords
// src/lib/taskDerja.ts
export const TASK_DERJA_KEY = "plantcare.taskDerja";
export function taskDerjaOn(): boolean;                // true unless the stored value is "off"; true when localStorage throws
export function storeTaskDerja(on: boolean): boolean;  // removes the key for on, stores "off" for off; false when localStorage throws
/** The names of the species among a list of tasks, one entry per species. */
export function namesOf(tasks: Array<{ plant?: { species?: { id: string; common_names: SpeciesNames | null } | null } | null }>): SpeciesNames[];
```

`SpeciesNames` moves to `src/types.ts` (re-exported from `taskDerja.ts`). `DerjaWords` calls `saveCorrection(row.key, draft, undefined, row.kind ?? undefined)`.

- [ ] **Step 1: Write the failing tests.**
  - `tests/db.test.ts`, in the Phase 16 describe: `saveCorrection("Kaolin", "كاولان", AT, "product")` stores the kind; saving the same term again without a kind keeps it. A new case for `listDueTasks`: with a species row holding `common_names` and a plant of it with a due task, the returned row has `plant.species.common_names.ar`; a task whose plant has no species row has `plant.species` null or undefined and nothing throws. (If `tests/mockdb.ts` cannot resolve a nested `species:species(...)` inside `plant:plants(...)`, extend the mock's embed handling in the same step; say so in the ledger.)
  - `tests/offline.test.ts`, new describe "the kept derja words (Phase 18)": `keepDerja` then `recallDerja` round-trips cleaned lists and the time; nothing stored gives null; `"x"`, `[]` and `{ corrections: 3 }` under the key give null; an entry with an invalid kind comes back without it.
  - `tests/task-derja.test.ts`: with `vi.stubGlobal("localStorage", …)` as `tests/offline.test.ts` does: `taskDerjaOn()` is true by default, false after `storeTaskDerja(false)`, true again after `storeTaskDerja(true)` (the key is gone); with a `localStorage` whose methods throw, `taskDerjaOn()` is true and `storeTaskDerja(false)` is false. `namesOf`: two tasks of one species give one entry; a plant without species, a null plant and a species with null names give none (Review Focus 1).
- [ ] **Step 2: Run** `npx vitest run tests/db.test.ts tests/offline.test.ts tests/task-derja.test.ts` — FAIL.
- [ ] **Step 3: Implement.** `keepDerja`/`recallDerja` use the private `read`/`write` helpers of `offline.ts`, beside `keepWeather`.
- [ ] **Step 4: Run** the three files, `npm run typecheck` — PASS.

---

### Task 5: The hook keeps the words; the cards draw them

**Files:** Modify `src/lib/useDerja.ts`, `src/components/TaskCard.tsx`, `src/screens/today/BatchCard.tsx`, `src/screens/TodayScreen.tsx`, `src/components/derja/ProfileDerja.tsx`, `src/screens/PlantScreen.tsx`.

No component test harness exists; the rules were made pure in Tasks 1, 2 and 4. This task is verified by the typecheck and in the browser (Step 5).

**Interfaces — produces:**

```ts
// src/lib/useDerja.ts
export function useDerja(opts: { speciesId?: string | null; enabled?: boolean; kept?: boolean; reloadKey?: number }): DerjaView;
// src/components/TaskCard.tsx and src/screens/today/BatchCard.tsx: one more optional prop
sources?: WordSource[];
// src/components/derja/ProfileDerja.tsx: one more optional prop and one more value in the render prop
taskTexts?: string[];
children: (derja: { card: …; fetching: boolean; taskWords: WordSource[] }) => ReactNode;
```

Behaviour:

- `useDerja`: every successful read calls `keepDerja({ corrections, words, at: Date.now() })` (all screens). With `kept: true`: the first state comes from `recallDerja()` when there is one, so the lists are filled before any read; without a session (`enabled` true, no session) the status is `"ready"` with the kept lists when there is a copy, else `"off"`; a failed first read keeps the kept lists and the status `"ready"` (no retry line is shown anywhere on Today). `reloadKey` is one more dependency of the read effect. `enabled: false` reads nothing and returns empty lists, kept or not.
- `TaskCard` and `BatchCard`: a module constant `const PLAIN: WordSource[] = []`; the title and the instruction are drawn as `<DerjaText text={…} sources={sources ?? PLAIN} />`. The explicit `sources` matters: on a plant's page the card sits inside the profile's `DerjaSources` provider, and without the prop it would take the profile's words, operations included. In `BatchCard` the coming-days prefix stays plain: `{coming ? `${weekdayDate(batch.day)} · ` : ""}` then the job, which goes through `DerjaText` only when it is a stored title (`!round`); the `aria-label` keeps the plain string.
- `TodayScreen`: `const on = taskDerjaOn()` (read once per mount with `useState(taskDerjaOn)`); `const derja = useDerja({ kept: true, reloadKey: attempt, enabled: on })`; `const taskWords = useMemo(() => (on ? narrowSources(taskTexts(shown), taskSources(derja.corrections, derja.words, namesOf(shown))) : []), [on, shown, derja.corrections, derja.words])`, where `shown` is the list the screen was loaded with (`loaded?.tasks`, a stable reference between loads; not the per-render `applied.tasks`). Pass `sources={taskWords}` to the `TaskCard` and the `BatchCard` in `card()`. Toasts are untouched.
- `ProfileDerja`: `taskWords = useMemo(() => (derja.status === "off" || !taskDerjaOn() ? [] : narrowSources(taskTexts ?? [], taskSources(derja.corrections, derja.words, [species.common_names]))), […])`, handed out in the render prop. `PlantScreen` passes `taskTexts={taskTexts(tasks ?? [])}` (memoised) and gives each Calendar-tab `TaskCard` `sources={taskWords}`; the comment at 451-452 is rewritten (task cards carry the named things, the past diagnoses stay plain). `SpeciesScreen` passes nothing and ignores `taskWords`.

- [ ] **Step 1:** `useDerja` options and the keeping.
- [ ] **Step 2:** `TaskCard` and `BatchCard`.
- [ ] **Step 3:** `TodayScreen`.
- [ ] **Step 4:** `ProfileDerja` and `PlantScreen`.
- [ ] **Step 5: Verify in the browser** on the mock harness (`.claude/launch.json` → `ask-mock`; files in `node_modules/.cache/ask-mock/`, outside the repository). Copy the newest `supabase-p*.ts` to the next number and point `vite.config.ts` at it; make the mock's `plants(...)` embed answer `species(id, common_names)`; give the `derja:words` row kinds (a product, a tool, a pest, an operation, one entry without a kind, one with an empty word and a kind) and make some task titles and instructions name them and the plant. At 375 px, reading the page text and one screenshot of Today:
  - a task card and a batch card show the plant's Arabic name, a product and a tool; "pruning" and "watering" show none; the unlabelled term shows none; a watering reads "… (40 L)" untouched; the coming-days prefix is plain;
  - the plant's Calendar tab: the task cards show named things only while the care rules below still show "pruning";
  - toasts after Done, the journal, the map popup: no Arabic;
  - `mock.offline`, then reload the page: Today's cards still show the words (the kept copy); clear `plantcare.derja` and reload offline: the cards are plain and no message shows;
  - correct a product's word on the species page, go back to Today: the card shows the new word;
  - `localStorage.setItem("plantcare.taskDerja", "off")` and reload: Today's cards and the Calendar tab's task cards are plain, the profile tabs keep their words.
- [ ] **Step 6: Run** `npm run typecheck`, `npm run lint`, `npm test` — PASS.

---

### Task 6: The switch in Settings

**Files:** Modify `src/screens/SettingsScreen.tsx`, `src/i18n/en.ts`, `src/i18n/fr.ts`.

- A card `TaskDerjaCard`, placed after `LanguageCard`, in the form of `LanguageCard` (`CardHead`, a body line, a `segmented` radio group of two): On, Off. It reads `taskDerjaOn()` into state and calls `storeTaskDerja`; a `false` return shows the save-failed banner as the language card does. No reload: Today reads the switch when it mounts.
- Strings under `t.settings.taskDerja` (English exact; French by the builder): `title: "Derja words on task cards"`, `body: "Shows the Tunisian word beside the plants, pests, products and tools a task names. Kept on this phone."`, `on: "On"`, `off: "Off"`, `saveFailed: "The choice could not be kept on this phone"`.

- [ ] **Step 1:** the card and the strings.
- [ ] **Step 2:** in the browser: the card shows On; Off makes Today plain after going back to it; On restores the words; the profile tabs are unaffected.
- [ ] **Step 3: Run** `npm run typecheck`, `npm run lint`.

---

### Task 7: Version, documents, the checks, one commit

**Files:** Create `PHASE18.md` (the form of `PHASE17.md`). Modify the version (`npm version 0.18.0 --no-git-tag-version`, `src/version.ts`), the Settings phase card (both languages), `README.md`, `docs/USER-GUIDE.md`, `docs/DECISIONS.md`, `CLAUDE.md`.

- [ ] **Step 1: `PHASE18.md`:** the plan in prose; ★ setup: Reload after the deploy, nothing else; the build list; the seven phone tests of the spec in order; the usage check (a few tokens per term in the two calls, nothing else).
- [ ] **Step 2: The guide:** chapter 4 (Today: what the cards now show, which kinds, the plant's name, without a connection, what stays plain), chapter 6 (the task cards on the Calendar tab; the quantity's parentheses; where a word is corrected), chapter 10 (the switch), chapter 12 (the words are kept on the phone), the header's version. Remove the sentences of Phase 17 that say task cards carry none.
- [ ] **Step 3: `docs/DECISIONS.md`**, a new first entry for Phase 18: the fifteen decisions by reference to the spec; why a kind and where it lives (the app-wide list, also for terms with no word of Claude's); placeholders instead of removal; plant names from the profile and the exception to "one word per term"; the quantity rule, which also changes diagnoses and profile tabs; the kept copy written by every good read; the plant page marking its own species' name only; no component tests; every ruling of the build.
- [ ] **Step 4: `CLAUDE.md`:** the phases line and the latest milestone; `src/lib` (`taskDerja`); the Phase 17 paragraph's "task cards … carry none" corrected and one paragraph for Phase 18 (kinds, the four shown, plant names, the kept copy `plantcare.derja`, the switch `plantcare.taskDerja`); the diagnose and derja lines (`{ term, derja, kind }`); the tests list; `PHASE1.md … PHASE18.md`.
- [ ] **Step 5: Run the four checks** and read their output.
- [ ] **Step 6: Commit** on the branch after checking `git status` shows only this feature's files:

```bash
git commit -m "Phase 18: derja words on task cards (0.18.0)"
```

To tell Mohamed at the end: until a species is refreshed or a diagnosis made after the deploy, the cards show plant names only, since the words stored so far have no kind.
