// The weather (Phase 8): the point, parsing an Open-Meteo answer, spray windows, alerts, the rain
// decision and skip against the in-memory tables, storing, the morning push and the Claude block.
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { weatherBlock } from "../api/_context.js";
import {
  applyRainSkip,
  composeWeatherMessage,
  forecastUrl,
  parseForecast,
  pointFrom,
  previewRainSkip,
  readWeatherSettings,
  refreshWeather,
  sprayWindows,
  storeWeather,
  type OpenMeteo,
} from "../api/_weather.js";
import { alertsFor, callsForSpray, isFresh, markWindows, rainBefore, rainDecision, sprayCallers, TOWN, upcomingAlerts, weatherSettings } from "../src/lib/weather";
import type { CauseKind, TaskType, WeatherDay } from "../src/types";
import { makeClient, makeState, type Row } from "./mockdb";

const TODAY = "2026-07-10";

function day(partial: Partial<WeatherDay> & { day: string }): WeatherDay {
  return {
    tmax: 30,
    tmin: 20,
    rain_mm: 0,
    rain_prob: 0,
    wind_kmh: 10,
    gust_kmh: 20,
    wind_dir: 320,
    rh_min: 50,
    et0_mm: 5,
    spray: [],
    forecast: partial.day >= TODAY,
    skipped: 0,
    lat: TOWN.lat,
    lng: TOWN.lng,
    fetched_at: "2026-07-10T05:00:00Z",
    ...partial,
  };
}

/** Hourly arrays for one day: cool and calm until 10:00, hot after, rain in the hour before 20:00. */
function hourlyFor(date: string): Record<string, unknown[]> {
  const time: string[] = [];
  const temperature_2m: number[] = [];
  const precipitation: number[] = [];
  const wind_speed_10m: number[] = [];
  const wind_gusts_10m: number[] = [];
  for (let h = 0; h < 24; h++) {
    time.push(`${date}T${String(h).padStart(2, "0")}:00`);
    temperature_2m.push(h >= 10 && h <= 17 ? 33 : 24);
    precipitation.push(h === 20 ? 2 : 0);
    wind_speed_10m.push(h === 13 ? 30 : 8);
    wind_gusts_10m.push(h === 7 ? 40 : 15);
  }
  return { time, temperature_2m, precipitation, wind_speed_10m, wind_gusts_10m };
}

describe("the point", () => {
  it("falls back to the town without nearby farm positions", () => {
    expect(pointFrom([])).toEqual({ ...TOWN, source: "town" });
    expect(pointFrom([{ lat: null, lng: null }, { lat: 48.85, lng: 2.35 }])).toEqual({ ...TOWN, source: "town" });
  });

  it("takes the mean of the positions within 30 km", () => {
    const p = pointFrom([
      { lat: 36.7, lng: 10.6 },
      { lat: 36.66, lng: 10.56 },
      { lat: 40, lng: 10 },
    ]);
    expect(p).toEqual({ lat: 36.68, lng: 10.58, source: "farm" });
  });

  it("asks Open-Meteo for both daily and hourly data in Tunis time", () => {
    const url = new URL(forecastUrl({ ...TOWN, source: "town" }));
    expect(url.origin + url.pathname).toBe("https://api.open-meteo.com/v1/forecast");
    expect(url.searchParams.get("timezone")).toBe("Africa/Tunis");
    expect(url.searchParams.get("past_days")).toBe("7");
    expect(url.searchParams.get("daily")).toContain("relative_humidity_2m_min");
    expect(url.searchParams.get("hourly")).toContain("wind_gusts_10m");
  });
});

describe("spray windows", () => {
  it("keeps cool, calm, dry runs of two hours or more between 06:00 and 19:00", () => {
    // Gusts at index 7 cover 06:00 to 07:00 and 07:00 itself, so both hours drop out; 08:00 and 09:00
    // are fine; 10:00 to 17:00 are hot; 18:00 has the 19:00 to 20:00 rain within its six hours.
    expect(sprayWindows(hourlyFor(TODAY), TODAY)).toEqual([{ from: "08:00", to: "10:00" }]);
  });

  it("reads the rain of an hour from the index after it, and checks six hours past the spray hour", () => {
    const h = hourlyFor(TODAY);
    // Rain in the hour 15:00 to 16:00 sits at index 16: it is inside the six hours after 09:00, not after 08:00.
    (h.precipitation as number[])[20] = 0;
    (h.precipitation as number[])[16] = 1;
    expect(sprayWindows(h, TODAY)).toEqual([]);
    (h.precipitation as number[])[16] = 0;
    (h.precipitation as number[])[17] = 1;
    expect(sprayWindows(h, TODAY)).toEqual([{ from: "08:00", to: "10:00" }]);
  });

  it("treats an hour with no rain figure as wet", () => {
    const h = hourlyFor(TODAY);
    (h.precipitation as Array<number | null>)[9] = null;
    expect(sprayWindows(h, TODAY)).toEqual([]);
  });
});

