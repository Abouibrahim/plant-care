// The prose of each profile tab, as the derja words are placed in it (Phase 17).
import { describe, expect, it } from "vitest";
import { tabTexts } from "../src/lib/profileTexts";
import type { SpeciesProfile } from "../src/types";

const full = {
  site_fit: { rating: "good", note: "Fits the farm." },
  water: { need: "medium", drought_tolerance: "high", summary: "Deep, rare waterings.", stress_signs: "Leaf curl.", overwatering_signs: "Yellow leaves." },
  sun: { exposure: "full_sun", heat_tolerance: "high", summer_shade_needed: false, note: "Whitewash young trunks." },
  salinity_tolerance: { level: "moderate", note: "Leach in winter." },
  climate_note: "No frost risk.",
  care_calendar: [{ type: "prune", months: [2], age: "any", title: "Prune the olive", instruction: "Open the centre with a pruning saw." }],
  pests: [{ name_en: "Olive fly", name_fr: "Mouche de l'olive", months: [9], symptoms: "Stung fruit.", organic_treatment: "Kaolin spray.", prevention: "Pick early." }],
  companions: { good: ["Fava bean"], bad: ["Fennel"], root_warnings: ["Keep figs 6 m away"] },
  uses: { edible_parts: "Fruit.", preparation: "Cure in brine.", storage: "Jars.", harvest_cues: "Green to violet." },
  toxicity: { humans: "none", chickens: "none", goats: "none", dogs_cats: "none", note: "Leaves are safe fodder." },
} as unknown as SpeciesProfile;

describe("tabTexts", () => {
  it("lists each tab's prose in the order it is drawn", () => {
    expect(tabTexts(full)).toEqual({
      needs: ["Fits the farm.", "Deep, rare waterings.", "Leaf curl.", "Yellow leaves.", "Whitewash young trunks.", "Leach in winter.", "No frost risk."],
      calendar: ["Prune the olive", "Open the centre with a pruning saw."],
      health: ["Olive fly", "Stung fruit.", "Kaolin spray.", "Pick early."],
      guild: ["Fava bean", "Fennel", "Keep figs 6 m away", "Fruit.", "Cure in brine.", "Jars.", "Green to violet.", "Leaves are safe fodder."],
    });
  });
  it("leaves the pest's French name out", () => {
    expect(tabTexts(full).health).not.toContain("Mouche de l'olive");
  });
  it("gives empty lists for a profile with nothing in it, or with parts missing", () => {
    const empty = {
      site_fit: { note: "" },
      water: { summary: "", stress_signs: "", overwatering_signs: "" },
      sun: { note: "" },
      salinity_tolerance: { note: "" },
      climate_note: "",
      care_calendar: [],
      pests: [],
      companions: { good: [], bad: [], root_warnings: [] },
      uses: { edible_parts: "", preparation: "", storage: "", harvest_cues: "" },
      toxicity: { note: "" },
    } as unknown as SpeciesProfile;
    expect(tabTexts(empty)).toEqual({ needs: [], calendar: [], health: [], guild: [] });
    expect(tabTexts({} as unknown as SpeciesProfile)).toEqual({ needs: [], calendar: [], health: [], guild: [] });
  });
});
