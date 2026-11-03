// The list a kind of work is handed out with (Phase 13): its heading, one block per card in Today's
// order, every plant by tag whatever the Choose ticks, the litres per amount, the due lines and the
// instruction the plants share. The app's strings here are English.
import { describe, expect, it } from "vitest";
import { en } from "../src/i18n/en";
import { withBatches } from "../src/lib/batches";
import { handoutText } from "../src/lib/handout";
import { shortDate, sortByDue, weekdayDate } from "../src/lib/today";
import type { Site, TaskType, TaskWithPlant } from "../src/types";

const today = "2026-11-03";
const yesterday = "2026-11-02";
let n = 0;

interface Extra extends Partial<Omit<TaskWithPlant, "plant">> {
  tag?: string;
  zone?: string;
  quantity?: number;
  site?: Site;
}

/** A calendar watering of its own plant at the farm unless the extra says otherwise. */
function task(due_on: string, extra: Extra = {}): TaskWithPlant {
  n += 1;
  const { tag = `T-${n}`, zone = "row 2", quantity = 1, site = "farm", ...rest } = extra;
  const plant_id = rest.plant_id ?? `p${n}`;
  return {
    id: `t${n}`,
    plant_id,
    type: "water",
    rule_key: "water:9-10-11:any:7",
    due_on,
    window_end: null,
    title: "Deep watering (40 L)",
    instruction: "",
    status: "pending",
    acted_at: null,
    note: "",
    created_at: "2026-10-01T05:00:00Z",
    ...rest,
    plant: { id: plant_id, tag, site, zone, quantity },
  };
}

const win = (type: TaskType, title: string, due_on: string, window_end: string, extra: Extra = {}) =>
  task(due_on, { type, title, window_end, rule_key: `${type}:10-11-12:any`, ...extra });

/** The kind's list as Today would hand it out for the given tasks of one kind and site. */
function listOf(type: TaskType, tasks: TaskWithPlant[], day = today): string {
  return handoutText({ type, site: "farm", day, today, items: withBatches(sortByDue(tasks, today), today) });
}

