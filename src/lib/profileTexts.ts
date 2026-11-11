// The prose of a species profile, tab by tab (Phase 17): the texts the derja words are placed in,
// which are also the texts a tab's "Derja words" card looks for its terms in. Ratings, pills and
// month grids are not prose and are left out; so is a pest's French name.
import type { SpeciesProfile } from "../types.js";

export type ProfileTab = "needs" | "calendar" | "health" | "guild";

function texts(...values: unknown[]): string[] {
  return values.filter((v): v is string => typeof v === "string" && v.trim() !== "");
}

function list<T>(value: T[] | null | undefined): T[] {
  return Array.isArray(value) ? value : [];
}

/** Each tab's prose, in the order the tab draws it. A missing part gives nothing. */
export function tabTexts(s: SpeciesProfile): Record<ProfileTab, string[]> {
  return {
    needs: texts(s.site_fit?.note, s.water?.summary, s.water?.stress_signs, s.water?.overwatering_signs, s.sun?.note, s.salinity_tolerance?.note, s.climate_note),
    calendar: list(s.care_calendar).flatMap((r) => texts(r?.title, r?.instruction)),
    health: list(s.pests).flatMap((p) => texts(p?.name_en, p?.symptoms, p?.organic_treatment, p?.prevention)),
    guild: texts(
      ...list(s.companions?.good),
      ...list(s.companions?.bad),
      ...list(s.companions?.root_warnings),
      s.uses?.edible_parts,
      s.uses?.preparation,
      s.uses?.storage,
      s.uses?.harvest_cues,
      s.toxicity?.note,
    ),
  };
}
