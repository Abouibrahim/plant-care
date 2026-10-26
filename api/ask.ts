// POST /api/ask  { plant_id, question, history? }  ->  Answer + usage
// A free question about one plant, answered against its own context: the species profile with its
// care calendar, the plant record, the plants in the same zone, the last time each kind of task was
// done, what was done in the last 30 days, what is due in the next 30, and its last diagnoses with
// the treatments logged for them. The app keeps the conversation, sends the earlier exchanges back
// with each question and saves the answers; this route only reads.
import type { SupabaseClient } from "@supabase/supabase-js";
import type { VercelRequest, VercelResponse } from "./_http.js";
import { callJson, readPrompt, readSchema } from "./_claude.js";
import {
  calendarBlock,
  guildUsesBlock,
  pestsBlock,
  plantLine,
  profileStatusLine,
  RECENT_DAYS,
  RECENT_TASK_COLUMNS,
  siteWords,
  speciesBlock,
  taskLine,
  todayLine,
  WEATHER_COMING_DAYS,
  WEATHER_PAST_DAYS,
  weatherBlock,
  type RecentTask,
} from "./_context.js";
import { handleError, sendError, serviceClient, verifyUser } from "./_supabase.js";
import { loadWeather } from "./_weather.js";
import { addDays, isoDateIn, SITE_TIME_ZONE } from "../src/lib/dates.js";
import {
  ASK_MAX_HISTORY,
  ASK_MAX_QUESTION_CHARS,
  DIAGNOSIS_RULE_PREFIX,
  type Answer,
  type AskRequest,
  type AskTurn,
  type CommonNames,
  type PlantWithSpecies,
  type WeatherDay,
} from "../src/types.js";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
/** An earlier answer is cut to this length in the context. */
const MAX_HISTORY_ANSWER_CHARS = 2000;
/** Pending tasks due up to this many days ahead go into the context. */
export const COMING_DAYS = 30;
const MAX_RECENT_TASKS = 30;
const MAX_COMING_TASKS = 20;
/** Done tasks other than watering read to find the last of each type; they come round a few times a year. */
const MAX_DONE_SCAN = 200;
/** Plants of the site read to find the zone neighbours: zones are free text, so the match is made here, ignoring case. */
const MAX_SITE_PLANTS = 500;
const MAX_NEIGHBOURS = 30;
const MAX_DIAGNOSES = 3;

export interface AskInput {
  plant_id: string;
  question: string;
  /** Oldest first, at most ASK_MAX_HISTORY. */
  history: AskTurn[];
}

/** Another plant in the same zone, with the names of its species. */
export interface Neighbour {
  tag: string;
  quantity: number;
  species: { scientific_name: string; common_names: CommonNames } | null;
}

/** A treatment logged from a diagnosis: a done `protect` row whose note reads "Treated: …". */
export interface Treatment {
  acted_at: string | null;
  note: string;
}

/** A problem photo of the plant: when, the grower's note, the stored diagnosis and the treatments logged for it. */
export interface PastDiagnosis {
  id: string;
  taken_at: string;
  note: string;
  ai_result: unknown;
  treatments: Treatment[];
}

/** Task rows read up to a limit; `more` when the limit cut the list. */
export interface TaskList {
  rows: RecentTask[];
  more: boolean;
}

export interface AskContext {
  plant: PlantWithSpecies;
  /** The Tunis date, YYYY-MM-DD. */
  today: string;
  /** The stored weather around today; null when there is none. */
  weather: WeatherDay[] | null;
  /** The newest done task of each type, whatever its date, newest first; `more` when the scan of the rarer types hit its limit. */
  lastDone: TaskList;
  /** Acted on in the last RECENT_DAYS days, newest first. */
  recent: TaskList;
  /** Pending with a due date up to today + COMING_DAYS (overdue included), earliest first. */
  coming: TaskList;
  /** The other plants of the plant's zone at its site; null when the plant has no zone. */
  neighbours: Neighbour[] | null;
  /** Newest first. */
  diagnoses: PastDiagnosis[];
  history: AskTurn[];
  question: string;
}

function clean(text: string): string {
  return text.replace(/\s+/g, " ").trim();
}

function cut(text: string, max: number): string {
  return text.length > max ? `${text.slice(0, max - 1)}…` : text;
}

