// Display order of the care rules and the pests: by first listed month, rules then by task type.
// Returned as indices into the stored list, so the species editors can map a card back to its row.
import { TASK_TYPES, type CareRule, type Pest } from "../../types";

/** First listed month, 13 when none is listed, so unscheduled entries sort last. */
export function firstMonth(entry: { months: number[] }): number {
  return entry.months.length > 0 ? Math.min(...entry.months) : 13;
}

export function orderRules(rules: CareRule[]): number[] {
  return rules
    .map((_, i) => i)
    .sort((a, b) => firstMonth(rules[a]) - firstMonth(rules[b]) || TASK_TYPES.indexOf(rules[a].type) - TASK_TYPES.indexOf(rules[b].type) || a - b);
}

export function orderPests(pests: Pest[]): number[] {
  return pests.map((_, i) => i).sort((a, b) => firstMonth(pests[a]) - firstMonth(pests[b]) || a - b);
}
