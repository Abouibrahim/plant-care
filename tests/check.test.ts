// The planting check's request validation, its context text, and the inventory it reads.
import { describe, expect, it } from "vitest";
import { describeCheck, inventory, parseCheckRequest, sameSpeciesLine, siteBlock, siteZones, zoneLists, type InventoryPlant } from "../api/check.js";
import type { Species, ZoneLists } from "../src/types";
import { makeClient, makeState } from "./mockdb";

const SPECIES_ID = "11111111-1111-4111-8111-111111111111";
const OTHER_ID = "22222222-2222-4222-8222-222222222222";

/** An invented profile, shaped like a real one; the values are placeholders, not plant facts. */
const species = {
  id: SPECIES_ID,
  scientific_name: "Persea americana",
  cultivar: "",
  common_names: { en: "Avocado", fr: "Avocatier", ar: "أفوكادو", ar_latin: "avocado" },
  plant_type: "tree",
  lifecycle: "perennial",
  foliage: "evergreen",
  layer: "canopy",
  site_fit: { rating: "poor", note: "Fit note." },
  water: { need: "high", drought_tolerance: "low", stress_signs: "Stress.", overwatering_signs: "Over.", summary: "Water summary." },
  sun: { exposure: "full_sun", heat_tolerance: "medium", summer_shade_needed: true, note: "Sun note." },
  salinity_tolerance: { level: "sensitive", note: "Salinity note." },
  climate_note: "Climate note.",
  care_calendar: [],
  pests: [],
  companions: { good: [], bad: [], root_warnings: [] },
  uses: { edible_parts: "Fruit.", preparation: "Raw.", storage: "Cool.", harvest_cues: "Cues." },
  toxicity: { humans: "none", chickens: "severe", goats: "severe", dogs_cats: "moderate", note: "Leaves." },
  generated_by: "claude-fable-5-1",
  generated_at: "2026-10-26T08:00:00Z",
  confirmed: false,
  user_edits: {},
  created_at: "2026-10-26T08:00:00Z",
  updated_at: "2026-10-26T08:00:00Z",
} as unknown as Species;

const olive = { scientific_name: "Olea europaea", common_names: { en: "Olive", fr: "Olivier", ar: "", ar_latin: "" } };
const carob = { scientific_name: "Ceratonia siliqua", common_names: { en: "", fr: "", ar: "", ar_latin: "" } };

function plant(partial: Partial<InventoryPlant>): InventoryPlant {
  return { species_id: OTHER_ID, site: "farm", zone: "", quantity: 1, planted_on: null, species: olive, ...partial };
}

describe("parseCheckRequest", () => {
  it("refuses a missing or malformed species id", () => {
    expect(parseCheckRequest(undefined)).toMatch(/species_id/);
    expect(parseCheckRequest({ species_id: "x" })).toMatch(/species_id/);
  });

  it("refuses an unknown site, a wrong type, an unknown language and over-long fields", () => {
    expect(parseCheckRequest({ species_id: SPECIES_ID, site: "garden" })).toMatch(/site/);
    expect(parseCheckRequest({ species_id: SPECIES_ID, zone: 3 })).toMatch(/zone/);
    expect(parseCheckRequest({ species_id: SPECIES_ID, note: [] })).toMatch(/note/);
    expect(parseCheckRequest({ species_id: SPECIES_ID, lang: "ar" })).toMatch(/lang/);
    expect(parseCheckRequest({ species_id: SPECIES_ID, site: "farm", zone: "z".repeat(201) })).toMatch(/zone is longer/);
    // A long Settings zone offered as a chip still goes through.
    expect(parseCheckRequest({ species_id: SPECIES_ID, site: "farm", zone: "z".repeat(200) })).toMatchObject({ zone: "z".repeat(200) });
    expect(parseCheckRequest({ species_id: SPECIES_ID, note: "n".repeat(301) })).toMatch(/note is longer/);
  });

  it("collapses whitespace, defaults to English and no site, and drops a zone without a site", () => {
    expect(parseCheckRequest({ species_id: SPECIES_ID })).toEqual({ species_id: SPECIES_ID, site: null, zone: "", note: "", lang: "en" });
    expect(parseCheckRequest({ species_id: SPECIES_ID, site: null, zone: "row 2" })).toMatchObject({ site: null, zone: "" });
    expect(parseCheckRequest({ species_id: SPECIES_ID, site: "backyard", zone: "  north   wall ", note: " shade\nfor hens ", lang: "fr" })).toEqual({
      species_id: SPECIES_ID,
      site: "backyard",
      zone: "north wall",
      note: "shade for hens",
      lang: "fr",
    });
  });
});