describe("parsing an Open-Meteo answer", () => {
  const raw: OpenMeteo = {
    daily: {
      time: ["2026-07-08", "2026-07-09", TODAY, "2026-07-11", "2026-07-12", "2026-07-13"],
      temperature_2m_max: [31, 32, 41, 36, 30, 29],
      temperature_2m_min: [20, 21, 25, 22, 19, null],
      precipitation_sum: [6, 5.5, 0, 0, 0, 0],
      precipitation_probability_max: [80, 70, 0, 5, 10, 0],
      wind_speed_10m_max: [10, 12, 30, 15, 10, 10],
      wind_gusts_10m_max: [20, 25, 55, 30, 20, 20],
      wind_direction_10m_dominant: [320, 300, 190, 200, 330, 330],
      relative_humidity_2m_min: [40, 45, 15, 30, 50, 50],
      et0_fao_evapotranspiration: [5, 5, 8, 6, 5, 5],
    },
    hourly: { ...hourlyFor(TODAY) },
  };

  it("writes one row per date, a forecast from today on, with no chance of rain for past days", () => {
    const rows = parseForecast(raw, TODAY, { ...TOWN, source: "town" }, "2026-07-10T05:00:00Z");
    expect(rows.map((r) => r.day)).toEqual(["2026-07-08", "2026-07-09", TODAY, "2026-07-11", "2026-07-12", "2026-07-13"]);
    expect(rows[0]).toMatchObject({ forecast: false, rain_prob: null, rain_mm: 6, skipped: 0 });
    expect(rows[2]).toMatchObject({ forecast: true, rain_prob: 0, tmax: 41, rh_min: 15, wind_dir: 190 });
    expect(rows[5].tmin).toBeNull();
  });

  it("works out spray windows for today and the next two days only", () => {
    const rows = parseForecast(raw, TODAY, { ...TOWN, source: "town" }, "2026-07-10T05:00:00Z");
    expect(rows[2].spray).toEqual([{ from: "08:00", to: "10:00" }]);
    expect(rows[0].spray).toEqual([]);
    expect(rows[5].spray).toEqual([]);
  });
});

describe("alerts", () => {
  it("names a sirocco instead of a heat alert, and the other alerts by their thresholds", () => {
    expect(alertsFor(day({ day: TODAY, tmax: 41, rh_min: 15, wind_dir: 190 }))).toEqual([{ day: TODAY, kind: "sirocco", value: 41 }]);
    expect(alertsFor(day({ day: TODAY, tmax: 39, rh_min: 40 }))).toEqual([{ day: TODAY, kind: "heat", value: 39 }]);
    expect(alertsFor(day({ day: TODAY, tmax: 35, rh_min: 15, wind_dir: 320 }))).toEqual([]);
    expect(alertsFor(day({ day: TODAY, tmin: 1.6 }))).toEqual([{ day: TODAY, kind: "frost", value: 2 }]);
    // Compared as shown: 37.6 °C shows as 38° and is a heat day; 2.6 °C shows as 3° and is not a frost.
    expect(alertsFor(day({ day: TODAY, tmax: 37.6 }))).toEqual([{ day: TODAY, kind: "heat", value: 38 }]);
    expect(alertsFor(day({ day: TODAY, tmin: 2.6 }))).toEqual([]);
    expect(alertsFor(day({ day: TODAY, gust_kmh: 64 }))).toEqual([{ day: TODAY, kind: "gale", value: 64 }]);
    expect(alertsFor(day({ day: TODAY, rain_mm: 35 }))).toEqual([{ day: TODAY, kind: "heavy_rain", value: 35 }]);
    // Heavy rain already fallen is not an alert.
    expect(alertsFor(day({ day: "2026-07-09", rain_mm: 35, forecast: false }))).toEqual([]);
  });

  it("lists today's and the next days' alerts by date, the most urgent first", () => {
    const days = [
      day({ day: "2026-07-09", tmax: 40 }),
      day({ day: TODAY, gust_kmh: 70, tmax: 39 }),
      day({ day: "2026-07-11", tmin: 0 }),
      day({ day: "2026-07-12", tmax: 45 }),
    ];
    expect(upcomingAlerts(days, TODAY, 2).map((a) => `${a.day}:${a.kind}`)).toEqual([`${TODAY}:heat`, `${TODAY}:gale`, "2026-07-11:frost"]);
  });
});

