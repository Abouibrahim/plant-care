// The weather at the sites from Open-Meteo (free for non-commercial use, no key, CC BY 4.0): the
// point it is read for, the request, one row per date with the spray windows, storing them in
// weather_days, the 06:00 rain skip of the waterings due, and the morning weather push. Run by
// /api/daily (fetch, then skip and push) and /api/weather (fetch only, for Today).
import type { SupabaseClient } from "@supabase/supabase-js";
import { en } from "../src/i18n/en.js";
import { addDays } from "../src/lib/dates.js";
import { rainDecision, TOWN, upcomingAlerts, weatherSettings, type RainDecision } from "../src/lib/weather.js";
import type { PushMessage, SprayWindow, WeatherDay, WeatherPoint, WeatherSettings } from "../src/types.js";

export const FORECAST_URL = "https://api.open-meteo.com/v1/forecast";
/** Days before today the request asks for: the rain skip needs two, the Claude context seven. */
const PAST_DAYS = 7;
const FORECAST_DAYS = 7;
const FETCH_TIMEOUT_MS = 10_000;
/** Farm GPS positions further than this from the town are left out (a photo taken somewhere else). */
const RADIUS_KM = 30;
/** Spray windows are worked out for today and the next two days. */
const SPRAY_DAYS = 3;
/** First and last starting hour of a spray window; a window ends by 19:00. */
const SPRAY_FIRST_HOUR = 6;
const SPRAY_LAST_HOUR = 18;
/** Savon noir and oils scorch leaves in heat and drift in wind; rain washes them off. */
const SPRAY_MAX_C = 28;
const SPRAY_MAX_WIND_KMH = 15;
const SPRAY_MAX_GUST_KMH = 25;
/** The hour itself and this many after must stay dry. */
const SPRAY_DRY_HOURS = 6;
const SPRAY_RAIN_MM = 0.5;
const SPRAY_MIN_HOURS = 2;

const DAILY = [
  "temperature_2m_max",
  "temperature_2m_min",
  "precipitation_sum",
  "precipitation_probability_max",
  "wind_speed_10m_max",
  "wind_gusts_10m_max",
  "wind_direction_10m_dominant",
  "relative_humidity_2m_min",
  "et0_fao_evapotranspiration",
];
const HOURLY = ["temperature_2m", "precipitation", "wind_speed_10m", "wind_gusts_10m"];

/** The weather_days table does not exist yet (before the Phase 8 SQL). */
export class WeatherUnavailable extends Error {
  constructor(message: string) {
    super(message);
    this.name = "WeatherUnavailable";
  }
}

/** The parts of an Open-Meteo answer the app reads: arrays keyed by variable, with a `time` array. */
export interface OpenMeteo {
  daily?: Record<string, unknown[] | undefined>;
  hourly?: Record<string, unknown[] | undefined>;
}

function missingTable(error: { code?: string; message?: string }): boolean {
  return error.code === "PGRST205" || error.code === "42P01" || /weather_days/.test(error.message ?? "") && /could not find|does not exist/i.test(error.message ?? "");
}

function at(values: unknown[] | undefined, i: number): number | null {
  const v = values?.[i];
  return typeof v === "number" && Number.isFinite(v) ? v : null;
}

function distanceKm(a: { lat: number; lng: number }, b: { lat: number; lng: number }): number {
  const rad = (d: number) => (d * Math.PI) / 180;
  const dLat = rad(b.lat - a.lat);
  const dLng = rad(b.lng - a.lng);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(rad(a.lat)) * Math.cos(rad(b.lat)) * Math.sin(dLng / 2) ** 2;
  return 2 * 6371 * Math.asin(Math.sqrt(h));
}

