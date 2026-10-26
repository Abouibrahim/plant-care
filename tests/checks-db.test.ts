// The app's planting-check reads and writes (src/lib/db.ts) and the reading of a stored result
// (src/lib/check.ts), against the in-memory tables with the browser client mocked.
import { beforeEach, describe, expect, it, vi } from "vitest";
import { storedCheck } from "../src/lib/check";
import type { PlantingCheck, PlantingCheckRow, Usage } from "../src/types";
import { resetState, sharedState } from "./mockdb";

vi.mock("../src/lib/supabase", async () => {
  const { makeDb, sharedState } = await import("./mockdb");
  return { supabase: makeDb(sharedState), PHOTOS_BUCKET: "photos", supabaseConfigured: true };
});

const { insertCheck, latestChecks, listChecks, getCheck, deleteSpeciesIfUnused } = await import("../src/lib/db");

const usage: Usage = { model: "claude-fable-5-1", input_tokens: 4000, output_tokens: 1500, thinking_tokens: 600, cache_read_input_tokens: 0, cache_creation_input_tokens: 0 };

function result(verdict: PlantingCheck["verdict"]): PlantingCheck & Usage {
  return {
    factors: [{ factor: "salinity", status: "problem", note: "Note." }],
    verdict,
    best_site: "backyard",
    summary: "Summary.",
    placement: "",
    planting_time: "",
    buying_tips: "",
    first_year: "",
    alternatives: [],
    ...usage,
  };
}

function row(id: string, species_id: string, checked_at: string, verdict: PlantingCheck["verdict"] = "avoid"): PlantingCheckRow {
  return { id, species_id, checked_at, site: "farm", zone: "", note: "", result: result(verdict) };
}

beforeEach(() => resetState(sharedState));

describe("planting checks in the table", () => {
  it("writes a check once: a retry with the same id counts as saved and adds nothing", async () => {
    const r = row("c1", "s1", "2026-10-26T08:00:00Z");
    await insertCheck(r);
    await insertCheck(r);
    expect(sharedState.planting_checks).toHaveLength(1);
    expect(await getCheck("c1")).toMatchObject({ id: "c1", species_id: "s1" });
    expect(await getCheck("missing")).toBeNull();
  });

  it("lists a species' checks newest first, and the newest of each species for the library", async () => {
    await insertCheck(row("a-old", "s1", "2026-10-01T08:00:00Z", "plant"));
    await insertCheck(row("a-new", "s1", "2026-10-20T08:00:00Z", "avoid"));
    await insertCheck(row("b-only", "s2", "2026-10-10T08:00:00Z", "plant_with_care"));
    expect((await listChecks("s1")).map((r) => r.id)).toEqual(["a-new", "a-old"]);
    const latest = await latestChecks();
    // Only the verdict is read out of each result.
    expect(latest.get("s1")).toEqual({ id: "a-new", species_id: "s1", checked_at: "2026-10-20T08:00:00Z", verdict: "avoid" });
    expect(latest.get("s2")?.verdict).toBe("plant_with_care");
    expect(latest.size).toBe(2);
  });

  it("goes with its species when an unused profile is deleted", async () => {
    sharedState.species.push({ id: "s1", scientific_name: "Persea americana", cultivar: "" });
    await insertCheck(row("c1", "s1", "2026-10-26T08:00:00Z"));
    expect(await deleteSpeciesIfUnused("s1")).toBe(true);
    expect(sharedState.planting_checks).toHaveLength(0);
  });
});

describe("storedCheck", () => {
  it("reads a stored result back, keeping the factor order and dropping unknown or repeated factors", () => {
    const stored = storedCheck({
      ...result("plant_with_care"),
      factors: [
        { factor: "pests", status: "good", note: " Fine. " },
        { factor: "salinity", status: "problem", note: "Salt." },
        { factor: "salinity", status: "good", note: "Again." },
        { factor: "wind", status: "good", note: "Unknown factor." },
        { factor: "heat", status: "awful", note: "Unknown status." },
      ],
      alternatives: [
        { name: " Carob ", scientific_name: "Ceratonia siliqua", why: "Tough." },
        { name: "", scientific_name: "Nomen nudum", why: "No name." },
        { name: "A" },
        { name: "B", why: "" },
        { name: "C", why: "" },
      ],
      best_site: "mars",
    });
    expect(stored?.factors).toEqual([
      { factor: "salinity", status: "problem", note: "Salt." },
      { factor: "pests", status: "good", note: "Fine." },
    ]);
    expect(stored?.alternatives).toEqual([
      { name: "Carob", scientific_name: "Ceratonia siliqua", why: "Tough." },
      { name: "A", scientific_name: "", why: "" },
      { name: "B", scientific_name: "", why: "" },
    ]);
    expect(stored?.best_site).toBe("either");
    expect(stored?.input_tokens).toBe(4000);
  });

  it("holds nothing without a known verdict", () => {
    expect(storedCheck(null)).toBeNull();
    expect(storedCheck({ verdict: "maybe" })).toBeNull();
    expect(storedCheck({ summary: "No verdict." })).toBeNull();
  });
});
