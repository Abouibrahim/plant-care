// Phase 18: the words of a task card. The four kinds shown, the plants' names from their
// profiles, and every other known term held back as a placeholder so it keeps its place.
import { describe, expect, it, vi } from "vitest";
import { annotate, narrowSources, type Piece } from "../src/lib/derja";
import { plantNameTerms, taskSources, taskTexts, TASK_KINDS } from "../src/lib/taskDerja";
import type { AppWord, Correction } from "../src/types";

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
  const words: AppWord[] = [
    { term: "kaolin", word: "كاولان", at, kind: "product" },
    { term: "pruning", word: "زبيرة", at, kind: "operation" },
    { term: "olive fly", word: "ذبانة الزيتون", at },
    { term: "olive", word: "الزيتونة", at, kind: "plant" },
  ];
  const mark = (text: string, corrections: Correction[] = [], names = [olive]) => draw(annotate(text, narrowSources([text], taskSources(corrections, words, names))));

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
    expect(mark("Hang the traps.", [{ term: "trap", word: "مصيدة", at, kind: "tool" }])).toBe("Hang the traps (مصيدة).");
    const sources = narrowSources(["Hang the traps."], taskSources([{ term: "trap", word: "مصيدة", at }], [{ term: "traps", word: "", at, kind: "tool" }], []));
    expect(draw(annotate("Hang the traps.", sources))).toBe("Hang the traps (مصيدة).");
  });
  it("is empty with nothing known", () => {
    expect(taskSources([], [], [])).toEqual([]);
  });
});

describe("taskTexts", () => {
  it("lists titles and instructions that are not empty", () => {
    expect(
      taskTexts([
        { title: "Prune", instruction: "Open the centre." },
        { title: "Water", instruction: "" },
        { title: "Log", instruction: null },
      ]),
    ).toEqual(["Prune", "Open the centre.", "Water", "Log"]);
  });
});

describe("the switch and the names of a list (Phase 18)", () => {
  const memory = () => {
    const map = new Map<string, string>();
    return { getItem: (k: string) => map.get(k) ?? null, setItem: (k: string, v: string) => void map.set(k, String(v)), removeItem: (k: string) => void map.delete(k) };
  };
  const throwing = () => {
    const fail = () => {
      throw new Error("denied");
    };
    return { getItem: fail, setItem: fail, removeItem: fail };
  };

  it("is on by default, off once stored, on again once cleared", async () => {
    vi.stubGlobal("localStorage", memory());
    const { storeTaskDerja, taskDerjaOn, TASK_DERJA_KEY } = await import("../src/lib/taskDerja");
    expect(taskDerjaOn()).toBe(true);
    expect(storeTaskDerja(false)).toBe(true);
    expect(localStorage.getItem(TASK_DERJA_KEY)).toBe("off");
    expect(taskDerjaOn()).toBe(false);
    expect(storeTaskDerja(true)).toBe(true);
    expect(localStorage.getItem(TASK_DERJA_KEY)).toBeNull();
    expect(taskDerjaOn()).toBe(true);
    vi.unstubAllGlobals();
  });
  it("reads as on, and reports the failure, when the phone's storage throws", async () => {
    vi.stubGlobal("localStorage", throwing());
    const { storeTaskDerja, taskDerjaOn } = await import("../src/lib/taskDerja");
    expect(taskDerjaOn()).toBe(true);
    expect(storeTaskDerja(false)).toBe(false);
    vi.unstubAllGlobals();
  });
  it("lists each species' names once, and none for a plant kept without them", async () => {
    const { namesOf } = await import("../src/lib/taskDerja");
    const olive = { id: "s1", common_names: { en: "Olive", ar: "زيتون" } };
    expect(
      namesOf([
        { plant: { species: olive } },
        { plant: { species: olive } },
        { plant: { species: { id: "s2", common_names: null } } },
        { plant: { species: null } },
        { plant: {} },
        { plant: null },
        {},
      ]),
    ).toEqual([{ en: "Olive", ar: "زيتون" }]);
  });
});

describe("after the review of the branch (Phase 18)", () => {
  const oliveTree = { en: "Olive tree", ar: "زيتون" };
  const flyNoKind: AppWord[] = [{ term: "olive fly", word: "ذبانة", at }];
  const flyPest: AppWord[] = [{ term: "olive fly", word: "ذبانة", at, kind: "pest" }];
  const mark = (text: string, corrections: Correction[], words: AppWord[], names: Array<{ en: string; ar: string }>) => draw(annotate(text, narrowSources([text], taskSources(corrections, words, names))));

  it("keeps a plant's name out of every mention of a longer term, not only the first", () => {
    const text = "Scout for olive fly. Hang olive fly traps.";
    expect(mark(text, [], flyNoKind, [oliveTree])).toBe(text);
    expect(mark(text, [], flyPest, [oliveTree])).toBe("Scout for olive fly (ذبانة). Hang olive fly traps.");
    expect(mark("Scout for olive fly on the olive; olive fly again.", [], flyPest, [oliveTree])).toBe("Scout for olive fly (ذبانة) on the olive (زيتون); olive fly again.");
  });
  it("draws one plant's word once in a text, whatever forms of its name the text uses", () => {
    expect(mark("Keep fig trees 6 m away; the fig roots spread. Common fig too.", [], [], [fig])).toBe("Keep fig trees (كرموس) 6 m away; the fig roots spread. Common fig too.");
  });
  it("applies a correction of a plant's name to every form of that name", () => {
    const text = "Water the olive tree (40 L). Mulch the olive.";
    expect(mark(text, [], [], [oliveTree])).toBe("Water the olive tree (زيتون) (40 L). Mulch the olive.");
    expect(mark(text, [{ term: "olive", word: "", at }], [], [oliveTree])).toBe(text);
    expect(mark(text, [{ term: "olive", word: "زيتونة", at }], [], [oliveTree])).toBe("Water the olive tree (زيتونة) (40 L). Mulch the olive.");
  });
});