/** The mean of the positions within RADIUS_KM of the town, or the town when none is. */
export function pointFrom(positions: Array<{ lat: number | null; lng: number | null }>): WeatherPoint {
  const near = positions
    .filter((p): p is { lat: number; lng: number } => typeof p.lat === "number" && typeof p.lng === "number" && Number.isFinite(p.lat) && Number.isFinite(p.lng))
    .filter((p) => distanceKm(TOWN, p) <= RADIUS_KM);
  if (near.length === 0) return { ...TOWN, source: "town" };
  const lat = near.reduce((s, p) => s + p.lat, 0) / near.length;
  const lng = near.reduce((s, p) => s + p.lng, 0) / near.length;
  return { lat: Math.round(lat * 10_000) / 10_000, lng: Math.round(lng * 10_000) / 10_000, source: "farm" };
}

/** Where the forecast is read: the farm plants' mean GPS position, or the town. */
export async function weatherPoint(db: SupabaseClient): Promise<WeatherPoint> {
  const { data, error } = await db.from("plants").select("lat, lng").eq("site", "farm").limit(1000);
  if (error) throw error;
  return pointFrom((data ?? []) as Array<{ lat: number | null; lng: number | null }>);
}

export function forecastUrl(point: WeatherPoint): string {
  const q = new URLSearchParams({
    latitude: String(point.lat),
    longitude: String(point.lng),
    daily: DAILY.join(","),
    hourly: HOURLY.join(","),
    past_days: String(PAST_DAYS),
    forecast_days: String(FORECAST_DAYS),
    timezone: "Africa/Tunis",
  });
  return `${FORECAST_URL}?${q.toString()}`;
}

export async function fetchForecast(point: WeatherPoint, fetchImpl: typeof fetch = fetch): Promise<OpenMeteo> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
  try {
    const res = await fetchImpl(forecastUrl(point), { signal: controller.signal });
    if (!res.ok) throw new Error(`Open-Meteo answered ${res.status}`);
    return (await res.json()) as OpenMeteo;
  } finally {
    clearTimeout(timer);
  }
}

function hourLabel(hour: number): string {
  return `${String(hour).padStart(2, "0")}:00`;
}

/** The hours of one day that suit spraying, joined into windows of SPRAY_MIN_HOURS or more. */
export function sprayWindows(hourly: NonNullable<OpenMeteo["hourly"]>, day: string): SprayWindow[] {
  const times = (hourly.time ?? []) as unknown[];
  const good: number[] = [];
  for (let i = 0; i < times.length; i++) {
    const time = times[i];
    if (typeof time !== "string" || !time.startsWith(`${day}T`)) continue;
    const hour = Number(time.slice(11, 13));
    if (!Number.isInteger(hour) || hour < SPRAY_FIRST_HOUR || hour > SPRAY_LAST_HOUR) continue;
    // Temperature and wind are the values at h:00; gusts and rain at index h cover the hour before
    // h:00, so the spray hour h:00 to (h+1):00 reads gusts at h+1 too and rain from h+1 on.
    const temp = at(hourly.temperature_2m, i);
    const wind = at(hourly.wind_speed_10m, i);
    const gust = Math.max(at(hourly.wind_gusts_10m, i) ?? 0, at(hourly.wind_gusts_10m, i + 1) ?? 0);
    if (temp === null || wind === null || temp > SPRAY_MAX_C || wind > SPRAY_MAX_WIND_KMH) continue;
    if (gust > SPRAY_MAX_GUST_KMH) continue;
    // Rain in this hour or the next six washes the spray off; an unknown hour counts as wet.
    let rain = 0;
    let known = true;
    for (let j = i + 1; j <= i + 1 + SPRAY_DRY_HOURS; j++) {
      if (j >= times.length) break;
      const p = at(hourly.precipitation, j);
      if (p === null) {
        known = false;
        break;
      }
      rain += p;
    }
    if (!known || rain >= SPRAY_RAIN_MM) continue;
    good.push(hour);
  }
  const windows: SprayWindow[] = [];
  let start = -1;
  let prev = -1;
  const close = () => {
    if (start >= 0 && prev - start + 1 >= SPRAY_MIN_HOURS) windows.push({ from: hourLabel(start), to: hourLabel(prev + 1) });
  };
  for (const hour of good) {
    if (hour !== prev + 1) {
      close();
      start = hour;
    }
    prev = hour;
  }
  close();
  return windows;
}

