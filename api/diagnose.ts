// POST /api/diagnose  { plant_id, images: [{ media_type, data }], note?, photo? }  ->  Diagnosis + usage
// The problem photo is read against the plant's own context: its species profile, its age and
// site, and what was done (or left undone) for it in the last 30 days. Since Phase 14 the app also
// sends the photos row it planned (id, storage_path under the plant's folder, taken_at), and the
// route writes that row with the diagnosis once Claude has answered, so a reply lost on the way is
// found again by its id; the app's own save then upserts the same row. Without `photo` (an older
// build) the route only reads, as before.
import { keepAlive, reply, type VercelRequest, type VercelResponse } from "./_http.js";
import { callJson, imagesThenText, readPrompt, readSchema } from "./_claude.js";
import { isInstant, storeRow, UUID } from "./_rows.js";
import {
  pestsBlock,
  plantLine,
  RECENT_DAYS,
  RECENT_TASK_COLUMNS,
  speciesBlock,
  taskLine,
  todayLine,
  WEATHER_COMING_DAYS,
  WEATHER_PAST_DAYS,
  weatherBlock,
  type RecentTask,
} from "./_context.js";
import { parseImages } from "./_images.js";
import { handleError, sendError, serviceClient, verifyUser } from "./_supabase.js";
import { recordUsage } from "./_usage.js";
import { loadWeather } from "./_weather.js";
import { addDays, isoDateIn, SITE_TIME_ZONE } from "../src/lib/dates.js";
import type { DiagnoseRequest, Diagnosis, ImagePayload, PlantWithSpecies, ProblemAiResult, WeatherDay } from "../src/types.js";

const MAX_TASKS = 30;
const MAX_NOTE_CHARS = 500;

export interface DiagnoseInput {
  plant_id: string;
  images: ImagePayload[];
  note: string;
  /** The photos row the app planned before the call; null from an older build, which saves the row itself. */
  photo: { id: string; storage_path: string; taken_at: string } | null;
}

/** The validated body, or the message of a 400. The planned photo's path must sit under the plant's own folder. */
export function parseDiagnoseRequest(body: unknown): DiagnoseInput | string {
  const b = (body && typeof body === "object" ? body : {}) as Partial<Record<keyof DiagnoseRequest, unknown>>;
  if (typeof b.plant_id !== "string" || !UUID.test(b.plant_id)) return "plant_id must be a UUID";
  const images = parseImages(b.images);
  if (typeof images === "string") return images;
  if (b.note !== undefined && typeof b.note !== "string") return "note must be a string";
  const note = (b.note ?? "").replace(/\s+/g, " ").trim().slice(0, MAX_NOTE_CHARS);
  let photo: DiagnoseInput["photo"] = null;
  if (b.photo !== undefined) {
    const p = (b.photo && typeof b.photo === "object" ? b.photo : {}) as Partial<Record<"id" | "storage_path" | "taken_at", unknown>>;
    if (typeof p.id !== "string" || !UUID.test(p.id)) return "photo.id must be a UUID";
    if (typeof p.storage_path !== "string" || !new RegExp(`^${b.plant_id}/\\d+\\.jpg$`, "i").test(p.storage_path)) return "photo.storage_path must be <plant_id>/<ms>.jpg";
    if (!isInstant(p.taken_at)) return "photo.taken_at must be an ISO time";
    photo = { id: p.id, storage_path: p.storage_path, taken_at: p.taken_at };
  }
  return { plant_id: b.plant_id, images, note, photo };
}

/** The photos row as the route writes it: what the app would write, the diagnosis with its usage and the note in ai_result. */
export function photoRow(input: DiagnoseInput, result: ProblemAiResult): Record<string, unknown> | null {
  if (!input.photo) return null;
  return { id: input.photo.id, plant_id: input.plant_id, taken_at: input.photo.taken_at, storage_path: input.photo.storage_path, kind: "problem", ai_result: result, note: input.note };
}

export interface DiagnoseContext {
  plant: PlantWithSpecies;
  /** Newest first: acted in the last 30 days, or still pending with a due date up to today. */
  tasks: RecentTask[];
  /** The stored weather around today; null when there is none. */
  weather: WeatherDay[] | null;
  note: string;
  /** The Tunis date, YYYY-MM-DD. */
  today: string;
}

/** The text after the images: today, the species profile, the plant, its recent tasks and the note. */
export function describeContext({ plant, tasks, weather, note, today }: DiagnoseContext): string {
  const s = plant.species;
  const parts: string[] = [];

  parts.push(todayLine(today));
  parts.push(speciesBlock(s));
  parts.push(pestsBlock(s));
  parts.push(plantLine(plant, today));
  parts.push(weatherBlock(weather, today));

  parts.push(
    tasks.length > 0
      ? `Tasks of the last ${RECENT_DAYS} days, newest first (what was done, skipped or left pending):\n${tasks.map(taskLine).join("\n")}`
      : `No task was recorded for this plant in the last ${RECENT_DAYS} days.`,
  );

  parts.push(note ? `Grower's note: "${note}"` : "The grower left no note.");
  parts.push("Diagnose what the photo shows on this plant.");
  return parts.join("\n\n");
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
    const input = parseDiagnoseRequest(req.body);
    if (typeof input === "string") {
      sendError(res, 400, input);
      return;
    }
    const { images, note } = input;

    const db = serviceClient();
    const today = isoDateIn(SITE_TIME_ZONE);
    const { data: plantRow, error: plantErr } = await db.from("plants").select("*, species(*)").eq("id", input.plant_id).maybeSingle();
    if (plantErr) throw plantErr;
    const plant = plantRow as PlantWithSpecies | null;
    if (!plant || !plant.species) {
      sendError(res, 404, "Plant not found");
      return;
    }

    const cutoff = addDays(today, -RECENT_DAYS);
    const { data: taskRows, error: taskErr } = await db
      .from("tasks")
      .select(RECENT_TASK_COLUMNS)
      .eq("plant_id", plant.id)
      .or(`acted_at.gte.${cutoff}T00:00:00Z,and(status.eq.pending,due_on.lte.${today})`)
      .order("due_on", { ascending: false })
      .limit(MAX_TASKS);
    if (taskErr) throw taskErr;

    const weather = await loadWeather(db, addDays(today, -WEATHER_PAST_DAYS), addDays(today, WEATHER_COMING_DAYS));
    const text = describeContext({ plant, tasks: (taskRows ?? []) as RecentTask[], weather, note, today });
    keepAlive(res);
    const result = await callJson<Diagnosis>({
      rules: readPrompt("diagnose.md"),
      schema: readSchema("diagnose.schema.json"),
      content: imagesThenText(images, text),
      maxTokens: 2048,
      // Weighing causes against the context is a step up from identification: medium effort, as
      // CLAUDE.md asks; callJson retries once at 4,096 when thinking plus JSON overrun the budget.
      effort: "medium",
      onUsage: (usage, outcome) => recordUsage(db, "diagnose", usage, outcome),
    });

    if (!result.ok) {
      reply(res, 200, { refusal: result.refusal, ...result.usage });
      return;
    }
    // The paid diagnosis goes to the table before the reply, so a reply lost on the way is not lost at all.
    const row = photoRow(input, { ...result.data, ...result.usage, note });
    if (row) await storeRow(db, "photos", row);
    await result.recorded;
    reply(res, 200, { ...result.data, ...result.usage });
  } catch (err) {
    handleError(res, err);
  }
}
