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

describe("stripArabic, Arabic in the middle of a name (0.17.1)", () => {
  it("takes the marks that set the Arabic apart with it", () => {
    expect(stripArabic("Black scale – النمرة – on twigs")).toBe("Black scale on twigs");
    expect(stripArabic("Sooty mould, الفحمة, on leaves")).toBe("Sooty mould on leaves");
    expect(stripArabic("Black scale – النمرة on twigs")).toBe("Black scale on twigs");
  });
  it("takes runs with only marks between them as one", () => {
    expect(stripArabic("Sooty mould – الفحمة / النمرة – on leaves")).toBe("Sooty mould on leaves");
    expect(stripArabic("Black scale, النمرة; ڨمل, on twigs")).toBe("Black scale on twigs");
  });
  it("keeps the mark that belongs to the words after it", () => {
    expect(stripArabic("Olive fly / ذبابة الزيتون, larvae in fruit")).toBe("Olive fly, larvae in fruit");
    expect(stripArabic("Sooty mould الفحمة – on leaves")).toBe("Sooty mould – on leaves");
  });
  it("leaves no mark at the start, no space before a full stop, none inside a parenthesis", () => {
    expect(stripArabic("النمرة – Black scale")).toBe("Black scale");
    expect(stripArabic("Check the twigs for scale (النمرة).")).toBe("Check the twigs for scale.");
    expect(stripArabic("Sooty mould (el-fahma / الفحمة)")).toBe("Sooty mould (el-fahma)");
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
  it("takes mangos and mangoes for one term (0.17.1)", () => {
    const mangos = { term: "mangos", word: "كلمة", at };
    expect(withWords([mangos], [{ term: "Mangoes", derja: "جديد" }], [], at)).toEqual([mangos]);
    expect(readWords([mangos, { term: "mangoes", word: "جديد", at }])).toEqual([mangos]);
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

describe("narrowSources at the caps (0.17.1)", () => {
  it("keeps a term whatever its case, hyphen, apostrophe or plural on the page", () => {
    const page = ["Spray NEEM-OIL at dusk on the Aphid colonies.", "Peacock’s eye spots the leaves; ſooty mould follows the scale.", "Mangos ripen in August."];
    const words = ["neem oil", "aphids", "peacock's eye", "sooty mould", "mangoes", "black scale", "bushes"].map((term) => ({ term, word: "كلمة", at }));
    expect(narrowSources(page, wordSources([], [], words)).map((s) => s.label)).toEqual(["neem oil", "aphids", "peacock's eye", "sooty mould", "mangoes"]);
  });
  it("tries 800 words on a page in milliseconds, without a matcher for each", () => {
    const words = Array.from({ length: 600 }, (_, i) => ({ term: i % 2 ? `leaf${i} curl` : `rot${i}`, word: "كلمة", at }));
    const corrections = Array.from({ length: 200 }, (_, i) => ({ term: `fruit borer${i}`, word: "", at }));
    const sources = wordSources([], corrections, words);
    const page = Array.from({ length: 60 }, () => "Water the young olive every ten days; prune in February and scout for olive fly from June.");
    const start = performance.now();
    expect(narrowSources(page, sources)).toEqual([]);
    expect(performance.now() - start).toBeLessThan(100);
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