/** One row per date of the answer; spray windows for today and the next two days. */
export function parseForecast(raw: OpenMeteo, todayIso: string, point: WeatherPoint, fetchedAt: string): WeatherDay[] {
  const daily = raw.daily ?? {};
  const times = (daily.time ?? []) as unknown[];
  const sprayUntil = addDays(todayIso, SPRAY_DAYS - 1);
  const rows: WeatherDay[] = [];
  times.forEach((time, i) => {
    if (typeof time !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(time)) return;
    const forecast = time >= todayIso;
    rows.push({
      day: time,
      tmax: at(daily.temperature_2m_max, i),
      tmin: at(daily.temperature_2m_min, i),
      rain_mm: at(daily.precipitation_sum, i),
      // A chance of rain means nothing for a day already past.
      rain_prob: forecast ? at(daily.precipitation_probability_max, i) : null,
      wind_kmh: at(daily.wind_speed_10m_max, i),
      gust_kmh: at(daily.wind_gusts_10m_max, i),
      wind_dir: at(daily.wind_direction_10m_dominant, i),
      rh_min: at(daily.relative_humidity_2m_min, i),
      et0_mm: at(daily.et0_fao_evapotranspiration, i),
      spray: raw.hourly && forecast && time <= sprayUntil ? sprayWindows(raw.hourly, time) : [],
      forecast,
      skipped: 0,
      lat: point.lat,
      lng: point.lng,
      fetched_at: fetchedAt,
    });
  });
  return rows;
}

/** Writes the rows, one per date; `skipped` is left out so a refresh keeps what the 06:00 rain skip counted. */
export async function storeWeather(db: SupabaseClient, days: WeatherDay[]): Promise<void> {
  if (days.length === 0) return;
  const rows = days.map((d) => {
    const row: Partial<WeatherDay> = { ...d };
    delete row.skipped;
    return row;
  });
  const { error } = await db.from("weather_days").upsert(rows, { onConflict: "day" });
  if (error) {
    if (missingTable(error)) throw new WeatherUnavailable(error.message);
    throw error;
  }
}

/** Fetches the forecast for the point and stores it. */
export async function refreshWeather(
  db: SupabaseClient,
  todayIso: string,
  fetchedAt: string = new Date().toISOString(),
  fetchImpl: typeof fetch = fetch,
): Promise<{ days: WeatherDay[]; point: WeatherPoint }> {
  const point = await weatherPoint(db);
  const raw = await fetchForecast(point, fetchImpl);
  const days = parseForecast(raw, todayIso, point, fetchedAt);
  if (days.length === 0) throw new Error("Open-Meteo returned no days");
  await storeWeather(db, days);
  return { days, point };
}

/**
 * The stored days from `from` to `to`, by date. Null when the table is missing or the read fails:
 * the weather only adds context to a Claude call, which must not fail for it.
 */
export async function loadWeather(db: SupabaseClient, from: string, to: string): Promise<WeatherDay[] | null> {
  const { data, error } = await db.from("weather_days").select("*").gte("day", from).lte("day", to).order("day", { ascending: true });
  if (error) return null;
  return (data ?? []) as WeatherDay[];
}

/**
 * The weather setting from the settings table, with the defaults when the row or the table is
 * missing. Any other failure throws, so a setting the grower turned off is never replaced by the
 * defaults on a bad read: the run then reports it and closes nothing.
 */
