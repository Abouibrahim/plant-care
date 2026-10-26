// POST /api/diagnose  { plant_id, images: [{ media_type, data }], note? }  ->  Diagnosis + usage
// The problem photo is read against the plant's own context: its species profile, its age and
// site, and what was done (or left undone) for it in the last 30 days.
import type { VercelRequest, VercelResponse } from "./_http.js";
import { callJson, imagesThenText, readPrompt, readSchema } from "./_claude.js";
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
import { loadWeather } from "./_weather.js";
import { addDays, isoDateIn, SITE_TIME_ZONE } from "../src/lib/dates.js";
import type { DiagnoseRequest, Diagnosis, PlantWithSpecies, WeatherDay } from "../src/types.js";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const MAX_TASKS = 30;
const MAX_NOTE_CHARS = 500;

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
    const body = (req.body ?? {}) as DiagnoseRequest;
    if (typeof body.plant_id !== "string" || !UUID.test(body.plant_id)) {
      sendError(res, 400, "plant_id must be a UUID");
      return;
    }
    const images = parseImages(body.images);
    if (typeof images === "string") {
      sendError(res, 400, images);
      return;
    }
    if (body.note !== undefined && typeof body.note !== "string") {
      sendError(res, 400, "note must be a string");
      return;
    }
    const note = (body.note ?? "").replace(/\s+/g, " ").trim().slice(0, MAX_NOTE_CHARS);

    const db = serviceClient();
    const today = isoDateIn(SITE_TIME_ZONE);
    const { data: plantRow, error: plantErr } = await db.from("plants").select("*, species(*)").eq("id", body.plant_id).maybeSingle();
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
    const result = await callJson<Diagnosis>({
      rules: readPrompt("diagnose.md"),
      schema: readSchema("diagnose.schema.json"),
      content: imagesThenText(images, text),
      maxTokens: 2048,
      // Weighing causes against the context is a step up from identification: medium effort, as
      // CLAUDE.md asks; callJson retries once at 4,096 when thinking plus JSON overrun the budget.
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
