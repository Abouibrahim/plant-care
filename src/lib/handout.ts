// The list a kind of work is handed out with (Phase 13): one plain text per kind and site, as Today
// shows it, for a message to whoever does the work (Android's share sheet: WhatsApp, SMS). Every
// task shown goes in, whatever the Choose ticks, with every tag; no ids and no links. The frame is
// worded in the app's language; titles, instructions, zones and tags go as stored. App-only, since it
// reads `t`; otherwise pure.
import { t } from "../i18n";
import { plantsOf, summarize, type ListItem } from "./batches";
import { dueLabel, roundDueLabel, sharedInstruction, weekdayDate } from "./today";
import type { Site, TaskType, TaskWithPlant } from "../types";

export interface HandoutInput {
  type: TaskType;
  site: Site;
  /** The day the kind is shown for: today for the week view and today's tile, the chosen day otherwise. */
  day: string;
  today: string;
  /** The kind's entries as Today shows them. */
  items: ListItem<TaskWithPlant>[];
}

/** A plant as the list names it: "OL-01", or "POM-H ×12" for a group record. */
function tagOf(tag: string, quantity: number): string {
  return quantity > 1 ? `${tag} ×${quantity}` : tag;
}

/**
 * Free text on one line, as the card shows it: an instruction edited by hand can hold line breaks,
 * and a blank line in it would read as the gap between two cards.
 */
function oneLine(text: string): string {
  return text.replace(/\s+/g, " ").trim();
}

/** One card's lines: what and where, the due line, the plants, the instruction. */
function block(item: ListItem<TaskWithPlant>, today: string): string[] {
  if (item.kind === "task") {
    const task = item.task;
    const where = task.plant ? [tagOf(task.plant.tag, plantsOf(task)), task.plant.zone.trim()] : [];
    return [[oneLine(task.title), ...where].filter(Boolean).join(" · "), dueLabel(task, today).text, oneLine(task.instruction)].filter(Boolean);
  }
  const { batch } = item;
  const summary = summarize(batch.tasks, today);
  const lines: string[] = [];
  if (batch.title === null) {
    // A round of waterings: the zone, its plants and litres, then each amount with its plants.
    lines.push([batch.zone, t.today.batchPlants(summary.plants), summary.total === null ? "" : t.today.litresTotal(summary.total)].filter(Boolean).join(" · "));
    lines.push(roundDueLabel(batch.day, summary).text);
    for (const group of summary.groups) {
      const amount = group.litres === null ? t.today.noAmount : t.today.litres(group.litres);
      lines.push(t.today.handoutAmount(amount, group.plants.map((p) => tagOf(p.tag, p.quantity)).join(", ")));
    }
  } else {
    // A window job: its title, zone and plants, the window, then every plant by tag.
    lines.push([oneLine(batch.title), batch.zone, t.today.batchPlants(summary.plants)].filter(Boolean).join(" · "));
    lines.push(dueLabel(batch.tasks[0], today).text);
    lines.push(summary.members.map((p) => tagOf(p.tag, p.quantity)).join(", "));
  }
  const instruction = oneLine(sharedInstruction(batch.tasks));
  if (instruction) lines.push(instruction);
  return lines;
}

/**
 * The kind's list: "Water · Farm · Tue 3 Nov", then one block per card in Today's order, a blank
 * line apart. A round reads "row 2 · 15 plants · 216 L in all", its due line and "40 L: OL-01,
 * OL-03"; a window job "Harvest the olives · row 2 · 10 plants", its window and its tags; a single
 * card "title · TAG · zone" and its due line; each with the instruction its plants share.
 */
export function handoutText({ type, site, day, today, items }: HandoutInput): string {
  const head = [t.enums.task_type[type], t.site[site], weekdayDate(day)].join(" · ");
  return [head, ...items.map((item) => block(item, today).join("\n"))].join("\n\n");
}