export async function readWeatherSettings(db: SupabaseClient): Promise<WeatherSettings> {
  const { data, error } = await db.from("settings").select("value").eq("key", "weather").maybeSingle();
  if (error) {
    if (error.code === "PGRST205" || error.code === "42P01") return weatherSettings(null);
    throw error;
  }
  return weatherSettings((data as { value?: unknown } | null)?.value);
}

export interface RainSkip {
  decision: RainDecision | null;
  skipped: number;
}

/**
 * The periodic waterings due today or overdue. A watering window (a water rule with no interval,
 * due on its first day and open until `window_end`) is left alone: closing it would end the
 * season's reminder, since the expansion never writes a row twice.
 */
function dueWaterings(db: SupabaseClient, todayIso: string, run: "update" | "count", nowIso = "", note = "") {
  const base =
    run === "update"
      ? db.from("tasks").update({ status: "skipped", acted_at: nowIso, note }).select("id")
      : db.from("tasks").select("id", { count: "exact", head: true });
  return base.eq("type", "water").eq("status", "pending").is("window_end", null).lte("due_on", todayIso);
}

/** What the rain skip would close today, without closing it: the dry run's preview. */
export async function previewRainSkip(db: SupabaseClient, days: WeatherDay[], todayIso: string, settings: WeatherSettings): Promise<RainSkip> {
  const decision = rainDecision(days, todayIso, settings);
  if (!decision) return { decision: null, skipped: 0 };
  const { count, error } = await dueWaterings(db, todayIso, "count");
  if (error) throw error;
  return { decision, skipped: count ?? 0 };
}

/**
 * Closes the periodic waterings due today or overdue as skipped when the rain decided so, with the
 * reason in the note, and adds them to today's count on the weather row (a second run the same day
 * adds what it closed). Waterings due later keep their dates.
 */
export async function applyRainSkip(
  db: SupabaseClient,
  days: WeatherDay[],
  todayIso: string,
  settings: WeatherSettings,
  nowIso: string = new Date().toISOString(),
): Promise<RainSkip> {
  const decision = rainDecision(days, todayIso, settings);
  if (!decision) return { decision: null, skipped: 0 };
  const { data, error } = await dueWaterings(db, todayIso, "update", nowIso, en.weather.rainNote(decision.mm, decision.reason));
  if (error) throw error;
  const skipped = ((data ?? []) as unknown[]).length;
  if (skipped > 0) {
    const { data: row, error: readErr } = await db.from("weather_days").select("skipped").eq("day", todayIso).maybeSingle();
    if (readErr) throw readErr;
    const before = (row as { skipped?: number } | null)?.skipped ?? 0;
    const { error: countErr } = await db.from("weather_days").update({ skipped: before + skipped }).eq("day", todayIso);
    if (countErr) throw countErr;
  }
  return { decision, skipped };
}

/** The morning weather push: today's and tomorrow's alerts with what to do, and what the rain skipped. Null when there is nothing to say. */
export function composeWeatherMessage(days: WeatherDay[], todayIso: string, rain: RainSkip): PushMessage | null {
  const w = en.weather;
  const alerts = upcomingAlerts(days, todayIso, 2);
  const when = (day: string) => (day === todayIso ? w.when.today : w.when.tomorrow);
  // Advice for the day itself, or for preparing the day before.
  const advice = (day: string) => (day === todayIso ? w.adviceToday : w.advice);
  const lines = alerts.map((a) => w.pushLine(w.alertName[a.kind], when(a.day), w.alertValue(a.kind, a.value), advice(a.day)[a.kind]));
  if (rain.decision && rain.skipped > 0) lines.push(w.skippedLine(rain.skipped, rain.decision.mm));
  if (lines.length === 0) return null;
  const first = alerts[0];
  const title = first
    ? w.pushTitle(w.alertName[first.kind], when(first.day), w.alertValue(first.kind, first.value))
    : w.pushRainTitle(rain.skipped);
  return { title, body: lines.join("\n"), tag: "weather", url: w.openUrl };
}
