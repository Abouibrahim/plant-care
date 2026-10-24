// The text that puts one plant's own context in front of Claude: the date, the species profile,
// the plant record and its tasks. /api/diagnose and /api/ask build their user message from these
// blocks, so both calls describe a plant the same way.
import { ageInMonths, ageStage, parseIso } from "../src/lib/dates.js";
import { MONTHS_SHORT, type CareRule, type Pest, type PlantWithSpecies, type Species, type Task } from "../src/types.js";

/** Tasks this far back go into the context. */
export const RECENT_DAYS = 30;

export type RecentTask = Pick<Task, "type" | "title" | "due_on" | "window_end" | "status" | "acted_at" | "note">;

/** The task columns the context reads. */
export const RECENT_TASK_COLUMNS = "type, title, due_on, window_end, status, acted_at, note";

export function monthList(months: number[]): string {
  const names = [...new Set(Array.isArray(months) ? months : [])]
    .filter((m) => Number.isInteger(m) && m >= 1 && m <= 12)
    .sort((a, b) => a - b)
    .map((m) => MONTHS_SHORT[m - 1]);
  return names.length > 0 ? names.join(", ") : "months not given";
}

function list(items: unknown): string {
  const names = Array.isArray(items) ? items.filter((s): s is string => typeof s === "string" && s.trim() !== "") : [];
  return names.length > 0 ? names.join(", ") : "none listed";
}

/** "Today: 2026-10-25 (Oct)." */
export function todayLine(today: string): string {
  const month = parseIso(today)?.m;
  return `Today: ${today}${month ? ` (${MONTHS_SHORT[month - 1]})` : ""}.`;
}

/** Names, type and layer, site fit, water, sun, salinity and climate, one line each. */
export function speciesBlock(s: Species): string {
  const n = s.common_names;
  return [
    `Species: ${s.scientific_name}${s.cultivar ? ` '${s.cultivar}'` : ""} (${n.en} / ${n.fr} / ${n.ar} ${n.ar_latin}). ` +
      `${s.plant_type}, ${s.lifecycle}, ${s.foliage}, ${s.layer} layer.`,
    `Fit for this site: ${s.site_fit.rating}. ${s.site_fit.note}`,
    `Water: need ${s.water.need}, drought tolerance ${s.water.drought_tolerance}. ${s.water.summary} ` +
      `Water-stress signs: ${s.water.stress_signs} Overwatering signs: ${s.water.overwatering_signs}`,
    `Sun: ${s.sun.exposure}, heat tolerance ${s.sun.heat_tolerance}, summer shade for young plants: ${s.sun.summer_shade_needed ? "yes" : "no"}. ${s.sun.note}`,
    `Salinity tolerance: ${s.salinity_tolerance.level}. ${s.salinity_tolerance.note}`,
    `Climate: ${s.climate_note}`,
  ].join("\n");
}

export function pestLine(p: Pest): string {
  const fr = p.name_fr ? ` (${p.name_fr})` : "";
  return `- ${p.name_en}${fr}, ${monthList(p.months)}: ${p.symptoms} Organic treatment: ${p.organic_treatment}`;
}

/** The profile's pests and diseases under a heading, or the line saying it lists none. */
export function pestsBlock(s: Species): string {
  const pests = Array.isArray(s.pests) ? s.pests : [];
  return pests.length > 0
    ? `Pests and diseases of this species in Cap Bon, from its profile:\n${pests.map(pestLine).join("\n")}`
    : "The profile lists no pests or diseases for this species.";
}

function ruleLine(r: CareRule): string {
  const age = r.age === "any" ? "any age" : r.age;
  const water = r.type === "water" ? `, every ${r.every_days} days, ${r.litres} L` : "";
  return `- ${r.type} in ${monthList(r.months)}, ${age}${water}: "${r.title}". ${r.instruction}`;
}

/** The care calendar rules, from which the app writes this plant's tasks. */
export function calendarBlock(s: Species): string {
  const rules = Array.isArray(s.care_calendar) ? s.care_calendar : [];
  return rules.length > 0
    ? `Care calendar of this species (the rules the app turns into tasks; establishment means the first 24 months):\n${rules.map(ruleLine).join("\n")}`
    : "The profile has no care calendar rules.";
}

/** Companions, uses and toxicity, one line each. */
export function guildUsesBlock(s: Species): string {
  const c = s.companions;
  const u = s.uses;
  const tox = s.toxicity;
  return [
    `Companions: good ${list(c?.good)}; antagonists ${list(c?.bad)}; root warnings ${list(c?.root_warnings)}.`,
    `Uses: edible parts: ${u.edible_parts} Preparation: ${u.preparation} Storage: ${u.storage} Harvest cues: ${u.harvest_cues}`,
    `Toxicity: humans ${tox.humans}, chickens ${tox.chickens}, goats ${tox.goats}, dogs and cats ${tox.dogs_cats}. ${tox.note}`,
  ].join("\n");
}

/** Whether the grower confirmed the profile, and which of its blocks they edited by hand. */
export function profileStatusLine(s: Species): string {
  const state = s.confirmed ? "confirmed by the grower" : "written by Claude, not yet confirmed by the grower";
  const edited = Object.keys(s.user_edits ?? {});
  return `Profile: ${state}${edited.length > 0 ? `; edited by hand: ${edited.join(", ")}` : ""}.`;
}

/** Tag, count, site and zone, age and stage, source and rootstock. */
export function plantLine(plant: PlantWithSpecies, today: string): string {
  const months = ageInMonths(plant.planted_on, today);
  const stage = ageStage(months);
  const age =
    plant.planted_on && months !== null
      ? `Planted on ${plant.planted_on}: ${months} months old, ${stage}${stage === "establishment" ? " (the first 24 months)" : ""}.`
      : "Planting date unknown, treated as mature.";
  const count = plant.quantity === 1 ? "1 plant" : `${plant.quantity} plants`;
  const zone = plant.zone ? `, zone "${plant.zone}"` : "";
  const rootstock = plant.rootstock ? `, rootstock ${plant.rootstock}` : "";
  return `Plant: "${plant.tag}" (${count}) ${siteWords(plant.site)}${zone}. ${age} Source: ${plant.source}${rootstock}.`;
}

export function siteWords(site: PlantWithSpecies["site"]): string {
  return site === "farm" ? "at the farm" : "in the backyard";
}

export function taskLine(task: RecentTask): string {
  const label = `${task.type} "${task.title}"`;
  if (task.status === "pending") {
    const until = task.window_end ? `, window until ${task.window_end}` : "";
    return `- due ${task.due_on}: ${label}, still pending${until}`;
  }
  const day = task.acted_at ? task.acted_at.slice(0, 10) : task.due_on;
  const note = task.note ? ` ("${task.note}")` : "";
  return `- ${day}: ${label}, ${task.status}${note}`;
}