describe("the rain decision", () => {
  const settings = weatherSettings(null);

  it("adds up the two days before today, with missing days counting as dry", () => {
    expect(rainBefore([day({ day: "2026-07-08", rain_mm: 6 }), day({ day: "2026-07-09", rain_mm: 4.5 })], TODAY)).toBe(10.5);
    expect(rainBefore([day({ day: "2026-07-07", rain_mm: 30 }), day({ day: "2026-07-09", rain_mm: null })], TODAY)).toBe(0);
  });

  it("skips after the past rain or a likely rain today, and not when it is off", () => {
    expect(rainDecision([day({ day: "2026-07-09", rain_mm: 12 })], TODAY, settings)).toEqual({ reason: "past", mm: 12 });
    expect(rainDecision([day({ day: TODAY, rain_mm: 15, rain_prob: 80 })], TODAY, settings)).toEqual({ reason: "forecast", mm: 15 });
    expect(rainDecision([day({ day: TODAY, rain_mm: 15, rain_prob: 60 })], TODAY, settings)).toBeNull();
    expect(rainDecision([day({ day: "2026-07-09", rain_mm: 9 })], TODAY, settings)).toBeNull();
    expect(rainDecision([day({ day: "2026-07-09", rain_mm: 30 })], TODAY, { rain_skip: false, rain_mm: 10 })).toBeNull();
    expect(rainDecision([day({ day: "2026-07-09", rain_mm: 6 })], TODAY, { rain_skip: true, rain_mm: 5 })).toEqual({ reason: "past", mm: 6 });
  });

  it("reads the setting with its defaults", () => {
    expect(weatherSettings(null)).toEqual({ rain_skip: true, rain_mm: 10 });
    expect(weatherSettings({ rain_skip: false, rain_mm: 15 })).toEqual({ rain_skip: false, rain_mm: 15 });
    expect(weatherSettings({ rain_skip: "yes", rain_mm: 500 })).toEqual({ rain_skip: true, rain_mm: 10 });
  });

  it("calls a stored forecast fresh for six hours", () => {
    const row = day({ day: TODAY, fetched_at: "2026-07-10T05:00:00Z" });
    expect(isFresh(row, new Date("2026-07-10T10:59:00Z"))).toBe(true);
    expect(isFresh(row, new Date("2026-07-10T11:01:00Z"))).toBe(false);
    expect(isFresh(undefined, new Date())).toBe(false);
  });
});

