// Shared types for the browser app and the Vercel functions.
// They mirror prompts/*.schema.json and supabase/schema.sql; keep the three in step.

export type Site = "backyard" | "farm";
export const SITES: Site[] = ["backyard", "farm"];

export type PlantSource = "nursery" | "seed" | "cutting" | "graft" | "existing";
export const PLANT_SOURCES: PlantSource[] = ["nursery", "seed", "cutting", "graft", "existing"];

export type PhotoKind = "identify" | "journal" | "problem";
export type TaskType = "water" | "prune" | "feed" | "mulch" | "harvest" | "scout" | "propagate" | "protect";
/** Display order on the Today screen and in the calendar. */
export const TASK_TYPES: TaskType[] = ["water", "prune", "feed", "mulch", "harvest", "scout", "propagate", "protect"];
export type TaskStatus = "pending" | "done" | "skipped" | "snoozed";

export type PlantType = "tree" | "shrub" | "herb" | "climber" | "groundcover" | "grass" | "succulent" | "other";
export type Lifecycle = "perennial" | "biennial" | "annual";
export type Foliage = "evergreen" | "deciduous" | "semi_deciduous" | "not_applicable";
export type Layer = "canopy" | "sub_canopy" | "shrub" | "herbaceous" | "groundcover" | "root" | "climber";
export type Level = "low" | "medium" | "high";
export type ToxicityLevel = "none" | "mild" | "moderate" | "severe";

export interface CommonNames {
  en: string;
  fr: string;
  ar: string;
  ar_latin: string;
}

/** One image as sent to /api/identify: already resized by the client. */
export interface ImagePayload {
  media_type: "image/jpeg" | "image/png" | "image/webp";
  data: string; // base64, no data: prefix
}

/** Token usage appended to every function response that called Claude. */
export interface Usage {
  model: string | null;
  input_tokens: number;
  output_tokens: number;
  thinking_tokens: number;
  cache_read_input_tokens: number;
  cache_creation_input_tokens: number;
}

// ---- identify ---------------------------------------------------------------

export interface Candidate {
  scientific_name: string; // "unknown" when nothing usable is in the photo
  cultivar: string;
  common_names: CommonNames;
  confidence: number; // 0..1
  evidence: string;
}

export interface IdentifyResult {
  candidates: Candidate[];
  plant_type: PlantType;
  lifecycle: Lifecycle;
  foliage: Foliage;
  layer: Layer;
  photo_advice: string;
}

export interface IdentifyRequest {
  images: ImagePayload[]; // 1 or 2
  site?: Site;
}

export type IdentifyResponse = (IdentifyResult & Usage) | ({ refusal: string } & Usage);

export function isRefusal<T extends object>(r: T | ({ refusal: string } & Usage)): r is { refusal: string } & Usage {
  return typeof (r as { refusal?: unknown }).refusal === "string";
}

// ---- diagnose ----------------------------------------------------------------

export type CauseKind = "pest" | "disease" | "nutrient" | "water" | "sun_heat" | "salinity" | "mechanical" | "other";
export type Urgency = "watch" | "this_week" | "today";

export interface LikelyCause {
  cause: string;
  kind: CauseKind;
  likelihood: number; // 0..1
  evidence: string;
}

/** Exactly what prompts/diagnose.schema.json returns. */
export interface Diagnosis {
  summary: string;
  likely_causes: LikelyCause[];
  checks_to_do: string[];
  organic_treatment: string;
  /** Whether organic_treatment asks for a spray in the next two weeks; absent on diagnoses saved before 0.8.1. */
  spray?: boolean;
  prevention: string;
  urgency: Urgency;
  rephotograph_in_days: number;
}

export interface DiagnoseRequest {
  plant_id: string;
  images: ImagePayload[]; // 1 or 2
  /** What the grower sees; optional. */
  note?: string;
}

export type DiagnoseResponse = (Diagnosis & Usage) | ({ refusal: string } & Usage);

/** photos.ai_result of a problem photo: the diagnosis, its usage and the grower's note. */
export type ProblemAiResult = Diagnosis & Usage & { note: string };

/**
 * rule_key prefix of the task rows a diagnosis writes from the app (the treatment logged as a done
 * `protect` row, the re-photograph as a pending `scout` row): `diagnosis:<photo_id>`. The expansion
 * never removes them (api/_tasks.ts).
 */
export const DIAGNOSIS_RULE_PREFIX = "diagnosis:";

/**
 * rule_key prefix of the task rows the grower writes by hand from the Plant screen (the manual care
 * log of the review of 2026-10-30): `manual:<uuid>`, a done row for care done without a reminder, or
 * a pending one-off reminder. Like the diagnosis rows, the expansion never removes or closes them.
 */
