// The Plants screen's search, shared with the tag sheet so "Print tags" prints what the list showed.
import type { PlantWithSpecies } from "../types";

/** Case-insensitive match against tag, zone, common names and scientific name; q is already lower-cased. */
export function matchesQuery(plant: PlantWithSpecies, q: string): boolean {
  if (!q) return true;
  const names = plant.species?.common_names;
  const fields = [plant.tag, plant.zone, names?.en, names?.fr, names?.ar, names?.ar_latin, plant.species?.scientific_name];
  return fields.some((f) => (f ?? "").toLowerCase().includes(q));
}