describe("the rain skip in the tables", () => {
  function setup() {
    const state = makeState();
    const task = (id: string, partial: Partial<Row>) =>
      state.tasks.push({ id, plant_id: "p1", type: "water", rule_key: `water:${id}`, due_on: TODAY, window_end: null, title: "Water", instruction: "", status: "pending", acted_at: null, note: "", created_at: "2026-01-01T00:00:00Z", ...partial });
    task("today", {});
    task("overdue", { due_on: "2026-07-08" });
    task("tomorrow", { due_on: "2026-07-11" });
    task("prune", { type: "prune", rule_key: "prune:7:any" });
    // A water rule with no interval is a window: due on its first day, open until window_end.
    task("window", { due_on: "2026-07-01", window_end: "2026-09-30", rule_key: "water:7-8-9:any" });
    task("done", { status: "done", acted_at: "2026-07-09T07:00:00Z", due_on: "2026-07-09" });
    state.weather_days.push({ ...day({ day: TODAY }) });
    return { state, db: makeClient(state) };
  }

  it("closes the waterings due today or overdue, with the reason, and counts them on today's row", async () => {
    const { state, db } = setup();
    const days = [day({ day: "2026-07-08", rain_mm: 8 }), day({ day: "2026-07-09", rain_mm: 6 }), day({ day: TODAY })];
    const result = await applyRainSkip(db, days, TODAY, weatherSettings(null), "2026-07-10T05:00:00Z");
    expect(result).toEqual({ decision: { reason: "past", mm: 14 }, skipped: 2 });
    const byId = new Map(state.tasks.map((t) => [t.id, t]));
    expect(byId.get("today")).toMatchObject({ status: "skipped", acted_at: "2026-07-10T05:00:00Z", note: "Rain: 14 mm in the last two days" });
    expect(byId.get("overdue")?.status).toBe("skipped");
    expect(byId.get("tomorrow")?.status).toBe("pending");
    expect(byId.get("prune")?.status).toBe("pending");
    expect(byId.get("window")?.status).toBe("pending");
    expect(byId.get("done")?.status).toBe("done");
    expect(state.weather_days.find((r) => r.day === TODAY)?.skipped).toBe(2);
  });

  it("adds a second run's waterings to the day's count, and the dry run only counts", async () => {
    const { state, db } = setup();
    const days = [day({ day: "2026-07-09", rain_mm: 14 })];
    const preview = await previewRainSkip(db, days, TODAY, weatherSettings(null));
    expect(preview).toEqual({ decision: { reason: "past", mm: 14 }, skipped: 2 });
    expect(state.tasks.filter((t) => t.status === "skipped")).toHaveLength(0);
    await applyRainSkip(db, days, TODAY, weatherSettings(null));
    state.tasks.push({ ...state.tasks[0], id: "late", rule_key: "water:late", status: "pending", acted_at: null, note: "" });
    const second = await applyRainSkip(db, days, TODAY, weatherSettings(null));
    expect(second.skipped).toBe(1);
    expect(state.weather_days.find((r) => r.day === TODAY)?.skipped).toBe(3);
  });

  it("reads the setting, and throws rather than fall back to the defaults when the read fails", async () => {
    const state = makeState({ settings: [{ key: "weather", value: { rain_skip: false, rain_mm: 20 } }] });
    expect(await readWeatherSettings(makeClient(state))).toEqual({ rain_skip: false, rain_mm: 20 });
    expect(await readWeatherSettings(makeClient(makeState()))).toEqual({ rain_skip: true, rain_mm: 10 });
    const failing = makeClient(state, {
      onQuery: () => {
        throw new Error("timeout");
      },
    });
    await expect(readWeatherSettings(failing)).rejects.toThrow("timeout");
  });

  it("closes nothing when the rain stays under the threshold or the skip is off", async () => {
    const { state, db } = setup();
    const dry = await applyRainSkip(db, [day({ day: "2026-07-09", rain_mm: 4 })], TODAY, weatherSettings(null));
    expect(dry).toEqual({ decision: null, skipped: 0 });
    const off = await applyRainSkip(db, [day({ day: "2026-07-09", rain_mm: 40 })], TODAY, { rain_skip: false, rain_mm: 10 });
    expect(off.skipped).toBe(0);
    expect(state.tasks.filter((t) => t.status === "skipped")).toHaveLength(0);
  });

  it("keeps the skip count when the forecast is stored again", async () => {
    const { state, db } = setup();
    state.weather_days[0].skipped = 3;
    await storeWeather(db, [day({ day: TODAY, tmax: 33, skipped: 0 }), day({ day: "2026-07-11" })]);
    expect(state.weather_days.find((r) => r.day === TODAY)).toMatchObject({ tmax: 33, skipped: 3 });
    expect(state.weather_days).toHaveLength(2);
  });

  it("fetches for the farm plants' position and stores what came back", async () => {
    const state = makeState({ plants: [{ id: "p1", site: "farm", lat: 36.69, lng: 10.59 }, { id: "p2", site: "backyard", lat: 36.5, lng: 10.4 }] });
    let asked = "";
    const fakeFetch = (async (url: string) => {
      asked = url;
      return new Response(JSON.stringify({ daily: { time: [TODAY], temperature_2m_max: [30], precipitation_sum: [0] }, hourly: hourlyFor(TODAY) }), { status: 200 });
    }) as unknown as typeof fetch;
    const result = await refreshWeather(makeClient(state), TODAY, "2026-07-10T05:00:00Z", fakeFetch);
    expect(result.point).toEqual({ lat: 36.69, lng: 10.59, source: "farm" });
    expect(asked).toContain("latitude=36.69");
    expect(state.weather_days).toHaveLength(1);
    expect(state.weather_days[0]).toMatchObject({ day: TODAY, tmax: 30, lat: 36.69 });
  });

  it("reports a failed answer from Open-Meteo", async () => {
    const fakeFetch = (async () => new Response("busy", { status: 503 })) as unknown as typeof fetch;
    await expect(refreshWeather(makeClient(makeState()), TODAY, "2026-07-10T05:00:00Z", fakeFetch)).rejects.toThrow("Open-Meteo answered 503");
  });
});