export const MANUAL_RULE_PREFIX = "manual:";

/** Whether a task was written from the app (a diagnosis or the manual log) rather than by the expansion from a species rule. */
export function isAppWrittenRule(ruleKeyValue: string): boolean {
  return ruleKeyValue.startsWith(DIAGNOSIS_RULE_PREFIX) || ruleKeyValue.startsWith(MANUAL_RULE_PREFIX);
}

/** Longest title and note of a manual log entry; the sheet's fields stop at the same lengths. */
export const MANUAL_MAX_TITLE_CHARS = 80;
export const TASK_MAX_NOTE_CHARS = 200;

// ---- ask ----------------------------------------------------------------------

/** Longest question /api/ask accepts; the panel's text box stops at the same length. */
export const ASK_MAX_QUESTION_CHARS = 1000;
/** Earlier exchanges of a conversation sent back with a question; older ones are left out. */
export const ASK_MAX_HISTORY = 6;

/** Exactly what prompts/ask.schema.json returns. */
export interface Answer {
  answer: string;
  /** Where the answer departs from the species profile, or "". */
  profile_note: string;
  /** Up to three questions the grower may ask next, in the language of the answer. */
  follow_ups: string[];
}

/** One earlier exchange of a conversation, sent back with the next question. */
export interface AskTurn {
  question: string;
  answer: string;
}

export interface AskRequest {
  plant_id: string;
  question: string;
  /** The conversation so far, oldest first; the route reads the last six exchanges. */
  history?: AskTurn[];
}

export type AskResponse = (Answer & Usage) | ({ refusal: string } & Usage);

/**
 * A row of the questions table: one exchange of a conversation, saved by the app once Claude
 * answered. The app makes the id and asked_at when the answer arrives, so a save retried later
 * keeps the exchange's place in the conversation and cannot write it twice.
 */
export interface Question {
  id: string;
  plant_id: string;
  /** Shared by every question of one conversation. */
  thread_id: string;
  asked_at: string;
  question: string;
  answer: Answer & Usage;
}

// ---- planting check ---------------------------------------------------------------

export type Verdict = "plant" | "plant_with_care" | "avoid";
export const VERDICTS: Verdict[] = ["plant", "plant_with_care", "avoid"];
export type BestSite = Site | "either" | "neither";
/** The factors a check rates, in the order the prompt asks for them and the card shows them. */
export type CheckFactor = "salinity" | "water" | "heat" | "cold" | "soil" | "animals" | "space" | "pests";
export const CHECK_FACTORS: CheckFactor[] = ["salinity", "water", "heat", "cold", "soil", "animals", "space", "pests"];
export type FactorStatus = "good" | "caution" | "problem";

/** Exactly what prompts/check.schema.json returns. */
export interface PlantingCheck {
  factors: Array<{ factor: CheckFactor; status: FactorStatus; note: string }>;
  verdict: Verdict;
  best_site: BestSite;
  summary: string;
  placement: string;
  planting_time: string;
  buying_tips: string;
  first_year: string;
  /** Better-suited species or cultivars; empty when the verdict is plant. */
  alternatives: Array<{ name: string; scientific_name: string; why: string }>;
}

/**
 * Longest zone and note /api/check accepts; the check screen's fields stop at the same lengths. The
 * zone cap is generous because a zone chip carries a Settings name, and Settings has no cap of its own.
 */
export const CHECK_MAX_ZONE_CHARS = 200;
export const CHECK_MAX_NOTE_CHARS = 300;

export interface CheckRequest {
  species_id: string;
  /** The site the grower has in mind; omitted, the check compares both. */
  site?: Site;
  zone?: string;
  /** What the plant is for, or anything else the grower wants weighed. */
  note?: string;
  /** The language of the text fields; English when omitted. */
  lang?: "en" | "fr";
}

export type CheckResponse = (PlantingCheck & Usage) | ({ refusal: string } & Usage);

/** The newest check of a species as the library's pills need it: the verdict only, not the whole result. */
export interface CheckSummary {
  id: string;
  species_id: string;
  checked_at: string;
  verdict: Verdict;
}

/**
 * A row of the planting_checks table: one check of a species, saved by the app once Claude
 * answered, under an id and a time made on the phone so a retried save cannot write it twice.
 */
export interface PlantingCheckRow {
  id: string;
  species_id: string;
  checked_at: string;
  /** The site asked about; null when none was chosen. */
  site: Site | null;
  zone: string;
  note: string;
  result: PlantingCheck & Usage;
}

