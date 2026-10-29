// The farm map and tree tags (Phase 9): pin colours, framing, tag codes and links, tile sources, the
// QR code's size, and the best-of GPS reading.
import { describe, expect, it } from "vitest";
import { correction, generate } from "lean-qr";
import {
  boundsOf,
  formatTagCode,
  hasPosition,
  neighboursOf,
  parseTagCode,
  pinStates,
  roundPosition,
  SITE_ZOOM,
  startView,
  tagCode,
  tagIdRange,
  tagUrl,
  tileSources,
  TOWN_ZOOM,
  TREE_ZOOM,
} from "../src/lib/map";
import { betterFix, type Fix } from "../src/lib/location";
import { TOWN } from "../src/lib/weather";

const TODAY = "2026-07-10";
const ID = "0d6f2c1e-8a7b-4c3d-9e2f-1a2b3c4d5e6f";

describe("pin colours", () => {
  const task = (plant_id: string, due_on: string, window_end: string | null = null) => ({ plant_id, due_on, window_end });

  it("takes the most pressing state of each plant's tasks: late, then due today, then an open window", () => {
    const states = pinStates(
      [
        task("a", "2026-07-08"), // a watering two days late
        task("a", TODAY),
        task("b", TODAY),
        task("b", "2026-07-01", "2026-08-31"), // an open window
        task("c", "2026-07-01", "2026-08-31"),
        task("d", "2026-06-01", "2026-06-30"), // a window that has ended: late
        task("e", "2026-07-12"), // still to come: no colour
      ],
      TODAY,
    );
    expect(Object.fromEntries(states)).toEqual({ a: "overdue", b: "today", c: "open", d: "overdue" });
  });
});

describe("positions and framing", () => {
  const at = (lat: number | null, lng: number | null) => ({ lat, lng });

  it("knows a usable position", () => {
    expect(hasPosition(at(36.68, 10.58))).toBe(true);
    expect(hasPosition(at(null, 10.58))).toBe(false);
    expect(hasPosition(at(Number.NaN, 10.58))).toBe(false);
    expect(hasPosition(at(91, 10))).toBe(false);
  });

  it("frames the positioned plants and ignores the others", () => {
    expect(boundsOf([at(36.68, 10.58), at(36.69, 10.57), at(null, null)])).toEqual([
      { lat: 36.68, lng: 10.57 },
      { lat: 36.69, lng: 10.58 },
    ]);
    expect(boundsOf([at(null, null)])).toBeNull();
  });

  it("opens the position sheet on the plant, else on its site's other plants, else on the town", () => {
    expect(startView(at(36.68, 10.58), [])).toEqual({ centre: { lat: 36.68, lng: 10.58 }, zoom: TREE_ZOOM });
    expect(startView(at(null, null), [at(36.68, 10.58), at(36.7, 10.6)])).toEqual({ centre: { lat: 36.69, lng: 10.59 }, zoom: SITE_ZOOM });
    expect(startView(null, [])).toEqual({ centre: { lat: TOWN.lat, lng: TOWN.lng }, zoom: TOWN_ZOOM });
  });

  it("rounds a saved position to six decimals", () => {
    expect(roundPosition({ lat: 36.683312345, lng: 10.5833449 })).toEqual({ lat: 36.683312, lng: 10.583345 });
  });

  it("shows as dots the positioned plants of the same site, not the plant being placed", () => {
    const plants = [
      { id: "me", site: "farm" as const, lat: 36.68, lng: 10.58 },
      { id: "n1", site: "farm" as const, lat: 36.681, lng: 10.581 },
      { id: "n2", site: "farm" as const, lat: null, lng: null },
      { id: "b1", site: "backyard" as const, lat: 36.7, lng: 10.6 },
    ];
    expect(neighboursOf(plants, "farm", "me").map((p) => p.id)).toEqual(["n1"]);
    expect(neighboursOf(plants, "farm", null).map((p) => p.id)).toEqual(["me", "n1"]);
  });
});

describe("tree tags", () => {
  it("codes a plant by the first 8 hex digits of its id", () => {
    expect(tagCode(ID)).toBe("0d6f2c1e");
    expect(tagCode(ID.toUpperCase())).toBe("0d6f2c1e");
    expect(formatTagCode("0d6f2c1e")).toBe("0D6F 2C1E");
  });

  it("reads a code from a link, in either case, and refuses anything else", () => {
    expect(parseTagCode("0D6F2C1E")).toBe("0d6f2c1e");
    expect(parseTagCode(" 0d6f2c1e ")).toBe("0d6f2c1e");
    expect(parseTagCode("0d6f2c1")).toBeNull();
    expect(parseTagCode("zzzzzzzz")).toBeNull();
    expect(parseTagCode(undefined)).toBeNull();
  });

  it("covers exactly the ids that start with the code", () => {
    const { from, to } = tagIdRange("0d6f2c1e");
    expect(from <= ID && ID <= to).toBe(true);
    expect("0d6f2c1d-ffff-ffff-ffff-ffffffffffff" < from).toBe(true);
    expect("0d6f2c1f-0000-0000-0000-000000000000" > to).toBe(true);
  });

  it("links to the /t/ route, and the code stays small enough to read on a 30 mm tag", () => {
    const url = tagUrl("https://plant-care-phi-fawn.vercel.app/", ID);
    expect(url).toBe("https://plant-care-phi-fawn.vercel.app/t/0d6f2c1e");
    const short = generate(url, { minCorrectionLevel: correction.Q });
    const long = generate(`https://plant-care-phi-fawn.vercel.app/plants/${ID}`, { minCorrectionLevel: correction.Q });
    // Version 5 is 37 modules a side: with the quiet zone, 0.67 mm per module on a 30 mm code.
    expect(short.size).toBe(37);
    expect(long.size).toBeGreaterThan(short.size);
  });
});

describe("tile sources", () => {
  it("offers the street map alone without a key, and never the keyless Esri address", () => {
    const sources = tileSources(undefined);
    expect(sources.satellite).toBeNull();
    expect(sources.street.url).toContain("tile.openstreetmap.org");
    expect(tileSources("   ").satellite).toBeNull();
  });

  it("puts the key in the satellite address, with Esri's credit, and caps the imagery at zoom 18", () => {
    const satellite = tileSources("abc+/=").satellite;
    expect(satellite?.url).toContain("ibasemaps-api.arcgis.com");
    expect(satellite?.url).toContain("token=abc%2B%2F%3D");
    expect(satellite?.attribution).toContain("Powered by");
    expect(satellite?.maxNativeZoom).toBe(18);
  });
});

describe("Use my location", () => {
  const START = 1_000_000;
  const fix = (accuracy: number, at = START + 500): Fix => ({ lat: 36.68, lng: 10.58, accuracy, at });

  it("keeps the most precise reading and ignores one made before the listening started", () => {
    let best: Fix | null = null;
    best = betterFix(best, fix(40), START);
    expect(best?.accuracy).toBe(40);
    best = betterFix(best, fix(12), START);
    expect(best?.accuracy).toBe(12);
    best = betterFix(best, fix(25), START);
    expect(best?.accuracy).toBe(12);
    best = betterFix(best, fix(3, START - 60_000), START);
    expect(best?.accuracy).toBe(12);
    expect(betterFix(null, fix(Number.NaN), START)).toBeNull();
  });
});
