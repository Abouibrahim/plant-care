import { describe, expect, it } from "vitest";
import { problemResult, rephotoTask, shortCause } from "../src/lib/diagnosis";

const base = {
  summary: "s",
  likely_causes: [{ cause: "Black scale (النمرة) on twigs", kind: "pest", likelihood: 0.8, evidence: "" }],
  checks_to_do: [],
  organic_treatment: "",
  prevention: "",
  urgency: "this_week",
  rephotograph_in_days: 7,
};

describe("problemResult and terms", () => {
  it("keeps the cleaned terms of a stored diagnosis", () => {
    const r = problemResult({ ...base, terms: [{ term: "Black scale", derja: " النمرة " }, { term: "copper", derja: "cuivre" }, 3] });
    expect(r?.terms).toEqual([
      { term: "Black scale", derja: "النمرة" },
      { term: "copper", derja: "" },
    ]);
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
  it("a re-photograph follow-up copies its check without the Arabic (0.17.1)", () => {
    const d = problemResult({
      ...base,
      likely_causes: [{ cause: "Leaf scorch", kind: "salinity", likelihood: 0.7, evidence: "" }],
      checks_to_do: ["تحقق", "Check the twigs for scale (النمرة)."],
    })!;
    expect(rephotoTask(d, "OLV-1").instruction).toBe("Check the twigs for scale. Take a new photo of the same part from the plant's screen (Diagnose) to judge the treatment.");
  });
});