describe("a real Open-Meteo answer", () => {
  // Saved on 2026-10-26 for Menzel Bouzelfa (Open-Meteo, CC BY 4.0): seven days back, seven ahead.
  const raw = JSON.parse(readFileSync(new URL("./data/open-meteo-2026-10-26.json", import.meta.url), "utf8")) as OpenMeteo;
  const rows = parseForecast(raw, "2026-10-26", { ...TOWN, source: "town" }, "2026-10-26T19:57:00Z");

  it("gives one row per date, past days without a chance of rain, coming days as forecasts", () => {
    expect(rows).toHaveLength(14);
    expect(rows[0].day).toBe("2026-10-19");
    expect(rows.at(-1)?.day).toBe("2026-11-01");
    expect(rows.filter((r) => r.forecast).map((r) => r.day)[0]).toBe("2026-10-26");
    expect(rows.filter((r) => !r.forecast).every((r) => r.rain_prob === null)).toBe(true);
    expect(rows.every((r) => r.tmax !== null && r.tmin !== null && r.rh_min !== null && r.wind_dir !== null)).toBe(true);
  });

  it("finds spray windows only in the three days from today, and the gale of 1 November", () => {
    expect(rows.filter((r) => r.spray.length > 0).every((r) => r.day >= "2026-10-26" && r.day <= "2026-10-28")).toBe(true);
    expect(rows.find((r) => r.day === "2026-10-28")?.spray.length).toBeGreaterThan(0);
    const gale = rows.find((r) => r.day === "2026-11-01");
    expect(gale && alertsFor(gale).map((a) => a.kind)).toEqual(["gale"]);
  });
});

describe("the morning weather push", () => {
  it("leads with today's and tomorrow's alerts and adds what the rain skipped", () => {
    const days = [day({ day: TODAY }), day({ day: "2026-07-11", tmax: 42, rh_min: 12, wind_dir: 180 }), day({ day: "2026-07-12", tmin: 0 })];
    const message = composeWeatherMessage(days, TODAY, { decision: { reason: "past", mm: 14 }, skipped: 3 });
    expect(message?.title).toBe("Weather: sirocco tomorrow, 42 °C");
    expect(message?.body.split("\n")).toEqual([
      "Sirocco tomorrow, 42 °C: Hot, dry south wind: water young plants deeply the evening before, shade and shelter them; put off planting and spraying.",
      "Rain 14 mm: 3 waterings skipped.",
    ]);
    expect(message?.tag).toBe("weather");
  });

  it("speaks of the rain alone when it is all there is, and says nothing on a quiet day", () => {
    const rain = composeWeatherMessage([day({ day: TODAY })], TODAY, { decision: { reason: "forecast", mm: 12 }, skipped: 1 });
    expect(rain?.title).toBe("Weather: 1 watering skipped after rain");
    expect(composeWeatherMessage([day({ day: TODAY })], TODAY, { decision: null, skipped: 0 })).toBeNull();
  });

  it("gives the advice for the day itself to today's alerts", () => {
    const message = composeWeatherMessage([day({ day: TODAY, tmax: 40, rh_min: 40 })], TODAY, { decision: null, skipped: 0 });
    expect(message?.body).toBe("Heat today, 40 °C: Water young plants early, before the heat, and keep the youngest shaded; no pruning or spraying.");
  });
});

