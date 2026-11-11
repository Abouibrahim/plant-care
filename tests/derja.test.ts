import { describe, expect, it } from "vitest";
import {
  annotate,
  cardRows,
  cleanTerms,
  cleanWord,
  MAX_CORRECTIONS,
  normalTerm,
  occurs,
  readCorrections,
  sameTerm,
  stripArabic,
  withCorrection,
  withoutCorrection,
  wordSources,
  type Piece,
} from "../src/lib/derja";

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
    expect(cleanTerms(raw)).toEqual([
      { term: "Sooty mould", derja: "الفحمة" },
      { term: "copper", derja: "" },
    ]);
    expect(cleanTerms(Array.from({ length: 12 }, (_, i) => ({ term: `t${i}x`, derja: "" })))).toHaveLength(8);
  });
  it("keeps the first of two entries that name the same term", () => {
    expect(
      cleanTerms([
        { term: "Aphids", derja: "ڨمل" },
        { term: "aphid", derja: "" },
      ]),
    ).toEqual([{ term: "Aphids", derja: "ڨمل" }]);
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
    const list = [
      { term: "aphid", word: "ڨمل", at: "2026-11-01T00:00:00Z" },
      { term: "copper", word: "نحاس", at: "2026-10-01T00:00:00Z" },
    ];
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

const W = { mould: "الفحمة", scale: "النمرة", copper: "النحاس", hydroxide: "هيدروكسيد", bord: "بوردو", aphid: "ڨمل", oil: "زيت" };
/** Draws pieces the way the screen does, for readable assertions. */
function draw(pieces: Piece[]): string {
  return pieces.map((p) => (p.kind === "text" ? p.text : p.place === "paren" ? ` (${p.word})` : p.place === "lead" ? `${p.word} · ` : ` · ${p.word}`)).join("");
}
const src = (terms: Array<[string, string]>, corrections: Array<[string, string]> = []) =>
  wordSources(
    terms.map(([term, derja]) => ({ term, derja })),
    corrections.map(([term, word], i) => ({ term, word, at: `2026-11-0${9 - i}T00:00:00Z` })),
  );

describe("wordSources", () => {
  it("applies a correction, marks states, appends unlisted corrections", () => {
    const s = src(
      [
        ["Sooty mould", W.mould],
        ["copper", ""],
        ["Aphids", W.aphid],
      ],
      [
        ["sooty mould", "فحمة"],
        ["aphids", ""],
        ["neem oil", W.oil],
      ],
    );
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
    const s = src(
      [["Aphids", ""]],
      [
        ["aphids", "ڨمل"],
        ["aphid", "قمل"],
      ],
    );
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
    const both = src([
      ["copper", W.copper],
      ["copper hydroxide", W.hydroxide],
    ]);
    expect(draw(annotate("Spray copper hydroxide at leaf fall; repeat the copper after rain.", both))).toBe(
      `Spray copper hydroxide (${W.hydroxide}) at leaf fall; repeat the copper (${W.copper}) after rain.`,
    );
    expect(draw(annotate("Spray copper hydroxide.", both))).toBe(`Spray copper hydroxide (${W.hydroxide}).`);
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
    expect(
      draw(
        annotate(
          "Black scale (Saissetia oleae) with sooty mould",
          src([
            ["Black scale", W.scale],
            ["sooty mould", W.mould],
          ]),
        ),
      ),
    ).toBe(`Black scale (${W.scale} · Saissetia oleae) with sooty mould (${W.mould})`);
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
    const pieces = annotate(
      text,
      src([
        ["Black scale", W.scale],
        ["Bordeaux mixture", W.bord],
      ]),
    );
    expect(pieces.map((p) => (p.kind === "text" ? p.text : "")).join("")).toBe(text);
  });
});

describe("occurs, cardRows", () => {
  it("lists every listed source and only the unlisted ones that stand in a text", () => {
    const sources = src(
      [["Bordeaux mixture", W.bord]],
      [
        ["neem oil", W.oil],
        ["sulphur", W.copper],
      ],
    );
    expect(cardRows(["Spray bouillie bordelaise.", "Then neem oil."], sources).map((r) => r.label)).toEqual(["Bordeaux mixture", "neem oil"]);
    expect(occurs("Then neem oils.", "neem oil")).toBe(true);
  });
});

describe("annotate, after the review of the branch", () => {
  it("does not take a common word for the plural term's stem", () => {
    expect(draw(annotate("Do not spray when it will be hot; bees are active.", src([["bees", W.aphid]])))).toBe(`Do not spray when it will be hot; bees (${W.aphid}) are active.`);
    expect(draw(annotate("You can cut the old canes.", src([["canes", W.oil]])))).toBe(`You can cut the old canes (${W.oil}).`);
    expect(draw(annotate("Cut the bush back hard.", src([["bushes", W.oil]])))).toBe(`Cut the bush (${W.oil}) back hard.`);
  });
  it("prefers the term as written over its looser forms", () => {
    expect(draw(annotate("Leave the mulch; remove fallen leaves.", src([["leaves", W.oil]])))).toBe(`Leave the mulch; remove fallen leaves (${W.oil}).`);
  });
  it("keeps a shorter term's word out of a longer term that has no word", () => {
    const sources = src([
      ["copper hydroxide", ""],
      ["copper", W.copper],
    ]);
    expect(draw(annotate("Spray copper hydroxide; repeat the copper after rain.", sources))).toBe(`Spray copper hydroxide; repeat the copper (${W.copper}) after rain.`);
    expect(draw(annotate("Spray copper hydroxide.", sources))).toBe("Spray copper hydroxide.");
  });
});
