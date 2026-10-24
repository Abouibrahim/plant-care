// POST /api/diagnose  { plant_id, images: [{ media_type, data }], note? }  ->  Diagnosis + usage
// The problem photo is read against the plant's own context: its species profile, its age and
// site, and what was done (or left undone) for it in the last 30 days.
import type { VercelRequest, VercelResponse } from "@vercel/node";
import { callJson, imagesThenText, readPrompt, readSchema } from "./_claude.js";
import { parseImages } from "./_images.js";
import { handleError, sendError, serviceClient, verifyUser } from "./_supabase.js";
import { addDays, ageInMonths, ageStage, isoDateIn, parseIso, SITE_TIME_ZONE } from "../src/lib/dates.js";
import { MONTHS_SHORT, type DiagnoseRequest, type Diagnosis, type Pest, type PlantWithSpecies, type Task } from "../src/types.js";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
/** Tasks this far back go into the context. */
export const RECENT_DAYS = 30;
const MAX_TASKS = 30;
const MAX_NOTE_CHARS = 500;

export type RecentTask = Pick<Task, "type" | "title" | "due_on" | "window_end" | "status" | "acted_at" | "note">;

export interface DiagnoseContext {
  plant: PlantWithSpecies;
  /** Newest first: acted in the last 30 days, or still pending with a due date up to today. */
  tasks: RecentTask[];
  note: string;
  /** The Tunis date, YYYY-MM-DD. */
  today: string;
}

function monthList(months: number[]): string {
  const names = [...new Set(Array.isArray(months) ? months : [])]
    .filter((m) => Number.isInteger(m) && m >= 1 && m <= 12)
    .sort((a, b) => a - b)
    .map((m) => MONTHS_SHORT[m - 1]);
  return names.length > 0 ? names.join(", ") : "months not given";
}

function pestLine(p: Pest): string {
  const fr = p.name_fr ? ` (${p.name_fr})` : "";
  return `- ${p.name_en}${fr}, ${monthList(p.months)}: ${p.symptoms} Organic treatment: ${p.organic_treatment}`;
}

function taskLine(task: RecentTask): string {
  const label = `${task.type} "${task.title}"`;
  if (task.status === "pending") {
    const until = task.window_end ? `, window until ${task.window_end}` : "";
    return `- due ${task.due_on}: ${label}, still pending${until}`;
  }
  const day = task.acted_at ? task.acted_at.slice(0, 10) : task.due_on;
  const note = task.note ? ` ("${task.note}")` : "";
  return `- ${day}: ${label}, ${task.status}${note}`;
}

/** The text after the images: today, the species profile, the plant, its recent tasks and the note. */
export function describeContext({ plant, tasks, note, today }: DiagnoseContext): string {
  const s = plant.species;
  const n = s.common_names;
  const month = parseIso(today)?.m;
  const parts: string[] = [];

  parts.push(`Today: ${today}${month ? ` (${MONTHS_SHORT[month - 1]})` : ""}.`);

  parts.push(
    [
      `Species: ${s.scientific_name}${s.cultivar ? ` '${s.cultivar}'` : ""} (${n.en} / ${n.fr} / ${n.ar} ${n.ar_latin}). ` +
        `${s.plant_type}, ${s.lifecycle}, ${s.foliage}, ${s.layer} layer.`,
      `Fit for this site: ${s.site_fit.rating}. ${s.site_fit.note}`,
      `Water: need ${s.water.need}, drought tolerance ${s.water.drought_tolerance}. ${s.water.summary} ` +
        `Water-stress signs: ${s.water.stress_signs} Overwatering signs: ${s.water.overwatering_signs}`,
      `Sun: ${s.sun.exposure}, heat tolerance ${s.sun.heat_tolerance}, summer shade for young plants: ${s.sun.summer_shade_needed ? "yes" : "no"}. ${s.sun.note}`,
      `Salinity tolerance: ${s.salinity_tolerance.level}. ${s.salinity_tolerance.note}`,
      `Climate: ${s.climate_note}`,
    ].join("\n"),
  );

  const pests = Array.isArray(s.pests) ? s.pests : [];
  parts.push(
    pests.length > 0
      ? `Pests and diseases of this species in Cap Bon, from its profile:\n${pests.map(pestLine).join("\n")}`
      : "The profile lists no pests or diseases for this species.",
  );

  const months = ageInMonths(plant.planted_on, today);
  const stage = ageStage(months);
  const age =
    plant.planted_on && months !== null
      ? `Planted on ${plant.planted_on}: ${months} months old, ${stage}${stage === "establishment" ? " (the first 24 months)" : ""}.`
      : "Planting date unknown, treated as mature.";
  const count = plant.quantity === 1 ? "1 plant" : `${plant.quantity} plants`;
  const where = plant.site === "farm" ? "at the farm" : "in the backyard";
  const zone = plant.zone ? `, zone "${plant.zone}"` : "";
  const rootstock = plant.rootstock ? `, rootstock ${plant.rootstock}` : "";
  parts.push(`Plant: "${plant.tag}" (${count}) ${where}${zone}. ${age} Source: ${plant.source}${rootstock}.`);

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
      .select("type, title, due_on, window_end, status, acted_at, note")
      .eq("plant_id", plant.id)
      .or(`acted_at.gte.${cutoff}T00:00:00Z,and(status.eq.pending,due_on.lte.${today})`)
      .order("due_on", { ascending: false })
      .limit(MAX_TASKS);
    if (taskErr) throw taskErr;

    const text = describeContext({ plant, tasks: (taskRows ?? []) as RecentTask[], note, today });
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