/** The validated body, or the message of a 400. History keeps the last ASK_MAX_HISTORY exchanges. */
export function parseAskRequest(body: unknown): AskInput | string {
  const b = (body && typeof body === "object" ? body : {}) as Partial<Record<keyof AskRequest, unknown>>;
  if (typeof b.plant_id !== "string" || !UUID.test(b.plant_id)) return "plant_id must be a UUID";
  if (typeof b.question !== "string") return "question must be a string";
  const question = clean(b.question);
  if (!question) return "question is empty";
  if (question.length > ASK_MAX_QUESTION_CHARS) return `question is longer than ${ASK_MAX_QUESTION_CHARS} characters`;
  if (b.history !== undefined && !Array.isArray(b.history)) return "history must be an array";

  const history: AskTurn[] = [];
  for (const item of ((b.history ?? []) as unknown[]).slice(-ASK_MAX_HISTORY)) {
    const turn = (item && typeof item === "object" ? item : {}) as Partial<Record<keyof AskTurn, unknown>>;
    if (typeof turn.question !== "string" || typeof turn.answer !== "string") {
      return "each history item needs a question and an answer";
    }
    history.push({
      question: cut(clean(turn.question), ASK_MAX_QUESTION_CHARS),
      answer: cut(turn.answer.trim(), MAX_HISTORY_ANSWER_CHARS),
    });
  }
  return { plant_id: b.plant_id, question, history };
}

function neighbourLine(n: Neighbour): string {
  const count = n.quantity === 1 ? "" : `${n.quantity} × `;
  const common = n.species?.common_names?.en;
  const names = n.species ? (common ? `${common}, ${n.species.scientific_name}` : n.species.scientific_name) : "species unknown";
  return `- "${n.tag}" (${count}${names})`;
}

function neighboursBlock(plant: PlantWithSpecies, neighbours: Neighbour[] | null): string {
  if (neighbours === null) return "No zone is recorded for this plant, so the plants beside it are not known.";
  const where = `zone "${plant.zone}" ${siteWords(plant.site)}`;
  if (neighbours.length === 0) return `No other plant is recorded in ${where}.`;
  return `Other plants recorded in ${where}:\n${neighbours.map(neighbourLine).join("\n")}`;
}

/** One line per stored diagnosis: date, summary, leading cause, urgency, the grower's note and the treatments logged. */
function diagnosisLine(d: PastDiagnosis): string | null {
  const ai = d.ai_result as { summary?: unknown; urgency?: unknown; likely_causes?: unknown } | null;
  if (!ai || typeof ai !== "object" || typeof ai.summary !== "string") return null;
  const top = Array.isArray(ai.likely_causes) ? (ai.likely_causes[0] as { cause?: unknown; likelihood?: unknown } | undefined) : undefined;
  const likelihood = typeof top?.likelihood === "number" ? ` (likelihood ${top.likelihood.toFixed(2)})` : "";
  const cause = typeof top?.cause === "string" ? ` Leading cause: ${top.cause}${likelihood}.` : "";
  const urgency = typeof ai.urgency === "string" ? ` Urgency: ${ai.urgency}.` : "";
  const note = d.note ? ` Grower's note: "${d.note}".` : "";
  const treated =
    d.treatments.length > 0
      ? ` Treatments logged: ${d.treatments.map((t) => `${t.acted_at ? t.acted_at.slice(0, 10) : "date unknown"} "${t.note}"`).join("; ")}.`
      : " No treatment logged for it.";
  return `- ${d.taken_at.slice(0, 10)}: ${ai.summary}${cause}${urgency}${note}${treated}`;
}

/** The header of a task list, with a note when its limit cut it. */
function listed(header: string, list: TaskList): string {
  return `${header}${list.more ? `, only the first ${list.rows.length} listed` : ""}:\n${list.rows.map(taskLine).join("\n")}`;
}