describe("the inventory text", () => {
  const zones: ZoneLists = { farm: ["Row 2", "north hedge"], backyard: [] };
  const plants = [
    plant({ zone: "row 2", quantity: 1 }),
    plant({ zone: "ROW 2 ", quantity: 5 }),
    plant({ zone: "row 2", species: carob }),
    plant({ zone: "orchard" }),
    plant({ zone: "" }),
    plant({ site: "backyard", zone: "terrace", species: null }),
  ];

  it("lists the Settings zones first, then the zones only plants use, matched without case", () => {
    expect(siteZones("farm", plants, zones)).toEqual(["Row 2", "north hedge", "orchard"]);
    expect(siteZones("backyard", plants, zones)).toEqual(["terrace"]);
  });

  it("counts each zone's plants by species, largest first, and keeps empty zones and plants without one", () => {
    expect(siteBlock("farm", plants, zones)).toBe(
      [
        "Plants recorded at the farm, by zone:",
        '- zone "Row 2": 6 × Olive (Olea europaea), 1 × Ceratonia siliqua',
        '- zone "north hedge": no plants recorded yet',
        '- zone "orchard": 1 × Olive (Olea europaea)',
        "- no zone given: 1 × Olive (Olea europaea)",
      ].join("\n"),
    );
    expect(siteBlock("backyard", plants, zones)).toBe('Plants recorded in the backyard, by zone:\n- zone "terrace": 1 × species unknown');
    expect(siteBlock("backyard", [], { farm: [], backyard: [] })).toBe("No plant is recorded in the backyard yet.");
  });

  it("says how many plants of the species are already recorded, where and at which stage, and when the date is unknown", () => {
    expect(sameSpeciesLine(SPECIES_ID, plants, "2026-10-26")).toBe("No plant of this species is recorded yet.");
    const mine = [
      plant({ species_id: SPECIES_ID, zone: "row 2", planted_on: "2026-01-10" }),
      plant({ species_id: SPECIES_ID, zone: "row 3", quantity: 2, planted_on: null }),
      plant({ species_id: SPECIES_ID, site: "backyard" }),
    ];
    expect(sameSpeciesLine(SPECIES_ID, [plant({ species_id: SPECIES_ID, planted_on: "2020-03-01" })], "2026-10-26")).toBe(
      "Plants of this species already recorded: 1 at the farm, mature.",
    );
    expect(sameSpeciesLine(SPECIES_ID, mine, "2026-10-26")).toBe(
      'Plants of this species already recorded: 3 at the farm (zone "row 2", "row 3"), establishment and planting date unknown; 1 in the backyard, planting date unknown.',
    );
  });

  it("puts the profile, the intent, the note, both sites and the language into one message", () => {
    const text = describeCheck({ species, today: "2026-10-26", site: "farm", zone: "row 2", note: "shade for hens", lang: "fr", plants, zones });
    expect(text.startsWith("Today: 2026-10-26 (Oct).")).toBe(true);
    expect(text).toContain("Species: Persea americana (Avocado / Avocatier / أفوكادو avocado)");
    expect(text).toContain("Profile: written by Claude, not yet confirmed by the grower.");
    expect(text).toContain('The grower has in mind at the farm, zone "row 2".');
    expect(text).toContain('Grower\'s note: "shade for hens"');
    expect(text).toContain("Plants recorded at the farm, by zone:");
    expect(text).toContain("Plants recorded in the backyard, by zone:");
    expect(text).toContain("Write every text field in French");
    expect(text.endsWith("Check whether this species suits this site before it is bought or planted.")).toBe(true);

    const open = describeCheck({ species, today: "2026-10-26", site: null, zone: "", note: "", lang: "en", plants: [], zones });
    expect(open).toContain("The grower has not chosen a site yet: compare the farm and the backyard.");
    expect(open).toContain("The grower left no note.");
    expect(open).not.toContain("French");
  });
});

describe("the inventory read", () => {
  it("reads every plant with its species names, past PostgREST's 1,000-row page", async () => {
    const state = makeState();
    state.species.push({ id: SPECIES_ID, ...olive });
    for (let i = 0; i < 1003; i++) {
      state.plants.push({ id: `p${i}`, species_id: SPECIES_ID, site: i % 2 ? "farm" : "backyard", zone: "", quantity: 1, planted_on: null, created_at: `2026-01-01T00:00:00Z` });
    }
    const rows = await inventory(makeClient(state));
    expect(rows).toHaveLength(1003);
    expect(rows[0].species).toEqual(olive);
  });

  it("reads the zone lists, and none when the row is missing or the read fails", async () => {
    const state = makeState({ settings: [{ key: "zones", value: { farm: ["row 2", 7], backyard: ["terrace"] } }] });
    expect(await zoneLists(makeClient(state))).toEqual({ farm: ["row 2"], backyard: ["terrace"] });
    expect(await zoneLists(makeClient(makeState()))).toEqual({ farm: [], backyard: [] });
    const failing = makeClient(state, {
      onQuery: () => {
        throw new Error("boom");
      },
    });
    await expect(zoneLists(failing)).rejects.toThrow("boom");
  });
});
