// Phase 17: the app-wide words, a species' word list, the three sources of a word and the rows of
// a card; and the tidy of stripArabic left over from Phase 16's review.
import { describe, expect, it } from "vitest";
import { cardRows, cleanTerms, narrowSources, readSpeciesWords, readWords, speciesWordsKey, stripArabic, withoutCorrected, withWords, wordSources } from "../src/lib/derja";

const at = "2026-11-12T08:00:00Z";

describe("stripArabic, tidy (Phase 17)", () => {
  it("leaves no separator, mark or empty parenthesis behind", () => {
    expect(stripArabic("Sooty mould (الفحمة, el-fahma)")).toBe("Sooty mould (el-fahma)");
    expect(stripArabic("Black scale (النمرة · Saissetia oleae)")).toBe("Black scale (Saissetia oleae)");
    expect(stripArabic("Scale (النمرة / الفحمة)")).toBe("Scale");
    expect(stripArabic("Sooty mould - الفحمة")).toBe("Sooty mould");
    expect(stripArabic(`Sooty mould (${String.fromCharCode(0x200f)}الفحمة)`)).toBe("Sooty mould");
    expect(stripArabic(`Sooty mould (${String.fromCharCode(0x2067)}الفحمة${String.fromCharCode(0x2069)})`)).toBe("Sooty mould");
    expect(stripArabic("Black scale (Saissetia oleae), on twigs")).toBe("Black scale (Saissetia oleae), on twigs");
  });
});

describe("the app-wide words (Phase 17)", () => {
  const old = { term: "pruning", word: "زبيرة", at: "2026-11-01T00:00:00Z" };
  it("adds a new term's first word and keeps an existing entry", () => {
    const next = withWords(
      [old],
      [
        { term: "Pruning", derja: "تقليم" },
        { term: "Mulch", derja: "تبن" },
        { term: "copper", derja: "" },
      ],
      [],
      at,
    );
    expect(next).toEqual([old, { term: "mulch", word: "تبن", at }]);
  });
  it("pairs across the plural and skips a term the grower corrected or cleared", () => {
    const corrections = [
      { term: "aphid", word: "ڨمل", at },
      { term: "scale", word: "", at },
    ];
    const terms = [
      { term: "Aphids", derja: "ڨمل" },
      { term: "scale", derja: "نمرة" },
      { term: "prunings", derja: "زبيرة" },
    ];
    expect(withWords([], terms, corrections, at)).toEqual([{ term: "prunings", word: "زبيرة", at }]);
    expect(withWords([old], [{ term: "prunings", derja: "تقليم" }], [], at)).toEqual([old]);
  });
  it("drops the oldest past 600", () => {
    const list = Array.from({ length: 600 }, (_, i) => ({
      term: `t${i}x`,
      word: "كلمة",
      at: `2026-01-01T00:${String(Math.floor(i / 60)).padStart(2, "0")}:${String(i % 60).padStart(2, "0")}Z`,
    }));
    const next = withWords(list, [{ term: "new", derja: "جديد" }], [], at);
    expect(next).toHaveLength(600);
    expect(next.some((w) => w.term === "t0x")).toBe(false);
    expect(next.some((w) => w.term === "new")).toBe(true);
  });
  it("reads a stored list, and nothing from an unexpected value", () => {
    expect(readWords([old, { term: "Prunings", word: "تقليم", at }, { term: "oil", word: "", at }, { term: "x", word: "latin", at }, 3])).toEqual([old]);
    expect(readWords({ a: 1 })).toEqual([]);
    expect(readWords(null)).toEqual([]);
  });
});

describe("a species' word list (Phase 17)", () => {
  it("has its own settings key", () => {
    expect(speciesWordsKey("abc")).toBe("derja:species:abc");
  });
  it("reads the row, cleans the terms and caps them at 40", () => {
    const terms = Array.from({ length: 45 }, (_, i) => ({ term: `term${i}x`, derja: "كلمة" }));
    expect(readSpeciesWords({ terms, at: "a", asked_at: "b" })?.terms).toHaveLength(40);
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
  const app = [
    { term: "pruning", word: "زبيرة", at },
    { term: "mulch", word: "تبن", at },
    { term: "neem oil", word: "زيت النيم", at },
  ];
  it("puts the correction first, then the app-wide word, then the call's own", () => {
    const s = wordSources(
      [
        { term: "Pruning", derja: "تقليم" },
        { term: "Mulch", derja: "" },
        { term: "copper", derja: "نحاس" },
        { term: "sulphur", derja: "" },
      ],
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
    const neem = s.filter((x) => x.label === "neem oil");
    expect(neem).toHaveLength(1);
    expect([neem[0].key, neem[0].word, neem[0].state, neem[0].claudeWord, neem[0].listed]).toEqual(["neem oil", "", "none", "زيت النيم", false]);
  });
  it("still works with two arguments", () => {
    expect(wordSources([{ term: "copper", derja: "نحاس" }], [])).toHaveLength(1);
  });
});

describe("the rows of a card (Phase 17)", () => {
  const sources = wordSources(
    [
      { term: "copper", derja: "نحاس" },
      { term: "sulphur", derja: "" },
      { term: "kaolin", derja: "كاولان" },
    ],
    [
      { term: "neem oil", word: "", at },
      { term: "ash", word: "", at },
    ],
    [
      { term: "neem oil", word: "زيت النيم", at },
      { term: "pruning", word: "زبيرة", at },
    ],
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

describe("after the review of the branch (Phase 17)", () => {
  it("leaves a text without Arabic as it is: a minus sign or a slash inside parentheses stays", () => {
    expect(stripArabic("Frost damage (-2 °C)")).toBe("Frost damage (-2 °C)");
    expect(stripArabic("Boron deficiency (B-)")).toBe("Boron deficiency (B-)");
    expect(stripArabic("Leaf spot (Alternaria) -")).toBe("Leaf spot (Alternaria) -");
    expect(stripArabic("  two   spaces ")).toBe("two spaces");
  });
  it("keeps the grower's own word out of the list a call stores: the word Claude echoed is his, not Claude's", () => {
    const terms = [
      { term: "Aphids", derja: "ڨمل" },
      { term: "copper", derja: "نحاس" },
      { term: "scale", derja: "نمرة" },
    ];
    const corrections = [
      { term: "aphid", word: "ڨمل", at },
      { term: "scale", word: "", at },
    ];
    expect(withoutCorrected(terms, corrections)).toEqual([
      { term: "Aphids", derja: "" },
      { term: "copper", derja: "نحاس" },
      { term: "scale", derja: "" },
    ]);
    expect(withoutCorrected(terms, null)).toEqual(terms);
    expect(withoutCorrected(terms, [])).toEqual(terms);
  });
});
