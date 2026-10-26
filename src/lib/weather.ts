// Weather rules shared by the app and the functions: the alerts a day raises, the rain that skips
// the waterings, and the point the forecast is read for. The functions under api/ import it like
// dates.ts, so its own imports carry the .js extension Node's resolution needs.
import { addDays } from "./dates.js";
import { DEFAULT_WEATHER_SETTINGS, type WeatherDay, type WeatherSettings } from "../types.js";

/** Menzel Bouzelfa, used when no farm plant carries a GPS position. */
export const TOWN = { lat: 36.6833, lng: 10.5833 };

/** A day at or above this maximum is a heat alert. */
export const HEAT_C = 38;
/** Sirocco: at least this maximum, humidity down to SIROCCO_RH, and a wind from the south. */
export const SIROCCO_C = 34;
export const SIROCCO_RH = 25;
/** The southern sector the dominant wind must blow from for a sirocco, degrees. */
export const SOUTH_FROM = 120;
export const SOUTH_TO = 240;
/** A minimum at or below this is a frost alert (a few degrees of margin over the ground). */
export const FROST_C = 2;
/** Gusts at or above this are a gale alert, km/h. */
export const GALE_KMH = 60;
/** A forecast at or above this is a heavy-rain alert, mm. */
export const HEAVY_RAIN_MM = 30;
/** A rain forecast for today counts for the rain skip from this probability, %. */
export const RAIN_PROB_MIN = 70;
/** The rain skip adds up this many days before today. */
export const RAIN_DAYS = 2;

export type AlertKind = "heat" | "sirocco" | "frost" | "gale" | "heavy_rain";
/** Display order, the most urgent first. */
export const ALERT_KINDS: AlertKind[] = ["sirocco", "heat", "frost", "gale", "heavy_rain"];

export interface WeatherAlert {
  day: string;
  kind: AlertKind;
  /** The figure behind it: °C for heat, sirocco and frost, km/h for a gale, mm for rain. */
  value: number;
}

function num(v: number | null | undefined): number | null {
  return typeof v === "number" && Number.isFinite(v) ? v : null;
}

/** Whether a dominant wind direction is from the southern sector. */
export function fromSouth(dir: number | null): boolean {
  const d = num(dir);
  return d !== null && d >= SOUTH_FROM && d <= SOUTH_TO;
}

/** The alerts one day raises. A sirocco takes the place of a heat alert on the same day. */
export function alertsFor(day: WeatherDay): WeatherAlert[] {
  const out: WeatherAlert[] = [];
  // Compared as shown (rounded), so a day the card shows at 38° is a heat day.
  const whole = (v: number | null | undefined) => {
    const n = num(v);
    return n === null ? null : Math.round(n);
  };
  const tmax = whole(day.tmax);
  const tmin = whole(day.tmin);
  const rh = num(day.rh_min);
  const gust = whole(day.gust_kmh);
  const rain = whole(day.rain_mm);
  const sirocco = tmax !== null && tmax >= SIROCCO_C && rh !== null && rh <= SIROCCO_RH && fromSouth(day.wind_dir);
  if (sirocco && tmax !== null) out.push({ day: day.day, kind: "sirocco", value: tmax });
  else if (tmax !== null && tmax >= HEAT_C) out.push({ day: day.day, kind: "heat", value: tmax });
  if (tmin !== null && tmin <= FROST_C) out.push({ day: day.day, kind: "frost", value: tmin });
  if (gust !== null && gust >= GALE_KMH) out.push({ day: day.day, kind: "gale", value: gust });
  if (day.forecast && rain !== null && rain >= HEAVY_RAIN_MM) out.push({ day: day.day, kind: "heavy_rain", value: rain });
  return out;
}

/** The alerts of today and the following days (`span` days in all), by date, the most urgent first. */
export function upcomingAlerts(days: WeatherDay[], todayIso: string, span: number): WeatherAlert[] {
  const last = addDays(todayIso, span - 1);
  return days
    .filter((d) => d.day >= todayIso && d.day <= last)
    .sort((a, b) => a.day.localeCompare(b.day))
    .flatMap((d) => alertsFor(d).sort((a, b) => ALERT_KINDS.indexOf(a.kind) - ALERT_KINDS.indexOf(b.kind)));
}

/** Rain over the RAIN_DAYS days before today, mm; days with no row or no figure count as dry. */
export function rainBefore(days: WeatherDay[], todayIso: string): number {
  const from = addDays(todayIso, -RAIN_DAYS);
  const total = days.filter((d) => d.day >= from && d.day < todayIso).reduce((sum, d) => sum + (num(d.rain_mm) ?? 0), 0);
  return Math.round(total * 10) / 10;
}

export interface RainDecision {
  /** "past": the rain of the last two days; "forecast": today's likely rain. */
  reason: "past" | "forecast";
  mm: number;
}

/**
 * Whether the waterings due today should be skipped: the rain of the last two days reaches the
 * threshold, or today's forecast does at RAIN_PROB_MIN % or more. Null when they should not.
 */
export function rainDecision(days: WeatherDay[], todayIso: string, settings: WeatherSettings): RainDecision | null {
  if (!settings.rain_skip) return null;
  const past = rainBefore(days, todayIso);
  if (past >= settings.rain_mm) return { reason: "past", mm: past };
  const today = days.find((d) => d.day === todayIso);
  const rain = num(today?.rain_mm);
  const prob = num(today?.rain_prob);
  if (rain !== null && rain >= settings.rain_mm && prob !== null && prob >= RAIN_PROB_MIN) {
    return { reason: "forecast", mm: Math.round(rain * 10) / 10 };
  }
  return null;
}

/** The stored setting with the defaults filled in; a threshold outside 1 to 100 mm falls back to the default. */
export function weatherSettings(raw: unknown): WeatherSettings {
  const r = (raw && typeof raw === "object" ? raw : {}) as Partial<Record<keyof WeatherSettings, unknown>>;
  const mm = typeof r.rain_mm === "number" && Number.isFinite(r.rain_mm) && r.rain_mm >= 1 && r.rain_mm <= 100 ? r.rain_mm : DEFAULT_WEATHER_SETTINGS.rain_mm;
  return { rain_skip: typeof r.rain_skip === "boolean" ? r.rain_skip : DEFAULT_WEATHER_SETTINGS.rain_skip, rain_mm: mm };
}

/** Whether a stored forecast is still fresh enough for Today: fetched within `hours` of `now`. */
export function isFresh(day: WeatherDay | undefined, now: Date, hours = 6): boolean {
  if (!day) return false;
  const fetched = Date.parse(day.fetched_at);
  return Number.isFinite(fetched) && now.getTime() - fetched < hours * 3600_000;
}
