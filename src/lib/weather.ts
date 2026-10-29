// Weather rules shared by the app and the functions: the alerts a day raises, the rain that skips
// the waterings, and the point the forecast is read for. The functions under api/ import it like
// dates.ts, so its own imports carry the .js extension Node's resolution needs.
import { addDays } from "./dates.js";
import { DEFAULT_WEATHER_SETTINGS, DIAGNOSIS_RULE_PREFIX, type CauseKind, type TaskType, type WeatherDay, type WeatherSettings } from "../types.js";

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

// ---- spraying ------------------------------------------------------------------------

// Whether a calendar task, or a diagnosis saved before its own `spray` answer existed (0.8.1), asks
// for a spray is read from Claude's wording (and the grower's edits in French). It is a heuristic,
// tried on some 290 realistic texts kept in tests/data/spray-texts.json (savon noir and oil
// treatments, cautions, pre-harvest intervals, heat, water and salt diagnoses); an unusual sentence
// can still be misread, which is why the card names the plants it counted.

/**
 * The organic sprays the site uses, as nouns. A bare "oil" or "huile" is left out ("olive oil",
 * "soil", "huile d'olive"), and so are copper or sulphur on their own (a colour, a soil amendment),
 * a bare "bordeaux" ("rouge bordeaux") and neem cake (a soil amendment).
 */
const SPRAY_PRODUCTS = String.raw`savon noir|savon potassique|black soap|insecticidal soap|potassium soap|soapy water|soap solution|eau savonneuse|neem(?: oil)?(?!\s+(?:cake|meal))|huile de neem|(?:white|summer|winter|dormant|horticultural|mineral|paraffinic|paraffin) oil|huile (?:blanche|de paraffine|horticole|min[ée]rale)|huile d['’](?:[ée]t[ée]|hiver)|bordeaux\s+(?:mixture|spray)|bouillie bordelaise|copper (?:fungicide|hydroxide|oxychloride|sulphate|sulfate|soap)|cuivre|wettable sul(?:ph|f)ur|soufre mouillable|kaolin(?: clay)?|bacillus thuringiensis|bt|spinosad|bicarbonate`;
/** What may stand in a list of sprays: "neem, savon noir or white oil", "oil, soap and kaolin sprays". */
const LIST_ITEM = String.raw`(?:${SPRAY_PRODUCTS}|oils?|soaps?|savon|huiles?|sprays?)`;

/** A spray by name, or the verb (English and French); "sprayed" tells of a spray already made. */
const SPRAY_WORDS = new RegExp(String.raw`(?<![\p{L}\p{N}])(?:${SPRAY_PRODUCTS}|(?<!(?:flower|floral|salt|sea)\s+)(?:re)?spray(?:s|ing)?|pulv[ée]ris\p{L}*)(?![\p{L}\p{N}])`, "iu");

/** Abbreviations whose stops are not the end of a clause. */
const ABBREVIATIONS = /(?<!\p{L})(?:e\.g|i\.e|etc)\./giu;
/**
 * Phrases that read like refusals and are not, taken out first: limits ("no more than two sprays",
 * "do not exceed 2 %", "not before dusk"), urgency ("without waiting", "sans attendre"), a partial
 * spray ("don't spray the whole tree, just the shoots"), drift ("avoid spray drift") and a repeat
 * ("a second spray is rarely needed", which asks for the first).
 */