describe("the weather block for Claude", () => {
  it("sums up the last days and lists the coming ones", () => {
    const days = [
      day({ day: "2026-07-08", rain_mm: 6, tmax: 31, tmin: 18 }),
      day({ day: "2026-07-09", tmax: 41, rh_min: 15, wind_dir: 190, tmin: 24 }),
      day({ day: TODAY, rain_mm: 1, rain_prob: 40 }),
      day({ day: "2026-07-11" }),
    ];
    const text = weatherBlock(days, TODAY);
    expect(text.split("\n")).toEqual([
      "Weather at the sites (Open-Meteo model data, fetched 2026-07-10 05:00 UTC).",
      "Last 2 days: rain 6 mm (2026-07-08: 6 mm); highest 41 °C, lowest 18 °C; sirocco 41 °C on 2026-07-09.",
      "- 2026-07-10 (today): 30/20 °C, rain 1 mm (40 %), wind 10 km/h, gusts 20 km/h from 320°, lowest humidity 50 %",
      "- 2026-07-11: 30/20 °C, rain 0 mm (0 %), wind 10 km/h, gusts 20 km/h from 320°, lowest humidity 50 %",
    ]);
  });

  it("says when the stored forecast is out of date", () => {
    const old = [day({ day: TODAY, fetched_at: "2026-07-07T05:00:00Z" })];
    expect(weatherBlock(old, TODAY).split("\n")[0]).toBe(
      "Weather at the sites (Open-Meteo model data, fetched 2026-07-07 05:00 UTC). The forecast is out of date: the last fetch failed since.",
    );
  });

  it("says when there is nothing stored", () => {
    expect(weatherBlock(null, TODAY)).toBe("No weather data is stored for the sites.");
    expect(weatherBlock([], TODAY)).toBe("No weather data is stored for the sites.");
  });
});