/** The user message: the plant's context, the earlier exchanges of the conversation, then the question. */
export function describeAsk(ctx: AskContext): string {
  const { plant, today } = ctx;
  const s = plant.species;
  const parts: string[] = [];

  parts.push(todayLine(today));
  parts.push(`${speciesBlock(s)}\n${profileStatusLine(s)}`);
  parts.push(calendarBlock(s));
  parts.push(pestsBlock(s));
  parts.push(guildUsesBlock(s));
  parts.push(plantLine(plant, today));
  parts.push(weatherBlock(ctx.weather, today));
  parts.push(neighboursBlock(plant, ctx.neighbours));

  const never = ctx.lastDone.more ? "" : " (a kind not listed was never marked done)";
  parts.push(
    ctx.lastDone.rows.length > 0
      ? `Last time each kind of task was marked done for this plant, whatever the date${never}:\n${ctx.lastDone.rows.map(taskLine).join("\n")}`
      : "No task has ever been marked done for this plant.",
  );
  parts.push(
    ctx.recent.rows.length > 0
      ? listed(`Tasks acted on in the last ${RECENT_DAYS} days, newest first (done, skipped or snoozed)`, ctx.recent)
      : `No task was acted on for this plant in the last ${RECENT_DAYS} days.`,
  );
  const until = addDays(today, COMING_DAYS);
  parts.push(
    ctx.coming.rows.length > 0
      ? listed(`Pending tasks due by ${until}, earliest first (overdue ones included)`, ctx.coming)
      : `No pending task is due by ${until}.`,
  );

  const diagnoses = ctx.diagnoses.map(diagnosisLine).filter((line): line is string => line !== null);
  parts.push(
    diagnoses.length > 0
      ? `Diagnoses of this plant, newest first (the last ${MAX_DIAGNOSES} at most):\n${diagnoses.join("\n")}`
      : "No diagnosis was made for this plant.",
  );

  if (ctx.history.length > 0) {
    const turns = ctx.history.map((turn) => `Grower: ${turn.question}\nYou: ${turn.answer}`);
    parts.push(`Earlier in this conversation, oldest first:\n\n${turns.join("\n\n")}`);
  }
  parts.push(`Question: ${ctx.question}`);
  return parts.join("\n\n");
}

/** The newest done row of each task type: the last watering, plus a scan of the rarer types. */
async function lastDoneTasks(db: SupabaseClient, plantId: string): Promise<TaskList> {
  const done = () => db.from("tasks").select(RECENT_TASK_COLUMNS).eq("plant_id", plantId).eq("status", "done");
  const [water, others] = await Promise.all([
    done().eq("type", "water").order("acted_at", { ascending: false }).limit(1),
    done().neq("type", "water").order("acted_at", { ascending: false }).limit(MAX_DONE_SCAN),
  ]);
  if (water.error) throw water.error;
  if (others.error) throw others.error;
  const seen = new Set<string>();
  const latest: RecentTask[] = [];
  for (const row of [...(water.data ?? []), ...(others.data ?? [])] as RecentTask[]) {
    if (seen.has(row.type)) continue;
    seen.add(row.type);
    latest.push(row);
  }
  return {
    rows: latest.sort((a, b) => (b.acted_at ?? "").localeCompare(a.acted_at ?? "")),
    more: (others.data ?? []).length >= MAX_DONE_SCAN,
  };
}

async function recentTasks(db: SupabaseClient, plantId: string, today: string): Promise<TaskList> {
  const { data, error } = await db
    .from("tasks")
    .select(RECENT_TASK_COLUMNS)
    .eq("plant_id", plantId)
    .gte("acted_at", `${addDays(today, -RECENT_DAYS)}T00:00:00Z`)
    .order("acted_at", { ascending: false })
    .limit(MAX_RECENT_TASKS + 1);
  if (error) throw error;
  const rows = (data ?? []) as RecentTask[];
  return { rows: rows.slice(0, MAX_RECENT_TASKS), more: rows.length > MAX_RECENT_TASKS };
}

async function comingTasks(db: SupabaseClient, plantId: string, today: string): Promise<TaskList> {
  const { data, error } = await db
    .from("tasks")
    .select(RECENT_TASK_COLUMNS)
    .eq("plant_id", plantId)
    .eq("status", "pending")
    .lte("due_on", addDays(today, COMING_DAYS))
    .order("due_on", { ascending: true })
    .limit(MAX_COMING_TASKS + 1);
  if (error) throw error;
  const rows = (data ?? []) as RecentTask[];
  return { rows: rows.slice(0, MAX_COMING_TASKS), more: rows.length > MAX_COMING_TASKS };
}