const NOT_A_REFUSAL = new RegExp(
  [
    String.raw`(?<!\p{L})(?:no|not)\s+(?:more|later|stronger)\s+than(?!\p{L})`,
    String.raw`(?<!\p{L})not\s+before(?!\p{L})`,
    String.raw`(?<!\p{L})(?:do\s+not|don['’]t|never)\s+exceed(?!\p{L})`,
    String.raw`(?<!\p{L})ne\s+(?:pas\s+)?d[ée]pass\p{L}*`,
    String.raw`(?<!\p{L})pas\s+(?:plus\s+de|avant)(?!\p{L})`,
    String.raw`(?<!\p{L})(?:without|sans)\s+(?:waiting|delay|attendre|tarder)(?!\p{L})`,
    String.raw`(?<!\p{L})(?:do\s+not|don['’]t)\s+wait(?!\p{L})`,
    String.raw`(?<!\p{L})(?:do\s+not|don['’]t|no\s+need\s+to)\s+(?=spray\s+(?:the\s+)?(?:whole|entire|all)(?!\p{L}))`,
    String.raw`(?<!\p{L})avoid(?:ing)?\s+(?:spray\s+)?drift(?!\p{L})`,
    String.raw`(?<!\p{L})(?:a\s+)?(?:second|third|further|another|follow-up|repeat)\s+(?:(?:spray|one|treatment|application)\s+)?(?:is|are)\s+(?:usually\s+|often\s+)?(?:not|rarely|seldom)\s+(?:needed|necessary|required)(?!\p{L})`,
  ].join("|"),
  "giu",
);
/** A comma inside a list of sprays, dropped so the list stays one clause under one refusal. */
const LIST_COMMA = new RegExp(String.raw`((?<!\p{L})${LIST_ITEM})\s*,(?=\s*(?:(?:and|or|et|ou|ni)\s+)?${LIST_ITEM}(?!\p{L}))`, "giu");
/** A bracket that opens a list of sprays ("oil sprays (white oil, neem)"), dropped for the same reason. */
const LIST_BRACKET = new RegExp(String.raw`\((?=\s*${LIST_ITEM}(?!\p{L}))`, "giu");
/**
 * Sentences end at a stop that is not a decimal point, ";", "!", "?" or a new line. Clauses also end
 * at a comma, a colon, a bracket, a dash, "but", "so" or "then", and at "and" or "et" when a spray
 * verb follows ("avoid open flowers and spray the shoots").
 */
const SENTENCE_BREAK = /\.(?!\d)|[;!?\n]/u;
const CLAUSE_BREAK =
  /\.(?!\d)|[;:!?\n,()—–]|\s-\s|\s(?:but|mais|however|cependant|so|donc|then|puis|alors)\s|\s(?:and|et)\s(?=(?:re)?spray|pulv|appl|treat|trait|use|utilis)/iu;

/**
 * A refusal anywhere before the spray word in its clause: "do not spray", "no spray is needed",
 * "avoid foliar sprays", "refrain from spraying", "nothing to spray", "bands work better than
 * spraying", "instead of sprays", "ne pas pulvériser", "aucune pulvérisation", "éviter".
 */