describe("the list a kind of work is handed out with (Phase 13)", () => {
  it("heads the list with the kind, the site and the day, then one block per card, a blank line apart", () => {
    const text = listOf("water", [task(today, { zone: "row 3" }), task(today, { zone: "row 3" }), task(today, { rule_key: "manual:m1", title: "Water the new carob", tag: "CAR-01", zone: "row 5" })]);
    const blocks = text.split("\n\n");
    expect(blocks[0]).toBe(`Water · Farm · ${weekdayDate(today)}`);
    expect(blocks).toHaveLength(3);
    expect(blocks[2]).toBe(`Water the new carob · CAR-01 · row 5\n${en.today.dueToday}`);
    expect(text.endsWith("\n")).toBe(false);
  });

  it("writes a round with its zone, plants and litres, its due line and each amount with its plants", () => {
    const olives = ["OL-01", "OL-03", "OL-04"].map((tag) => task(yesterday, { tag }));
    const hedge = task(today, { tag: "POM-H", quantity: 12, title: "Water the pomegranate hedge (8 L)" });
    const [, round] = listOf("water", [...olives, hedge]).split("\n\n");
    expect(round).toBe(["row 2 · 15 plants · 216 L in all", `${en.today.dueToday} · ${en.today.batchLate(3)}`, "40 L: OL-01, OL-03, OL-04", "8 L: POM-H ×12"].join("\n"));
  });

  it("puts the plants with no amount last and gives no total, and no zone part for plants with no zone", () => {
    const tasks = [task(today, { tag: "FIG-09", zone: "", title: "Summer watering" }), task(today, { tag: "FIG-01", zone: "", title: "Summer watering (25 L)" })];
    const [, round] = listOf("water", tasks).split("\n\n");
    expect(round).toBe(["2 plants", en.today.dueToday, "25 L: FIG-01", "No amount: FIG-09"].join("\n"));
  });

  it("lists every plant of a window job, ticked or not, with its window and the instruction they share", () => {
    const tags = Array.from({ length: 12 }, (_, i) => `OL-${String(i + 1).padStart(2, "0")}`);
    const olives = tags.map((tag) => win("harvest", "Harvest the olives", "2026-10-01", "2026-12-31", { tag, instruction: "Comb onto nets; no sticks." }));
    const [, job] = listOf("harvest", olives).split("\n\n");
    // All twelve, where the card shows eight and "+4"; the list takes no ticks, so a plant unticked in Choose is listed too.
    expect(job).toBe(
      [
        "Harvest the olives · row 2 · 12 plants",
        `${en.today.openSince(shortDate("2026-10-01"))} · ${en.today.until(shortDate("2026-12-31"))}`,
        tags.join(", "),
        "Comb onto nets; no sticks.",
      ].join("\n"),
    );
  });

  it("leaves out an instruction the plants do not share, and gives a watering window no total", () => {
    const lemons = [
      win("water", "Water if dry (20 L)", "2026-10-01", "2026-11-30", { tag: "LEM-01", zone: "citrus", instruction: "Only when the top 5 cm are dry." }),
      win("water", "Water if dry (20 L)", "2026-10-01", "2026-11-30", { tag: "LEM-02", zone: "citrus", instruction: "Slowly, at the drip line." }),
    ];
    const [, job] = listOf("water", lemons).split("\n\n");
    expect(job).toBe(["Water if dry (20 L) · citrus · 2 plants", `${en.today.openSince(shortDate("2026-10-01"))} · ${en.today.until(shortDate("2026-11-30"))}`, "LEM-01, LEM-02"].join("\n"));
  });

  it("writes a card of its own with its title, its plant and zone, its due line and instruction", () => {
    const followUp = task(yesterday, { type: "scout", rule_key: "diagnosis:ph-1", title: "Re-photograph FIG-01: fig rust", tag: "FIG-01", zone: "row 3", instruction: "Take a new photo of the same leaf." });
    const [, block] = listOf("scout", [followUp]).split("\n\n");
    expect(block).toBe(["Re-photograph FIG-01: fig rust · FIG-01 · row 3", `${en.today.overdue} · ${shortDate(yesterday)}`, "Take a new photo of the same leaf."].join("\n"));
    // A group record alone and with no zone: its size, no zone part.
    const hedge = win("prune", "Trim the hedge", "2026-10-15", "2026-11-30", { tag: "POM-H", quantity: 12, zone: "" });
    const [, alone] = listOf("prune", [hedge]).split("\n\n");
    expect(alone.split("\n")[0]).toBe("Trim the hedge · POM-H ×12");
  });

  it("keeps a title and an instruction typed with line breaks on one line, as the card shows them", () => {
    const olives = ["OL-01", "OL-02"].map((tag) => win("harvest", "Harvest the\nolives", "2026-10-01", "2026-12-31", { tag, instruction: "Comb onto nets.\n\nNo sticks, no shaking." }));
    const fig = win("harvest", "Pick the figs", "2026-10-01", "2026-11-30", { tag: "FIG-01", instruction: "Mornings only.\n\nNever wet." });
    const blocks = listOf("harvest", [...olives, fig]).split("\n\n");
    expect(blocks).toHaveLength(3);
    expect(blocks[1].split("\n")[0]).toBe("Harvest the olives · row 2 · 2 plants");
    expect(blocks[1].endsWith("Comb onto nets. No sticks, no shaking.")).toBe(true);
    expect(blocks[2].endsWith("Mornings only. Never wet.")).toBe(true);
  });

  it("heads a coming day's list with that day, and words its round's due line by the day", () => {
    const thursday = "2026-11-05";
    const text = listOf("water", [task(thursday, { tag: "OL-41", zone: "row 1" }), task(thursday, { tag: "OL-42", zone: "row 1" })], thursday);
    expect(text).toBe([`Water · Farm · ${weekdayDate(thursday)}`, "", "row 1 · 2 plants · 80 L in all", weekdayDate(thursday), "40 L: OL-41, OL-42"].join("\n"));
  });
});