// ---- species profile -------------------------------------------------------

export interface CareRule {
  type: TaskType;
  months: number[]; // 1..12
  every_days: number; // water only, else 0
  litres: number; // water only, else 0
  age: "establishment" | "mature" | "any";
  lead_days: number;
  title: string;
  instruction: string;
}

export interface Pest {
  name_en: string;
  name_fr: string;
  months: number[];
  symptoms: string;
  organic_treatment: string;
  prevention: string;
}

/** Exactly what prompts/profile.schema.json returns. */
export interface SpeciesProfile {
  scientific_name: string;
  cultivar: string;
  common_names: CommonNames;
  plant_type: PlantType;
  lifecycle: Lifecycle;
  foliage: Foliage;
  layer: Layer;
  site_fit: { rating: "good" | "acceptable" | "poor"; note: string };
  water: { need: Level; drought_tolerance: Level; stress_signs: string; overwatering_signs: string; summary: string };
  sun: { exposure: "full_sun" | "part_shade" | "shade"; heat_tolerance: Level; summer_shade_needed: boolean; note: string };
  salinity_tolerance: { level: "sensitive" | "moderate" | "tolerant"; note: string };
  climate_note: string;
  care_calendar: CareRule[];
  pests: Pest[];
  companions: { good: string[]; bad: string[]; root_warnings: string[] };
  uses: { edible_parts: string; preparation: string; storage: string; harvest_cues: string };
  toxicity: { humans: ToxicityLevel; chickens: ToxicityLevel; goats: ToxicityLevel; dogs_cats: ToxicityLevel; note: string };
}

/** Profile fields the user may edit on the review screen; kept on regeneration. */
export type SpeciesEditableField = keyof SpeciesProfile;

/** A row of the species table. */
export interface Species extends SpeciesProfile {
  id: string;
  generated_by: string | null;
  generated_at: string | null;
  confirmed: boolean;
  user_edits: Partial<SpeciesProfile>;
  created_at: string;
  updated_at: string;
}

export interface ProfileRequest {
  /** From a confirmed candidate. */
  scientific_name?: string;
  cultivar?: string;
  /** From the "type a name" path: common or scientific, as typed. */
  name?: string;
  /** Optional context passed through to Claude. */
  common_names?: CommonNames;
  site?: Site;
  /** Regenerate an existing profile, keeping the fields listed in user_edits. */
  regenerate_species_id?: string;
  /** Only look the species up: the stored row, or 404 when there is none yet. Never calls Claude. */
  lookup_only?: boolean;
}

export interface ProfileResponse extends Usage {
  species: Species;
  /** true when Claude wrote the profile in this call; false when the row already existed. */
  created: boolean;
}

export type ProfileApiResponse = ProfileResponse | ({ refusal: string } & Usage);

// ---- plants, photos, tasks ---------------------------------------------------

export interface Plant {
  id: string;
  species_id: string;
  tag: string;
  quantity: number;
  site: Site;
  zone: string;
  lat: number | null;
  lng: number | null;
  planted_on: string | null; // YYYY-MM-DD
  source: PlantSource;
  rootstock: string;
  created_at: string;
  updated_at: string;
}

export type PlantInsert = Omit<Plant, "id" | "created_at" | "updated_at">;

export interface PlantWithSpecies extends Plant {
  species: Species;
}

export interface Photo {
  id: string;
  plant_id: string;
  taken_at: string;
  storage_path: string;
  kind: PhotoKind;
  ai_result: unknown | null;
  note: string;
}

export type PhotoInsert = Omit<Photo, "id">;

export interface Task {
  id: string;
  plant_id: string;
  type: TaskType;
  rule_key: string;
  due_on: string;
  window_end: string | null;
  title: string;
  instruction: string;
  status: TaskStatus;
  acted_at: string | null;
  note: string;
  created_at: string;
}

/** What the expansion writes; status, acted_at and note take their defaults. */
export type TaskInsert = Pick<Task, "plant_id" | "type" | "rule_key" | "due_on" | "window_end" | "title" | "instruction">;

/** A task with the bits of its plant the Today screen shows. */
export interface TaskWithPlant extends Task {
  plant: Pick<Plant, "id" | "tag" | "site" | "zone"> | null;
}

/** One row of the `journal` view: a photo, an acted task or a question, in one dated stream per plant. */
export interface JournalEntry {
  plant_id: string;
  at: string;
  kind: "photo" | "task" | "question";
  /** photo kind, task type, or a question's thread id */
  subtype: string;
  /** photo note, the task's note (skip reason) falling back to its title, or the question asked */
  text: string;
  /** storage_path for a photo, status for a task, the questions row id for a question */
  ref: string;
}

