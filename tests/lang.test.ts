// The language the server writes in (Phase 14, review 4.2): the settings row read by api/_lang.ts,
// the digest and the expansion's notes in French, and a window closed in French recognised as the
// expansion's own.
import { describe, expect, it } from "vitest";
import { readLang, readStrings } from "../api/_lang.js";
import { composeDigest, type DigestTask } from "../api/_push.js";
import { carriedOver, runExpansion } from "../api/_tasks.js";
import { composeWeatherMessage } from "../api/_weather.js";
import { en } from "../src/i18n/en";
import { fr } from "../src/i18n/fr";
import type { TaskInsert } from "../src/types";
import { fixture, window } from "./fixtures";
import { makeClient, makeState } from "./mockdb";

describe("readLang", () => {
  it("reads the stored choice, and falls back to English for a missing, unknown or unreadable row", async () => {
    expect(await readLang(makeClient(makeState({ settings: [{ key: "lang", value: "fr" }] })))).toBe("fr");
    expect(await readLang(makeClient(makeState({ settings: [{ key: "lang", value: "en" }] })))).toBe("en");
    expect(await readLang(makeClient(makeState({ settings: [{ key: "lang", value: "ar" }] })))).toBe("en");
    expect(await readLang(makeClient(makeState()))).toBe("en");
    const failing = makeClient(makeState(), {
      onQuery: () => {
        throw new Error("relation settings does not exist");
      },
    });
    expect(await readLang(failing)).toBe("en");
    expect(await readStrings(makeClient(makeState({ settings: [{ key: "lang", value: "fr" }] })))).toBe(fr);
    expect(await readStrings(makeClient(makeState()))).toBe(en);
  });
});

describe("the French notifications", () => {
  const task: DigestTask = {
    id: "t1",
    plant_id: "p1",
    type: "water",
    rule_key: "water:6:any:7",
    due_on: "2026-09-17",
    window_end: null,
    title: "Deep watering (40 L)",
    plant: { tag: "FIG-01", site: "farm", zone: "", quantity: 1, care_calendar: [] },
  };

  it("composes the digest in French when asked, its dates included, English by default", () => {
    const [farm] = composeDigest([task], "2026-09-17", fr);
    expect(farm.title).toBe("Ferme : 1 tâche");
    expect(farm.body).toBe("Deep watering (40 L) · FIG-01");
    expect(composeDigest([task], "2026-09-17")[0].title).toBe("Farm: 1 task");

    const harvest: DigestTask = {
      ...task,
      id: "t2",
      type: "harvest",
      rule_key: "harvest:11-12:any",
      due_on: "2026-11-01",
      window_end: "2026-12-31",
      title: "Harvest the olives",
      plant: { tag: "OL-01", site: "farm", zone: "", quantity: 1, care_calendar: [{ type: "harvest", months: [11, 12], every_days: 0, litres: 0, age: "any", lead_days: 14, title: "Harvest the olives", instruction: "" }] },
    };
    expect(composeDigest([harvest], "2026-10-18", fr)[0].body).toBe("À partir du 1 nov. : Harvest the olives · OL-01");
    expect(composeDigest([harvest], "2026-10-18")[0].body).toBe("From 1 Nov: Harvest the olives · OL-01");
  });

  it("composes the weather push in French", () => {
    const message = composeWeatherMessage([], "2026-09-17", { decision: { mm: 14, reason: "past" }, skipped: 3 }, fr);
    expect(message?.title).toBe(fr.weather.pushRainTitle(3));
    expect(message?.body).toBe(fr.weather.skippedLine(3, 14));
  });

  it("writes the expansion's notes in French", async () => {
    const f = fixture();
    f.plant([window("harvest", [8, 9], { title: "Harvest" })]);
    await runExpansion(f.db, "2026-09-01", undefined, fr);
    await runExpansion(f.db, "2026-10-02", undefined, fr);
    const closed = f.tasks((t) => t.status === "skipped");
    expect(closed).toHaveLength(1);
    expect(closed[0].note).toBe("Fenêtre terminée");
  });
});

describe("carriedOver across languages", () => {
  const seed: TaskInsert = { plant_id: "p1", type: "harvest", rule_key: "harvest:10-11:any", due_on: "2026-10-01", window_end: "2026-11-30", title: "Harvest", instruction: "" };
  const acted = (note: string) => [
    { plant_id: "p1", type: "harvest" as const, rule_key: "harvest:10:any", due_on: "2026-10-01", window_end: "2026-10-31", status: "skipped" as const, note, acted_at: "2026-10-05T08:00:00Z" },
  ];

  it("reads a window the expansion closed in either language as nobody's action, and a grower's skip as one", () => {
    expect(carriedOver(seed, acted(en.expansion.windowEnded), new Set(), "2026-10-10")).toBe(false);
    expect(carriedOver(seed, acted(fr.expansion.windowEnded), new Set(), "2026-10-10")).toBe(false);
    expect(carriedOver(seed, acted("Trop tard cette année"), new Set(), "2026-10-10")).toBe(true);
  });
});