async function zoneNeighbours(db: SupabaseClient, plant: PlantWithSpecies): Promise<Neighbour[] | null> {
  const zone = plant.zone.trim().toLowerCase();
  if (!zone) return null;
  const { data, error } = await db
    .from("plants")
    .select("tag, quantity, zone, species(scientific_name, common_names)")
    .eq("site", plant.site)
    .neq("id", plant.id)
    .order("tag", { ascending: true })
    .limit(MAX_SITE_PLANTS);
  if (error) throw error;
  return ((data ?? []) as unknown as Array<Neighbour & { zone: string }>)
    .filter((row) => row.zone.trim().toLowerCase() === zone)
    .slice(0, MAX_NEIGHBOURS)
    .map(({ tag, quantity, species }) => ({ tag, quantity, species }));
}

/** The last diagnoses, each with the treatments logged from it (rule_key `diagnosis:<photo_id>:treated`). */
async function pastDiagnoses(db: SupabaseClient, plantId: string): Promise<PastDiagnosis[]> {
  const { data, error } = await db
    .from("photos")
    .select("id, taken_at, note, ai_result")
    .eq("plant_id", plantId)
    .eq("kind", "problem")
    .order("taken_at", { ascending: false })
    .limit(MAX_DIAGNOSES);
  if (error) throw error;
  const photos = (data ?? []) as Array<Omit<PastDiagnosis, "treatments">>;
  if (photos.length === 0) return [];

  const keyOf = (photoId: string) => `${DIAGNOSIS_RULE_PREFIX}${photoId}:treated`;
  const { data: rows, error: taskErr } = await db
    .from("tasks")
    .select("rule_key, acted_at, note")
    .eq("plant_id", plantId)
    .eq("status", "done")
    .in("rule_key", photos.map((p) => keyOf(p.id)))
    .order("acted_at", { ascending: true });
  if (taskErr) throw taskErr;
  const treated = (rows ?? []) as Array<Treatment & { rule_key: string }>;
  return photos.map((p) => ({
    ...p,
    treatments: treated.filter((t) => t.rule_key === keyOf(p.id)).map(({ acted_at, note }) => ({ acted_at, note })),
  }));
}

export default async function handler(req: VercelRequest, res: VercelResponse): Promise<void> {
  try {
    // The bearer check comes first: any request without a valid token is a 401, whatever the method.
    const user = await verifyUser(req);
    if (!user) {
      sendError(res, 401, "Unauthorized");
      return;
    }
    if (req.method !== "POST") {
      sendError(res, 405, "Method not allowed");
      return;
    }
    const input = parseAskRequest(req.body);
    if (typeof input === "string") {
      sendError(res, 400, input);
      return;
    }

    const db = serviceClient();
    const today = isoDateIn(SITE_TIME_ZONE);
    const { data: plantRow, error: plantErr } = await db.from("plants").select("*, species(*)").eq("id", input.plant_id).maybeSingle();
    if (plantErr) throw plantErr;
    const plant = plantRow as PlantWithSpecies | null;
    if (!plant || !plant.species) {
      sendError(res, 404, "Plant not found");
      return;
    }

    const [lastDone, recent, coming, neighbours, diagnoses, weather] = await Promise.all([
      lastDoneTasks(db, plant.id),
      recentTasks(db, plant.id, today),
      comingTasks(db, plant.id, today),
      zoneNeighbours(db, plant),
      pastDiagnoses(db, plant.id),
      loadWeather(db, addDays(today, -WEATHER_PAST_DAYS), addDays(today, WEATHER_COMING_DAYS)),
    ]);
    const text = describeAsk({
      plant,
      today,
      weather,
      lastDone,
      recent,
      coming,
      neighbours,
      diagnoses,
      history: input.history,
      question: input.question,
    });

    const result = await callJson<Answer>({
      rules: readPrompt("ask.md"),
      schema: readSchema("ask.schema.json"),
      content: [{ type: "text", text }],
      // Thinking counts against max_tokens: an answer of about 250 words plus medium-effort
      // thinking needs more room than a diagnosis; callJson retries once at 6,144 when cut.
      maxTokens: 3072,
      // Weighing the plant's records against the question, like a diagnosis: medium effort.
      effort: "medium",
    });

    if (!result.ok) {
      res.status(200).json({ refusal: result.refusal, ...result.usage });
      return;
    }
    res.status(200).json({ ...result.data, ...result.usage });
  } catch (err) {
    handleError(res, err);
  }
}