export interface ExpandRequest {
  /** Expand one plant only; omitted, every plant. */
  plant_id?: string;
}

export interface ExpandResponse {
  plants: number;
  created: number;
  /** Pending tasks deleted because their rule no longer applies to the plant. */
  removed: number;
  /** Pending window tasks closed as skipped because their window ended before today. */
  expired: number;
  /** Overdue waterings closed as skipped: a newer watering of the same rule is due, or a whole interval passed with none. */
  superseded: number;
  /** The Tunis date the expansion ran for, YYYY-MM-DD. */
  today: string;
}

/** Whether an expansion changed the tasks table, so lists and the Today badge should be read again. */
export function expansionChanged(r: ExpandResponse): boolean {
  return r.created + r.removed + r.expired + r.superseded > 0;
}

export const MONTHS_SHORT = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

// ---- push -------------------------------------------------------------------

/** What PushSubscription.toJSON() gives in the browser; the row keeps endpoint and keys. */
export interface PushSubscriptionJson {
  endpoint: string;
  expirationTime?: number | null;
  keys: { p256dh: string; auth: string };
}

export type PushSubscribeRequest = { subscription: PushSubscriptionJson } | { unsubscribe: true; endpoint: string };

export interface PushSubscribeResponse {
  ok: true;
  subscribed: boolean;
}

/** One notification of the digest: a site and its tasks for the day. */
/** What one push notification carries; public/push-sw.js shows it. */
export interface PushMessage {
  title: string;
  body: string;
  /** Notification tag: a later message with the same tag replaces the earlier one. */
  tag: string;
  /** Opened on tap. */
  url: string;
}

export interface DigestMessage extends PushMessage {
  site: Site;
  /** Tasks in the message (title, body shows the first three). */
  tasks: number;
}

export interface DailyResponse extends ExpandResponse {
  ok: true;
  tasks_created: number;
  tasks_removed: number;
  pushes_sent: number;
  pushes_failed: number;
  subscriptions: number;
  subscriptions_dropped: number;
  digest: DigestMessage[];
  /** Set when subscriptions exist but the digest could not be sent (VAPID variables missing). */
  digest_error?: string;
  /** The 06:00 weather: whether the forecast was fetched and stored, why not, what the rain skipped, the push. */
  weather: { fetched: boolean; error?: string; skipped: number; message: PushMessage | null };
  dry_run: boolean;
}

// ---- weather -------------------------------------------------------------------

/** Hours that suit spraying, local time, the end exclusive: { from: "06:00", to: "10:00" }. */
export interface SprayWindow {
  from: string;
  to: string;
}

/** A row of the weather_days table: one date at the sites from Open-Meteo's model, a past day's estimate or a forecast (no rain gauge). */
export interface WeatherDay {
  /** YYYY-MM-DD, Tunis time. */
  day: string;
  tmax: number | null;
  tmin: number | null;
  rain_mm: number | null;
  /** The highest chance of rain in the day, %; null for a past day. */
  rain_prob: number | null;
  wind_kmh: number | null;
  gust_kmh: number | null;
  /** The dominant direction the wind blows from, degrees (180 is from the south). */
  wind_dir: number | null;
  /** The lowest relative humidity of the day, %. */
  rh_min: number | null;
  et0_mm: number | null;
  /** Filled for today and the next two days at the time of the fetch. */
  spray: SprayWindow[];
  /** True when the date was the fetch day or later: a forecast rather than a past day's model estimate. */
  forecast: boolean;
  /** Waterings the 06:00 rain skip closed on this date. */
  skipped: number;
  lat: number | null;
  lng: number | null;
  fetched_at: string;
}

/** The value of the `weather` row of the settings table. */
export interface WeatherSettings {
  rain_skip: boolean;
  /** Rain over the last two days (or forecast for today) that skips the waterings due, mm. */
  rain_mm: number;
}

export const DEFAULT_WEATHER_SETTINGS: WeatherSettings = { rain_skip: true, rain_mm: 10 };
export const RAIN_SKIP_CHOICES = [5, 10, 15, 20];

/** Where the forecast is read: the farm plants' GPS when they have it, otherwise the town. */
export interface WeatherPoint {
  lat: number;
  lng: number;
  source: "farm" | "town";
}

export interface WeatherResponse {
  days: WeatherDay[];
  point: WeatherPoint;
}

// ---- settings ---------------------------------------------------------------

/** The value of the `zones` row of the settings table: the zone names of each site, in display order. */
export type ZoneLists = Record<Site, string[]>;
