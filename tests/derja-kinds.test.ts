// Phase 18: every term has a kind (plant, pest, product, tool, operation, other), carried by the
// lists Claude returns, the app-wide list and the grower's corrections.
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
    expect(
      cleanTerms([
        { term: "Kaolin", derja: "كاولان", kind: "product" },
        { term: "saw", derja: "", kind: "weapon" },
        { term: "mulch", derja: "تبن" },
      ]),
    ).toEqual([
      { term: "Kaolin", derja: "كاولان", kind: "product" },
      { term: "saw", derja: "" },
      { term: "mulch", derja: "تبن" },
    ]);
    expect(
      readCorrections([
        { term: "kaolin", word: "كاولان", at, kind: "product" },
        { term: "saw", word: "", at, kind: 3 },
      ]),
    ).toEqual([
      { term: "kaolin", word: "كاولان", at, kind: "product" },
      { term: "saw", word: "", at },
    ]);
    expect(
      readWords([
        { term: "kaolin", word: "كاولان", at, kind: "product" },
        { term: "saw", word: "", at, kind: "tool" },
        { term: "oil", word: "", at },
        { term: "mulch", word: "تبن", at },
      ]),
    ).toEqual([
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
    const terms = [
      { term: "yellow traps", derja: "", kind: "tool" as const },
      { term: "Saw", derja: "منشار", kind: "tool" as const },
      { term: "leaf", derja: "" },
    ];
    expect(withWords([], terms, corrections, at)).toEqual([
      { term: "yellow traps", word: "", at, kind: "tool" },
      { term: "saw", word: "", at, kind: "tool" },
    ]);
  });
  it("fills an empty word with a later first word, unless the grower corrected the term", () => {
    const list = [
      { term: "yellow traps", word: "", at, kind: "tool" as const },
      { term: "saw", word: "", at, kind: "tool" as const },
    ];
    const terms = [
      { term: "yellow trap", derja: "مصيدة", kind: "tool" as const },
      { term: "saw", derja: "منشار", kind: "tool" as const },
    ];
    const next = withWords(list, terms, [{ term: "saw", word: "منشار", at }], later);
    expect(next).toEqual([{ term: "yellow traps", word: "مصيدة", at, kind: "tool" }, list[1]]);
    expect(next[1]).toBe(list[1]);
  });
  it("adds nothing for a term with neither a kind nor a word, as before", () => {
    expect(withWords([], [{ term: "copper", derja: "" }], [], at)).toEqual([]);
  });
});

describe("a source's kind", () => {
  it("comes from the listed term, else the app word, else the correction", () => {
    const s = wordSources(
      [
        { term: "Kaolin", derja: "كاولان", kind: "product" },
        { term: "pruning", derja: "زبيرة" },
      ],
      [
        { term: "saw", word: "منشار", at, kind: "tool" },
        { term: "ash", word: "رماد", at },
      ],
      [
        { term: "pruning", word: "زبيرة", at, kind: "operation" },
        { term: "olive fly", word: "ذبانة", at, kind: "pest" },
        { term: "yellow traps", word: "", at, kind: "tool" },
      ],
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

describe("after the review of the branch (Phase 18)", () => {
  it("lets go of entries that only tell a kind before any word of Claude's, at the cap", () => {
    const list = Array.from({ length: 600 }, (_, i) => ({ term: `t${i}x`, word: "كلمة", at: `2026-01-01T00:${String(Math.floor(i / 60)).padStart(2, "0")}:${String(i % 60).padStart(2, "0")}Z` }));
    const terms = Array.from({ length: 30 }, (_, i) => ({ term: `k${i}x`, derja: "", kind: "tool" as const }));
    const next = withWords(list, terms, [], later);
    expect(next).toHaveLength(600);
    expect(next.filter((w) => w.word === "")).toHaveLength(0);
    expect(next.some((w) => w.term === "t0x")).toBe(true);
  });
});
