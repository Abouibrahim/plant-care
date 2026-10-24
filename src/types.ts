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

/** One row of the `journal` view: a photo or an acted task, in one dated stream per plant. */
export interface JournalEntry {
  plant_id: string;
  at: string;
  kind: "photo" | "task";
  /** photo kind, or task type */
  subtype: string;
  /** photo note, or the task's note (skip reason) falling back to its title */
  text: string;
  /** storage_path for a photo, status for a task */
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
  /** Overdue waterings closed as skipped because a newer watering of the same rule is due. */
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
export interface DigestMessage {
  site: Site;
  title: string;
  body: string;
  /** Notification tag, one per site, so Farm and Backyard do not replace each other. */
  tag: string;
  /** Opened on tap. */
  url: string;
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
  dry_run: boolean;
}

// ---- settings ---------------------------------------------------------------

/** The value of the `zones` row of the settings table: the zone names of each site, in display order. */
export type ZoneLists = Record<Site, string[]>;
