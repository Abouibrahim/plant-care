// POST /api/derja (Phase 17): the request, the text Claude reads, the row the route stores, the
// schema and the prompt.
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { describeProfile, parseDerjaRequest, pestsWithPrevention, speciesWordsRow } from "../api/derja.js";
import type { Species } from "../src/types";

const ID = "5b1e9a20-1c2d-4e3f-8a9b-0c1d2e3f4a5b";
const AT = "2026-11-12T08:00:00.000Z";

const species = {
  id: ID,
  scientific_name: "Olea europaea",
  cultivar: null,
  common_names: { en: "Olive", fr: "Olivier", ar: "زيتون", ar_latin: "zitoun" },
  plant_type: "tree",
  lifecycle: "perennial",
  foliage: "evergreen",
  layer: "canopy",
  site_fit: { rating: "good", note: "Fits." },
  water: { need: "low", drought_tolerance: "high", summary: "Rare waterings.", stress_signs: "Curl.", overwatering_signs: "Yellowing." },
  sun: { exposure: "full_sun", heat_tolerance: "high", summer_shade_needed: false, note: "None." },
  salinity_tolerance: { level: "moderate", note: "Leach." },
  climate_note: "Mild.",
  care_calendar: [{ type: "prune", months: [2], age: "any", title: "Prune the olive", instruction: "Open the centre.", every_days: null, litres: null, lead_days: 7 }],
  pests: [{ name_en: "Olive fly", name_fr: "Mouche de l'olive", months: [9], symptoms: "Stung fruit.", organic_treatment: "Kaolin spray.", prevention: "Hang yellow traps." }],
  companions: { good: ["Fava bean"], bad: [], root_warnings: [] },
  uses: { edible_parts: "Fruit.", preparation: "Brine.", storage: "Jars.", harvest_cues: "Violet." },
  toxicity: { humans: "none", chickens: "none", goats: "none", dogs_cats: "none", note: "Safe." },
} as unknown as Species;

describe("parseDerjaRequest", () => {
  it("takes a species id and the time the app asked", () => {
    expect(parseDerjaRequest({ species_id: ID, asked_at: AT })).toEqual({ species_id: ID, asked_at: AT });
  });
  it("names what is wrong", () => {
    expect(parseDerjaRequest({ species_id: "x", asked_at: AT })).toBe("species_id must be a UUID");
    expect(parseDerjaRequest({ species_id: ID, asked_at: "yesterday" })).toBe("asked_at must be an ISO time");
    expect(parseDerjaRequest(null)).toBe("species_id must be a UUID");
  });
});

describe("the text Claude reads", () => {
  it("gives each pest's prevention, which the shared pest line leaves out", () => {
    expect(pestsWithPrevention(species)).toContain("Organic treatment: Kaolin spray. Prevention: Hang yellow traps.");
    expect(pestsWithPrevention({ ...species, pests: [] })).toBe("The profile lists no pests or diseases for this species.");
  });
  it("holds the profile, the grower's glossary when there is one, and ends with the instruction", () => {
    const withGlossary = describeProfile(species, [{ term: "pruning", word: "زبيرة", at: AT }]);
    expect(withGlossary).toContain("Care calendar of this species");
    expect(withGlossary).toContain("Companions:");
    expect(withGlossary).toContain("a glossary for the terms that belong in this profile; use these exactly:\n- pruning: زبيرة");
    expect(withGlossary.endsWith("List the key terms of this profile with the word said for each in Tunisian.")).toBe(true);
    expect(describeProfile(species, [])).not.toContain("glossary");
  });
});

describe("the row the route stores", () => {
  it("is keyed by the species and holds at most 40 cleaned terms", () => {
    const terms = [{ term: "Kaolin", derja: "كاولان (kaolin)" }, ...Array.from({ length: 44 }, (_, i) => ({ term: `term${i}x`, derja: "كلمة" }))];
    const row = speciesWordsRow({ species_id: ID, asked_at: AT }, terms, "2026-11-12T08:01:00.000Z");
    expect(row.key).toBe(`derja:species:${ID}`);
    expect(row.value.terms).toHaveLength(40);
    expect(row.value.terms[0]).toEqual({ term: "Kaolin", derja: "" });
    expect([row.value.at, row.value.asked_at]).toEqual(["2026-11-12T08:01:00.000Z", AT]);
  });
  it("stores an empty list for anything that is not one", () => {
    expect(speciesWordsRow({ species_id: ID, asked_at: AT }, "x", AT).value.terms).toEqual([]);
  });
});

describe("the derja schema and prompt", () => {
  const schema = JSON.parse(readFileSync("prompts/derja.schema.json", "utf8")) as { required: string[]; additionalProperties: boolean; properties: { terms: { items: unknown } } };
  const diagnose = JSON.parse(readFileSync("prompts/diagnose.schema.json", "utf8")) as { properties: { terms: { items: unknown } } };
  const prompt = readFileSync("prompts/derja.md", "utf8");
  it("returns terms of { term, derja } and nothing else", () => {
    expect(schema.required).toEqual(["terms"]);
    expect(schema.additionalProperties).toBe(false);
    expect(schema.properties.terms.items).toEqual(diagnose.properties.terms.items);
  });
  it("asks for up to 40 terms, an empty word rather than a guess, and no Arabic outside derja", () => {
    expect(prompt).toMatch(/40/);
    expect(prompt).toMatch(/empty string/i);
    expect(prompt).toMatch(/no Arabic letters/i);
    expect(prompt).toMatch(/never list .* only because it is in the grower's list/i);
    expect(/\p{Script=Arabic}/u.test(prompt)).toBe(false);
  });
});