describe("the spray line", () => {
  it("knows the words that mean spraying, and not the ones that only look like it", () => {
    expect(callsForSpray("act on first sighting with savon noir and a trunk band")).toBe(true);
    expect(callsForSpray("Spray neem at dusk")).toBe(true);
    expect(callsForSpray("a white oil spray in winter")).toBe(true);
    expect(callsForSpray("pulvériser du savon noir le soir")).toBe(true);
    expect(callsForSpray("Hang a Medfly trap and remove fallen fruit")).toBe(false);
    expect(callsForSpray("Mulch the soil and press the olives for oil")).toBe(false);
    expect(callsForSpray("Bouillie bordelaise after the first autumn rain")).toBe(true);
    expect(callsForSpray("Récolter et presser pour l'huile d'olive")).toBe(false);
    expect(callsForSpray("huile blanche en hiver")).toBe(true);
    expect(callsForSpray("Look under the young leaves; soapy water if colonies are found.")).toBe(true);
  });

  it("does not count a text that says not to spray", () => {
    for (const text of [
      "Stop the savon noir sprays; give 30 L of rainwater at dusk and do not spray again until days are below 28 C",
      "No spray is needed: this is drought stress. Water 20 L at dawn and mulch.",
      "Avoid foliar sprays in the heat",
      "stop kaolin sprays three weeks before picking",
      "Deep-water weekly and mulch; do not spray or feed a stressed tree",
      "Renew the trunk band; don't spray, the ants are the cause.",
      "Recovered; no further spraying needed.",
      "Band the trunk. Spraying is not needed while ladybirds work.",
      "A spray isn't necessary this year",
      "Use sticky bands instead of sprays",
      "Ne pas pulvériser pendant la floraison",
      "Évitez de traiter au savon noir en plein soleil",
    ]) {
      expect(callsForSpray(text), text).toBe(false);
    }
  });

  it("still counts a spray asked for beside a refusal or a limit", () => {
    expect(callsForSpray("Avoid spraying at midday, spray savon noir at dusk")).toBe(true);
    expect(callsForSpray("Spray neem at dusk, not in the heat")).toBe(true);
    expect(callsForSpray("Spray at dusk but never in full sun")).toBe(true);
    expect(callsForSpray("No more than two sprays of savon noir, 7 days apart")).toBe(true);
    expect(callsForSpray("Spray white oil not before the leaves fall")).toBe(true);
    expect(callsForSpray("Do not prune now. Spray savon noir on the colonies.")).toBe(true);
  });

  it("reads the realistic texts of the corpus as expected, but for the misreadings it knows", () => {
    // Texts written to probe the rule (treatments, cautions, pre-harvest intervals, heat, water and
    // salt diagnoses, French edits), each with whether it asks for a spray. The harvest texts are
    // also kept off the line by their task type, the heat and salt ones by the diagnosis's answer.
    const KNOWN_MISREADINGS = new Set([
      "The scorch came from savon noir applied in full sun; rinse the leaves with rainwater at dusk and let the new growth harden.",
      "Scout for aphid colonies on the new flush; if ladybird or hoverfly larvae are present, leave them, as savon noir kills the larvae too.",
      "Work 10 L of mature compost into the mulch ring and keep the well water share under a third; foliar sprays give only a brief green-up on calcareous soil.",
      "Wash fruit that was sprayed with kaolin before eating or selling it.",
      "Pick the fruit when ripe; any fruit sprayed with neem in the past 3 days must be washed.",
      "Harvest from September; respect a 7-day interval after neem.",
      "Paint large cuts with lime; this replaces the copper spray some growers use.",
      "Wind scorch from the sirocco: water deeply and add a shade net; spraying in sirocco wind drifts and burns.",
      "Récolter 7 jours après le dernier traitement au savon noir.",
      "dont spray in summer, water at dawn",
    ]);
    const corpus = JSON.parse(readFileSync(new URL("./data/spray-texts.json", import.meta.url), "utf8")) as Array<{ text: string; spray: boolean }>;
    const wrong = corpus.filter((c) => callsForSpray(c.text) !== c.spray).map((c) => c.text);
    expect(wrong.filter((text) => !KNOWN_MISREADINGS.has(text))).toEqual([]);
    expect([...KNOWN_MISREADINGS].filter((text) => !wrong.includes(text))).toEqual([]);
  });

  it("names the plants whose tasks due by tomorrow, or latest diagnoses, ask for a spray, once each", () => {
    const task = (tag: string, instruction: string, due_on = TODAY, type: TaskType = "scout", rule_key = "scout:5-6:any") => ({ type, rule_key, title: "Scout", instruction, due_on, plant: { tag } });
    const diagnosis = (tag: string, text: string, spray: boolean | null, kind: CauseKind | null = "pest") => ({ tag, text, spray, kind });
    const tags = sprayCallers(
      [
        task("Loquat", "knock back aphids with savon noir"),
        task("Papaya", "Inspect fruit for stings"),
        task("Loquat", "renew trunk bands; spray savon noir", "2026-07-01"),
        task("Fig", "spray neem on the new flush", "2026-07-12"),
        task("Lemon", "spray savon noir", "2026-07-11", "protect"),
        task("Plum", "Take a new photo of the same part.", TODAY, "scout", "diagnosis:ph1"),
        { type: "scout" as const, rule_key: "diagnosis:ph2", title: "Re-photograph Mango: Spray scorch from savon noir", instruction: "Take a new photo.", due_on: TODAY, plant: { tag: "Mango" } },
        task("Quince", "Do not spray while the bees work the flowers"),
        task("Carob", "Pick the pods; leave 7 days after a neem spray before eating", TODAY, "harvest"),
        task("Walnut", "Copper on the cuts after pruning, a Bordeaux spray", TODAY, "prune"),
      ],
      [
        diagnosis("Olive", "Savon noir 2 %, evening spray, repeat in 7 days", true),
        diagnosis("Pomegranate", "Remove and burn the infected fruit", false),
        diagnosis("Vine", "Spray wettable sulphur at dawn", false),
        diagnosis("Peach", "Hand-pick the leaves; neem if the curl spreads", true, "disease"),
        diagnosis("Apricot", "Savon noir at 2 % at dusk on the colonies", null),
        diagnosis("Almond", "A savon noir spray at dusk", null, "sun_heat"),
        diagnosis("Citrus", "Flush the basin; spray kaolin at dusk", null, "salinity"),
      ],
      TODAY,
    );
    expect(tags).toEqual(["Loquat", "Lemon", "Walnut", "Olive", "Peach", "Apricot"]);
    expect(sprayCallers([], [], TODAY)).toEqual([]);
  });

  it("marks today's windows passed, now or ahead against the hour", () => {
    const windows = [
      { from: "06:00", to: "10:00" },
      { from: "13:00", to: "15:00" },
      { from: "16:00", to: "19:00" },
    ];
    expect(markWindows(windows, 14).map((w) => w.state)).toEqual(["passed", "now", "ahead"]);
    expect(markWindows(windows, 10).map((w) => w.state)).toEqual(["passed", "ahead", "ahead"]);
    expect(markWindows(windows, 5).map((w) => w.state)).toEqual(["ahead", "ahead", "ahead"]);
    expect(markWindows(windows, 20).map((w) => w.state)).toEqual(["passed", "passed", "passed"]);
  });
});