const SPRAY_REFUSAL =
  /(?<![\p{L}\p{N}])(?:no|not|never|none|nor|nothing|avoid\p{L}*|refrain\p{L}*|without|ni|pas|sans|jamais|aucun\p{L}*|rien|[ée]vit\p{L}*|instead\s+of|rather\s+than|better\s+than|than\s+any|au\s+lieu\s+d\p{L}*|plut[ôo]t\s+que|mieux\s+que)(?![\p{L}\p{N}])|n['’]t(?!\p{L})/iu;
/**
 * A deferral just before the spray word: "stop the savon noir sprays", "hold off spraying", "put off
 * any spray", "skip the neem spray", "too late to spray", "wait 3 days after a savon noir spray",
 * "prefer bands to sprays".
 */
const SPRAY_DEFERRAL =
  /(?<!\p{L})(?:stop\p{L}*|cease|hold(?:\s+(?:off|back))?(?:\s+on)?|put(?:ting)?\s+off|postpon\p{L}*|delay\p{L}*|skip\p{L}*|resist(?:\s+the\s+urge\s+to)?|too\s+late\s+to|suspend\p{L}*|arr[êe]t\p{L}*|(?:after|since|following)\s+(?:the\s+)?(?:last|any|a|an|each))\s+(?:(?:the|any|all|a|further|more|les?|la|tout(?:es)?)\s+)?$|(?<!\p{L})(?:prefer(?:s|red)?|pr[ée]f[ée]r\p{L}*)(?!\p{L}).*(?<!\p{L})(?:to|over|[àa])\s+(?:(?:the|a|any|les?|la)\s+)?$/iu;
/** A deferral that keeps the spray today or a repeat: "hold off until dusk", "repeat after the last spray". */
const DEFERRAL_KEPT =
  /(?<!\p{L})(?:until|till|to|for|jusqu['’]?\s*(?:[àa]|au))\s+(?:the\s+)?(?:evening|dusk|sunset|tonight|soir|cr[ée]puscule)(?!\p{L})|(?<!\p{L})(?:repeat\p{L}*|again|renew\p{L}*|reappl\p{L}*|r[ée]p[ée]t\p{L}*|renouvel\p{L}*)(?!\p{L})/iu;
/**
 * A clause that says the spray is not wanted, wherever it says it: "spraying is not needed", "sprays
 * won't help", "would scorch the leaves", "of no use", "do little", "not worth it", "pointless",
 * "rarely needed", "more harm than good", "has worked", "none needed", "even with savon noir", "kaolin
 * residue", "keep savon noir off the flowers", "a kaolin paste", "ne sert à rien", "à éviter".
 */
const SPRAY_NOT_NEEDED = new RegExp(
  [
    String.raw`(?:(?<!\p{L})(?:not|no\s+longer)|n['’]t)\s+(?:\p{L}+\s+)?(?:needed|necessary|required|recommended|advised|useful|warranted|called\s+for|worth\p{L}*|effective)(?!\p{L})`,
    String.raw`(?<!\p{L})(?:will\s+not|won['’]t|would\s+not|wouldn['’]t|do\s+not|don['’]t|does\s+not|doesn['’]t|did\s+not|didn['’]t|cannot|can\s+not|can['’]t|could\s+not|couldn['’]t)\s+(?:\p{L}+\s+)?(?:help|work|correct|cure|fix|reach|remove|heal|save|matter)(?!\p{L})`,
    String.raw`(?<!\p{L})would\s+(?:only\s+|just\s+|also\s+)?(?:make|add|scorch|burn|harm|damage|stress|worsen|hurt|drift|be\s+washed)(?!\p{L})`,
    String.raw`(?<!\p{L})(?:unnecessary|unneeded|needless|pointless|useless|ineffective|inutile\p{L}*|inefficace\p{L}*|d[ée]conseill\p{L}*|residues?|r[ée]sidus?)(?!\p{L})`,
    String.raw`(?<!\p{L})(?:rarely|seldom|unlikely\s+to\s+be)\s+(?:needed|necessary|required|useful|worth\p{L}*)(?!\p{L})`,
    String.raw`(?<!\p{L})(?:(?:no|little|of\s+no)\s+use|do(?:es)?\s+little|not\s+worth|best\s+avoided|too\s+late|more\s+harm\s+than\s+good|ha(?:s|ve)\s+worked|ha(?:s|ve)\s+done\s+(?:its|their)\s+job|not\s+(?:this\s+year|now)|(?:none|nothing|no)\s+(?:needed|required|necessary)|(?:needed|required)\s*:?\s*none|even\s+with|m[êe]me\s+avec|sert\s+[àa]\s+rien|[àa]\s+[ée]viter|pas\s+(?:n[ée]cessaire|utile|conseill)\p{L}*)(?!\p{L})`,
    String.raw`(?<!\p{L})keep(?!\p{L}).*(?<!\p{L})(?:off|away)(?!\p{L})`,
    String.raw`(?<!\p{L})(?:paint\p{L}*|paste|whitewash\p{L}*|badigeon\p{L}*)(?!\p{L})`,
  ].join("|"),
  "iu",
);
/** A condition that turns a refusal into a spray when needed: "do not spray unless colonies spread". */
const SPRAY_UNLESS = /(?<!\p{L})(?:unless|sauf\s+si|[àa]\s+moins\s+qu)/iu;

/** Diagnoses this recent can still call for spraying (a treatment is usually repeated over two weeks). */
export const SPRAY_DIAGNOSIS_DAYS = 14;

/**
 * Whether a text asks for spraying: some clause names a spray with no refusal or deferral before it
 * and nothing in it saying the spray is not wanted. "Do not spray a stressed tree" and "No spray is
 * needed: water at dawn" do not; "Avoid spraying at midday, spray savon noir at dusk" does through
 * its second clause, and "Do not spray unless the colonies spread" does as a condition.
 */
export function callsForSpray(text: string): boolean {
  const plain = text.replace(ABBREVIATIONS, " ").replace(NOT_A_REFUSAL, " ").replace(LIST_COMMA, "$1").replace(LIST_BRACKET, " ");
  return plain.split(SENTENCE_BREAK).some((sentence) =>
    sentence.split(CLAUSE_BREAK).some((clause) => {
      const m = SPRAY_WORDS.exec(clause);
      if (m === null) return false;
      if (SPRAY_UNLESS.test(clause)) return true;
      const before = clause.slice(0, m.index);
      if (SPRAY_REFUSAL.test(before)) return false;
      if (SPRAY_DEFERRAL.test(before) && !DEFERRAL_KEPT.test(clause)) return false;
      // A spray named alone ("Spraying, which would add salt stress, is not advised"; "Sprays: none
      // needed") is judged by the rest of its sentence.
      const rest = before + clause.slice(m.index + m[0].length);
      const bare = (rest.match(/\p{L}+/gu) ?? []).length <= 1;
      return !SPRAY_NOT_NEEDED.test(bare ? sentence : clause);
    }),
  );
}

/** A pending task as the spray line reads it. */
export interface SprayTask {
  type: TaskType;
  rule_key: string;
  title: string;
  instruction: string;
  due_on: string;
  plant: { tag: string } | null;
}

/** A plant's latest recent diagnosis as the spray line reads it. */
export interface SprayTreatment {
  tag: string;
  text: string;
  /** Claude's own answer to "does the treatment ask for a spray?"; null on diagnoses saved before 0.8.1. */
  spray: boolean | null;
  /** The leading cause's kind, for the diagnoses without that answer. */
  kind: CauseKind | null;
}

/** Task types whose work can be a spray (a pest scout, a protection, copper on pruning cuts, a foliar feed). */
const SPRAY_TASK_TYPES = new Set<TaskType>(["scout", "protect", "prune", "feed"]);
/** Causes a spray can treat; water, heat, salt and mechanical damage are not among them. */
const SPRAY_CAUSE_KINDS = new Set<CauseKind>(["pest", "disease", "nutrient", "other"]);

/**
 * The plants something calls for spraying on: pending scout, protect, prune or feed tasks due by
 * tomorrow (overdue ones and open windows included) whose title or instruction asks for a spray,
 * then the latest recent diagnoses whose treatment does. One tag each, in that order. A diagnosis's
 * re-photograph reminder is left out: its title quotes the cause ("Spray scorch from savon noir"),
 * and the diagnosis counts by its treatment: by Claude's `spray` answer, or for an older diagnosis
 * without one, by its wording when the leading cause is one a spray can treat.
 */
export function sprayCallers(tasks: SprayTask[], treatments: SprayTreatment[], todayIso: string): string[] {
  const until = addDays(todayIso, 1);
  const tags: string[] = [];
  const add = (tag: string | undefined) => {
    const t = tag?.trim();
    if (t && !tags.includes(t)) tags.push(t);
  };
  for (const task of tasks) {
    if (task.due_on > until || !SPRAY_TASK_TYPES.has(task.type) || task.rule_key.startsWith(DIAGNOSIS_RULE_PREFIX)) continue;
    if (callsForSpray(`${task.title}. ${task.instruction}`)) add(task.plant?.tag);
  }
  for (const d of treatments) {
    if (d.spray ?? (d.kind !== null && SPRAY_CAUSE_KINDS.has(d.kind) && callsForSpray(d.text))) add(d.tag);
  }
  return tags;
}

export type WindowState = "passed" | "now" | "ahead";

/** Today's windows marked against the hour on the phone ("HH:00" labels compare as strings). */
export function markWindows(windows: Array<{ from: string; to: string }>, hour: number): Array<{ from: string; to: string; state: WindowState }> {
  const now = `${String(hour).padStart(2, "0")}:00`;
  return windows.map((w) => ({ ...w, state: w.to <= now ? "passed" : w.from <= now ? "now" : "ahead" }));
}
