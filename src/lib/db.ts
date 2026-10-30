// Typed access to the four tables, the journal view and the photos bucket. Screens import from here only.
import { PHOTOS_BUCKET, supabase } from "./supabase";
import { addDays, toLocalDate } from "./dates";
import { forgetCachedPhotos, readCachedPhoto, storeCachedPhoto, thumbPath } from "./photoCache";
import { problemResult, topCause } from "./diagnosis";
import { tagIdRange } from "./map";
import { weatherSettings, type SprayTreatment } from "./weather";
import { t } from "../i18n";
import {
  DIAGNOSIS_RULE_PREFIX,
  SITES,
  VERDICTS,
  type CheckSummary,
  type JournalEntry,
  type LatestPhoto,
  type Photo,
  type PhotoInsert,
  type Plant,
  type PlantInsert,
  type PlantingCheckRow,
  type PlantWithSpecies,
  type Question,
  type Site,
  type Species,
  type SpeciesProfile,
  type Task,
  type TaskStatus,
  type TaskWithPlant,
  type Verdict,
  type WeatherDay,
  type WeatherSettings,
  type ZoneLists,
} from "../types";

interface Result<T> {
  data: T | null;
  error: { message: string } | null;
}

function must<T>(r: Result<T>): T {
  if (r.error) throw new Error(r.error.message);
  if (r.data === null || r.data === undefined) throw new Error(t.errors.noData);
  return r.data;
}

function optional<T>(r: Result<T>): T | null {
  if (r.error) throw new Error(r.error.message);
  return r.data ?? null;
}

// ---- plants -----------------------------------------------------------------

export async function listPlants(): Promise<PlantWithSpecies[]> {
  const r = await supabase.from("plants").select("*, species(*)").order("created_at", { ascending: false });
  return must(r) as unknown as PlantWithSpecies[];
}

export async function getPlant(id: string): Promise<PlantWithSpecies | null> {
  const r = await supabase.from("plants").select("*, species(*)").eq("id", id).maybeSingle();
  return optional(r) as PlantWithSpecies | null;
}

/** A fresh row id made in the browser, so a write retried after a lost reply finds its own row. */
export function newId(): string {
  return crypto.randomUUID();
}

/**
 * Inserts a plant. With an `id` made by the caller the write is an upsert on it, so a Save tapped
 * again after a reply that never arrived updates the row it already wrote instead of adding a second plant.
 */
export async function insertPlant(input: PlantInsert, id?: string): Promise<Plant> {
  const r = id
    ? await supabase.from("plants").upsert({ id, ...input }, { onConflict: "id" }).select("*").single()
    : await supabase.from("plants").insert(input).select("*").single();
  return must(r) as Plant;
}

export async function updatePlant(id: string, patch: Partial<PlantInsert>): Promise<Plant> {
  const r = await supabase.from("plants").update(patch).eq("id", id).select("*").single();
  return must(r) as Plant;
}

/** A plant on a map: enough to draw it as a dot and name it. */
export type PlantSpot = Pick<Plant, "id" | "tag" | "site" | "lat" | "lng">;

/** Every plant's position, for the dots the position sheet places a tree against (no species profiles). */
export async function listPlantSpots(): Promise<PlantSpot[]> {
  const r = await supabase.from("plants").select("id, tag, site, lat, lng");
  return must(r) as PlantSpot[];
}

/**
 * The plants a tag's code points to: those whose id starts with the code's 8 hex digits, found as a
 * range on the uuid column. Usually one; none when the plant was deleted.
 */
export async function findPlantsByTagCode(code: string): Promise<Array<Pick<Plant, "id" | "tag" | "site">>> {
  const { from, to } = tagIdRange(code);
  const r = await supabase.from("plants").select("id, tag, site").gte("id", from).lte("id", to);
  return must(r) as Array<Pick<Plant, "id" | "tag" | "site">>;
}

/**
 * Removes a plant: the row first (its photos, tasks and questions cascade), then its photos kept on
 * the phone, then its files in the photos bucket, which live under `<plant id>/` (thumbnails
 * included). A failure in Storage after the row is gone leaves orphaned files and nothing else, so
 * it is not reported. The species profile stays.
 */
export async function deletePlant(id: string): Promise<void> {
  const { error } = await supabase.from("plants").delete().eq("id", id);
  if (error) throw new Error(error.message);
  notifyTasksChanged();
  await forgetCachedPhotos(id);
  try {
    const bucket = supabase.storage.from(PHOTOS_BUCKET);
    const { data } = await bucket.list(id, { limit: 1000 });
    const paths = (data ?? []).map((o) => `${id}/${o.name}`);
    if (paths.length > 0) await bucket.remove(paths);
  } catch {
    // Orphaned files only; the plant is gone.
  }
}

/** Distinct zones used at a site, most recently used first, for the zone suggestions. */
export async function recentZones(site: Site): Promise<string[]> {
  const r = await supabase.from("plants").select("zone").eq("site", site).order("updated_at", { ascending: false }).limit(100);
  const rows = must(r) as Array<{ zone: string }>;
  const seen = new Set<string>();
  const zones: string[] = [];
  for (const { zone } of rows) {
    const z = zone.trim();
    if (z && !seen.has(z.toLowerCase())) {
      seen.add(z.toLowerCase());
      zones.push(z);
    }
  }
  return zones;
}

// ---- photos -----------------------------------------------------------------

export function photoPath(plantId: string, takenAt: Date = new Date()): string {
  return `${plantId}/${takenAt.getTime()}.jpg`;
}

/**
 * Uploads a photo. `upsert` is for a retry of a path this save already chose: an upload whose reply
 * was lost may have stored the object, and Storage refuses the path again otherwise (409).
 */
export async function uploadPhoto(storagePath: string, blob: Blob, upsert = false): Promise<void> {
  const { error } = await supabase.storage.from(PHOTOS_BUCKET).upload(storagePath, blob, { contentType: "image/jpeg", upsert, cacheControl: "3600" });
  if (error) throw new Error(error.message);
  // The phone has the bytes already: keep them, so the plant's screen does not download its own photo.
  void storeCachedPhoto(storagePath, blob);
}

/**
 * Uploads a photo's thumbnail beside it, at `thumbPath(storagePath)`, under the original's upsert
 * rule. A failure is not reported: the original is what matters, and a tile falls back to it when
 * the thumbnail is missing.
 */
export async function uploadThumbnail(storagePath: string, thumb: Blob, upsert = false): Promise<void> {
  const path = thumbPath(storagePath);
  try {
    const { error } = await supabase.storage.from(PHOTOS_BUCKET).upload(path, thumb, { contentType: "image/jpeg", upsert, cacheControl: "3600" });
    if (!error) void storeCachedPhoto(path, thumb);
  } catch {
    // Not reported; see above.
  }
}

/** Inserts a photo row; with an `id` made by the caller, an upsert on it, so a retry cannot add a second row. */
export async function insertPhoto(input: PhotoInsert, id?: string): Promise<Photo> {
  const r = id
    ? await supabase.from("photos").upsert({ id, ...input }, { onConflict: "id" }).select("*").single()
    : await supabase.from("photos").insert(input).select("*").single();
  return must(r) as Photo;
}

export async function listPhotos(plantId: string): Promise<Photo[]> {
  const r = await supabase.from("photos").select("*").eq("plant_id", plantId).order("taken_at", { ascending: false });
  return must(r) as Photo[];
}

/**
 * The newest photo of each plant in the list, keyed by plant id: the three columns a tile needs,
 * not the rows' `ai_result` (an identification or a diagnosis each), which would grow the read with
 * every photo taken.
 */
export async function latestPhotos(plantIds: string[]): Promise<Map<string, LatestPhoto>> {
  const map = new Map<string, LatestPhoto>();
  if (plantIds.length === 0) return map;
  const r = await supabase
    .from("photos")
    .select("plant_id, storage_path, taken_at")
    .in("plant_id", plantIds)
    .order("taken_at", { ascending: false });
  for (const photo of must(r) as LatestPhoto[]) {
    if (!map.has(photo.plant_id)) map.set(photo.plant_id, photo);
  }
  return map;
}

const SIGNED_TTL_S = 3600;
const urlCache = new Map<string, { url: string; expires: number }>();

interface SignWaiter {
  resolve: (url: string) => void;
  reject: (err: Error) => void;
}

/** The paths asked for in the current tick, signed together once it ends. */
let signQueue: Map<string, SignWaiter[]> | null = null;

/**
 * A signed URL for a private photo, cached for most of its lifetime. The paths asked for in the same
 * tick are signed in one request, so a screen of sixty tiles costs one round trip to Storage, not
 * sixty. A path Storage does not hold rejects on its own; the rest of its batch resolve.
 */
export function photoUrl(storagePath: string): Promise<string> {
  const hit = urlCache.get(storagePath);
  if (hit && hit.expires > Date.now()) return Promise.resolve(hit.url);
  return new Promise<string>((resolve, reject) => {
    if (!signQueue) {
      signQueue = new Map();
      queueMicrotask(() => void signQueued());
    }
    const waiters = signQueue.get(storagePath);
    if (waiters) waiters.push({ resolve, reject });
    else signQueue.set(storagePath, [{ resolve, reject }]);
  });
}

async function signQueued(): Promise<void> {
  const batch = signQueue;
  signQueue = null;
  if (!batch) return;
  const paths = [...batch.keys()];
  const now = Date.now();
  let signed: Array<{ path: string | null; signedUrl: string | null; error: string | null }>;
  try {
    const { data, error } = await supabase.storage.from(PHOTOS_BUCKET).createSignedUrls(paths, SIGNED_TTL_S);
    if (error || !data) throw new Error(error?.message ?? "Could not sign the photo URLs");
    signed = data;
  } catch (err) {
    const failure = err instanceof Error ? err : new Error(String(err));
    for (const waiters of batch.values()) for (const w of waiters) w.reject(failure);
    return;
  }
  paths.forEach((path, i) => {
    // Storage answers in the order asked; an item names its path unless it failed.
    const item = signed.find((s) => s.path === path) ?? signed[i];
    const waiters = batch.get(path) ?? [];
    if (item?.signedUrl) {
      urlCache.set(path, { url: item.signedUrl, expires: now + (SIGNED_TTL_S - 600) * 1000 });
      for (const w of waiters) w.resolve(item.signedUrl);
    } else {
      const failure = new Error(item?.error ?? `Could not sign ${path}`);
      for (const w of waiters) w.reject(failure);
    }
  });
}

export type PhotoSize = "thumb" | "full";

/** What `PhotoImg` shows: an object URL of the bytes kept on the phone, or the signed URL for the browser to load itself. */
export interface PhotoSource {
  url: string;
  /** True for an object URL, which the caller revokes when done with it. */
  objectUrl: boolean;
}

interface PhotoRequest {
  /** The paths to try in order: the thumbnail then the original for a tile, the original alone for the full photo. */
  candidates: string[];
  resolve: (source: PhotoSource) => void;
  reject: (err: Error) => void;
}

/** The photos asked for in the current tick, looked up together once it ends. */
let photoQueue: PhotoRequest[] | null = null;

/**
 * A photo to show: the copy kept on the phone when there is one (a tile takes the thumbnail's, else
 * the original's), otherwise downloaded through a signed URL and kept for the next time. The
 * requests made in the same tick (a screen's tiles mounting together) are handled as one: their
 * cache lookups run side by side, then the misses are signed in one request through `photoUrl`. A
 * tile whose photo predates thumbnails (no `.thumb.jpg` beside it) falls back to the original.
 */
export function loadPhoto(storagePath: string, size: PhotoSize): Promise<PhotoSource> {
  const candidates = size === "thumb" ? [thumbPath(storagePath), storagePath] : [storagePath];
  return new Promise<PhotoSource>((resolve, reject) => {
    if (!photoQueue) {
      photoQueue = [];
      queueMicrotask(() => void loadQueuedPhotos());
    }
    photoQueue.push({ candidates, resolve, reject });
  });
}

async function loadQueuedPhotos(): Promise<void> {
  const queue = photoQueue;
  photoQueue = null;
  if (!queue) return;
  const cached = await Promise.all(
    queue.map(async (req) => {
      for (const path of req.candidates) {
        const blob = await readCachedPhoto(path);
        if (blob) return blob;
      }
      return null;
    }),
  );
  // The misses start their downloads in this same tick, so `photoUrl` signs them together.
  queue.forEach((req, i) => {
    const blob = cached[i];
    if (blob) req.resolve({ url: URL.createObjectURL(blob), objectUrl: true });
    else void downloadPhoto(req);
  });
}

/** Signs, downloads and keeps the first candidate Storage holds; when the download itself fails, the `<img>` gets the signed URL. */
async function downloadPhoto(req: PhotoRequest): Promise<void> {
  let failure: Error | null = null;
  for (const path of req.candidates) {
    let url: string;
    try {
      url = await photoUrl(path);
    } catch (err) {
      // Not stored (a thumbnail that was never made) or not signed: the next candidate, if any.
      failure = err instanceof Error ? err : new Error(String(err));
      continue;
    }
    try {
      const res = await fetch(url);
      if (!res.ok) {
        failure = new Error(`${res.status} for ${path}`);
        continue;
      }
      const blob = await res.blob();
      void storeCachedPhoto(path, blob);
      req.resolve({ url: URL.createObjectURL(blob), objectUrl: true });
    } catch {
      // A dropped connection or a blocked cross-origin read: the browser may still load the URL itself.
      req.resolve({ url, objectUrl: false });
    }
    return;
  }
  req.reject(failure ?? new Error("No photo"));
}

// ---- species ----------------------------------------------------------------

export async function listSpecies(): Promise<Species[]> {
  const r = await supabase.from("species").select("*").order("scientific_name", { ascending: true });
  return must(r) as Species[];
}

export async function getSpecies(id: string): Promise<Species | null> {
  const r = await supabase.from("species").select("*").eq("id", id).maybeSingle();
  return optional(r) as Species | null;
}

/** Row count per species id, for the library cards. */
export async function speciesPlantCounts(): Promise<Map<string, number>> {
  const r = await supabase.from("plants").select("species_id");
  const counts = new Map<string, number>();
  for (const { species_id } of must(r) as Array<{ species_id: string }>) {
    counts.set(species_id, (counts.get(species_id) ?? 0) + 1);
  }
  return counts;
}

/**
 * Removes a species row that no plant uses (an abandoned capture, a mis-tap on Confirm).
 * Returns false when a plant references it; the foreign key is the final guard.
 */
export async function deleteSpeciesIfUnused(id: string): Promise<boolean> {
  const { count, error } = await supabase.from("plants").select("id", { count: "exact", head: true }).eq("species_id", id);
  if (error) throw new Error(error.message);
  if ((count ?? 0) > 0) return false;
  const { error: delErr } = await supabase.from("species").delete().eq("id", id);
  if (delErr) {
    if (delErr.code === "23503") return false;
    throw new Error(delErr.message);
  }
  return true;
}

export async function confirmSpecies(id: string): Promise<Species> {
  const r = await supabase.from("species").update({ confirmed: true }).eq("id", id).select("*").single();
  return must(r) as Species;
}

/**
 * Saves one top-level profile field and records it in user_edits so a regeneration keeps it.
 * Nested edits (water.summary, …) pass the whole parent object as the value.
 */
export async function updateSpeciesField<K extends keyof SpeciesProfile>(
  species: Species,
  key: K,
  value: SpeciesProfile[K],
): Promise<Species> {
  const user_edits = { ...species.user_edits, [key]: value };
  const r = await supabase.from("species").update({ [key]: value, user_edits }).eq("id", species.id).select("*").single();
  return must(r) as Species;
}

// ---- tasks ------------------------------------------------------------------
// Rows are written by the expansion (api/_tasks.ts); the app reads them and closes them. The one
// exception is the diagnosis section below, which writes the treatment log and the re-photograph task.

/** Fired on window whenever a task is acted on here or an expansion changed the table; the nav badge listens. */
export const TASKS_CHANGED = "plantcare:tasks-changed";

export function notifyTasksChanged(): void {
  if (typeof window !== "undefined") window.dispatchEvent(new Event(TASKS_CHANGED));
}

/**
 * Pending tasks late or due on a day (YYYY-MM-DD): the Today tab badge, the same count as today's
 * round (`dueNow`). A window counts on its opening day and once it has ended; while it is open in
 * between it is left out.
 */
export async function countDueTasks(untilIso: string): Promise<number> {
  const { count, error } = await supabase
    .from("tasks")
    .select("id", { count: "exact", head: true })
    .eq("status", "pending")
    .lte("due_on", untilIso)
    .or(`window_end.is.null,window_end.lt.${untilIso},due_on.eq.${untilIso}`);
  if (error) throw new Error(error.message);
  return count ?? 0;
}

const TASK_WITH_PLANT = "*, plant:plants(id, tag, site, zone)";

/** Pending tasks due on or before a day (YYYY-MM-DD), earliest first, each with its plant. */
export async function listDueTasks(untilIso: string): Promise<TaskWithPlant[]> {
  const r = await supabase
    .from("tasks")
    .select(TASK_WITH_PLANT)
    .eq("status", "pending")
    .lte("due_on", untilIso)
    .order("due_on", { ascending: true })
    .order("created_at", { ascending: true });
  return must(r) as unknown as TaskWithPlant[];
}

/** A plant's next pending tasks, earliest first. */
export async function listPlantTasks(plantId: string, limit = 12): Promise<Task[]> {
  const r = await supabase
    .from("tasks")
    .select("*")
    .eq("plant_id", plantId)
    .eq("status", "pending")
    .order("due_on", { ascending: true })
    .order("created_at", { ascending: true })
    .limit(limit);
  return must(r) as Task[];
}

/** Photos and acted tasks of a plant in one stream, newest first (the `journal` view). */
export async function listJournal(plantId: string): Promise<JournalEntry[]> {
  const r = await supabase.from("journal").select("*").eq("plant_id", plantId).order("at", { ascending: false });
  return must(r) as JournalEntry[];
}

/**
 * Closes a pending task. Only a pending row changes, so a second tap or a task already acted on
 * from another screen is a no-op; returns false in that case.
 */
async function closeTask(id: string, status: "done" | "skipped" | "snoozed", note: string): Promise<boolean> {
  const r = await supabase
    .from("tasks")
    .update({ status, acted_at: new Date().toISOString(), note })
    .eq("id", id)
    .eq("status", "pending")
    .select("id");
  const changed = (must(r) as Array<{ id: string }>).length > 0;
  if (changed) notifyTasksChanged();
  return changed;
}

/** Tasks marked done since a moment (ISO timestamp): the "N of M done" of today's round on Today. */
export async function countDoneSince(sinceIso: string): Promise<number> {
  const { count, error } = await supabase
    .from("tasks")
    .select("id", { count: "exact", head: true })
    .eq("status", "done")
    .gte("acted_at", sinceIso);
  if (error) throw new Error(error.message);
  return count ?? 0;
}

/**
 * Undo of Done or Skip from the Today toast: the row goes back to pending as the expansion wrote it.
 * Snoozed rows are not reopened (the snooze already wrote the moved row). Returns false when the row
 * was not done or skipped any more.
 */
export async function reopenTask(id: string): Promise<boolean> {
  const r = await supabase
    .from("tasks")
    .update({ status: "pending", acted_at: null, note: "" })
    .eq("id", id)
    .in("status", ["done", "skipped"])
    .select("id");
  const changed = (must(r) as Array<{ id: string }>).length > 0;
  if (changed) notifyTasksChanged();
  return changed;
}

export function completeTask(id: string): Promise<boolean> {
  return closeTask(id, "done", "");
}

/** The reason goes to `note`, which the journal shows in place of the title. */
export function skipTask(id: string, reason: string): Promise<boolean> {
  return closeTask(id, "skipped", reason.trim());
}

/** Days a snooze steps forward past days already taken by acted tasks of the same rule. */
const SNOOZE_SLOT_TRIES = 7;

/**
 * Snooze: a new pending row carries the same rule to `days` after the task's own day (after today
 * when the task is overdue, so "1 day" means tomorrow), then the current row closes as `snoozed`.
 * The closed row keeps its line in the journal and its slot for the expansion's de-duplication
 * (same plant, rule_key and due_on), so the task is not recreated the next morning. When a pending
 * task of the same rule already falls on the new day, that one stands in; a day taken by an acted
 * row is stepped past, so a snooze always leaves a pending reminder. A window task's `window_end`
 * moves out to the new day when the snooze passes it, so the copy is not closed as ended before it
 * shows. For a periodic watering the pending waterings between the two days close as `snoozed` too:
 * the grower asked for nothing until the new day. Returns the new due date.
 */
export async function snoozeTask(task: Task, days: number, todayIso: string): Promise<string> {
  const from = task.due_on > todayIso ? task.due_on : todayIso;
  let due_on = addDays(from, Math.max(1, days));
  let inserted = false;
  for (let tries = 0; ; tries++) {
    const window_end = task.window_end !== null && task.window_end < due_on ? due_on : task.window_end;
    const { error } = await supabase.from("tasks").insert({
      plant_id: task.plant_id,
      type: task.type,
      rule_key: task.rule_key,
      due_on,
      window_end,
      title: task.title,
      instruction: task.instruction,
    });
    if (!error) {
      inserted = true;
      break;
    }
    if (error.code !== "23505") throw new Error(error.message);
    const taken = await supabase
      .from("tasks")
      .select("status")
      .eq("plant_id", task.plant_id)
      .eq("rule_key", task.rule_key)
      .eq("due_on", due_on)
      .maybeSingle();
    if (taken.error) throw new Error(taken.error.message);
    if ((taken.data as { status?: TaskStatus } | null)?.status === "pending") break;
    if (tries >= SNOOZE_SLOT_TRIES) throw new Error(t.today.snoozeNoDay);
    due_on = addDays(due_on, 1);
  }
  // The task may have been acted on since the screen loaded (Done on another screen, the expansion
  // closing it as superseded): then the copy just written is taken back and the tap fails plainly.
  if (!(await closeTask(task.id, "snoozed", ""))) {
    if (inserted) {
      await supabase.from("tasks").delete().eq("plant_id", task.plant_id).eq("rule_key", task.rule_key).eq("due_on", due_on).eq("status", "pending");
    }
    throw new Error(t.today.alreadyActed);
  }

  if (task.type === "water" && task.window_end === null) {
    const covered = await supabase
      .from("tasks")
      .update({ status: "snoozed", acted_at: new Date().toISOString(), note: t.today.snoozeCovered(formatIso(due_on)) })
      .eq("plant_id", task.plant_id)
      .eq("rule_key", task.rule_key)
      .eq("status", "pending")
      .gt("due_on", from)
      .lt("due_on", due_on)
      .select("id");
    if (covered.error) throw new Error(covered.error.message);
    if ((covered.data ?? []).length > 0) notifyTasksChanged();
  }
  return due_on;
}

/** YYYY-MM-DD as the phone shows dates, for a note; the raw value when it cannot be read. */
function formatIso(iso: string): string {
  return toLocalDate(iso)?.toLocaleDateString() ?? iso;
}

// ---- diagnosis rows -----------------------------------------------------------
// The rows a diagnosis writes from the app (the carve-out recorded in docs/DECISIONS.md): the
// re-photograph reminder as a pending `scout` row keyed `diagnosis:<photo_id>`, and each treatment
// as a done `protect` row keyed `diagnosis:<photo_id>:treated`. The expansion leaves both alone.

export function diagnosisRuleKey(photoId: string): string {
  return `${DIAGNOSIS_RULE_PREFIX}${photoId}`;
}

export function treatedRuleKey(photoId: string): string {
  return `${diagnosisRuleKey(photoId)}:treated`;
}

/** Every task a diagnosis wrote for a plant, whatever its status, newest first. */
export async function listDiagnosisTasks(plantId: string): Promise<Task[]> {
  const r = await supabase
    .from("tasks")
    .select("*")
    .eq("plant_id", plantId)
    .like("rule_key", `${DIAGNOSIS_RULE_PREFIX}%`)
    .order("created_at", { ascending: false });
  return must(r) as Task[];
}

/**
 * Logs a treatment: a `protect` row already done, dated today, whose note the journal shows in
 * place of the title. Returns null when this diagnosis already has a treatment logged today
 * (the unique plant, rule and day), so a second tap changes nothing.
 */
export async function insertTreatedTask(input: {
  plant_id: string;
  photo_id: string;
  title: string;
  note: string;
  todayIso: string;
}): Promise<Task | null> {
  const r = await supabase
    .from("tasks")
    .insert({
      plant_id: input.plant_id,
      type: "protect",
      rule_key: treatedRuleKey(input.photo_id),
      due_on: input.todayIso,
      window_end: null,
      title: input.title,
      instruction: "",
      status: "done",
      acted_at: new Date().toISOString(),
      note: input.note,
    })
    .select("*")
    .single();
  if (r.error) {
    if (r.error.code === "23505") return null;
    throw new Error(r.error.message);
  }
  return r.data as Task;
}

/**
 * The re-photograph reminder: a pending `scout` row on the day the diagnosis named. It shows on
 * Today, on the plant's Calendar tab and in the digest like any task. Returns null when a task of
 * this diagnosis already falls on that day.
 */
export async function insertRephotoTask(input: {
  plant_id: string;
  photo_id: string;
  due_on: string;
  title: string;
  instruction: string;
}): Promise<Task | null> {
  const r = await supabase
    .from("tasks")
    .insert({
      plant_id: input.plant_id,
      type: "scout",
      rule_key: diagnosisRuleKey(input.photo_id),
      due_on: input.due_on,
      window_end: null,
      title: input.title,
      instruction: input.instruction,
    })
    .select("*")
    .single();
  if (r.error) {
    if (r.error.code === "23505") return null;
    throw new Error(r.error.message);
  }
  notifyTasksChanged();
  return r.data as Task;
}

// ---- questions --------------------------------------------------------------
// One row per exchange of an Ask Claude conversation (Phase 6), written once Claude answered.
// Until the SQL that creates the table has been run, reads and writes fail with
// QuestionsUnavailable: the panel still answers and says the answers are not kept.

export class QuestionsUnavailable extends Error {
  constructor(message: string) {
    super(message);
    this.name = "QuestionsUnavailable";
  }
}

function questionsError(error: { code?: string; message: string }): Error {
  return missingTable(error, "questions") ? new QuestionsUnavailable(error.message) : new Error(error.message);
}

/** Every question asked about a plant, newest first. */
export async function listQuestions(plantId: string): Promise<Question[]> {
  const r = await supabase.from("questions").select("*").eq("plant_id", plantId).order("asked_at", { ascending: false });
  if (r.error) throw questionsError(r.error);
  return (r.data ?? []) as Question[];
}

/** One conversation, oldest first. */
export async function listThread(threadId: string): Promise<Question[]> {
  const r = await supabase.from("questions").select("*").eq("thread_id", threadId).order("asked_at", { ascending: true });
  if (r.error) throw questionsError(r.error);
  return (r.data ?? []) as Question[];
}

/**
 * Saves one exchange under the id the app made for it. A retry after a save whose answer was lost
 * on the way back finds the row already there (unique id) and counts as saved.
 */
export async function insertQuestion(row: Question): Promise<void> {
  const { error } = await supabase.from("questions").insert(row);
  if (error && error.code !== "23505") throw questionsError(error);
}

// ---- planting checks ----------------------------------------------------------
// One row per "Check before planting" (Phase 7), written once Claude answered, under an id and a
// time made on the phone. Until the SQL that creates the table has been run, reads and writes fail
// with ChecksUnavailable: the check screen still shows the verdict and says it is not kept.

export class ChecksUnavailable extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ChecksUnavailable";
  }
}

function checksError(error: { code?: string; message: string }): Error {
  return missingTable(error, "planting_checks") ? new ChecksUnavailable(error.message) : new Error(error.message);
}

/** The checks of one species, newest first. */
export async function listChecks(speciesId: string): Promise<PlantingCheckRow[]> {
  const r = await supabase.from("planting_checks").select("*").eq("species_id", speciesId).order("checked_at", { ascending: false });
  if (r.error) throw checksError(r.error);
  return (r.data ?? []) as PlantingCheckRow[];
}

export async function getCheck(id: string): Promise<PlantingCheckRow | null> {
  const r = await supabase.from("planting_checks").select("*").eq("id", id).maybeSingle();
  if (r.error) throw checksError(r.error);
  return (r.data as PlantingCheckRow | null) ?? null;
}

/**
 * The newest check of each species, keyed by species id, for the library's verdict pills. Only the
 * verdict is read out of each result: the table only grows, and the pills need nothing else.
 */
export async function latestChecks(): Promise<Map<string, CheckSummary>> {
  const latest = new Map<string, CheckSummary>();
  for (let from = 0; ; from += PAGE) {
    const r = await supabase
      .from("planting_checks")
      .select("id, species_id, checked_at, verdict:result->>verdict")
      .order("checked_at", { ascending: false })
      .order("id", { ascending: true })
      .range(from, from + PAGE - 1);
    if (r.error) throw checksError(r.error);
    const page = (r.data ?? []) as Array<Omit<CheckSummary, "verdict"> & { verdict: string | null }>;
    for (const row of page) {
      if (latest.has(row.species_id) || !VERDICTS.includes(row.verdict as Verdict)) continue;
      latest.set(row.species_id, { ...row, verdict: row.verdict as Verdict });
    }
    if (page.length < PAGE) return latest;
  }
}

/**
 * Saves one check under the id the app made for it. A retry after a save whose reply was lost on
 * the way back finds the row already there (unique id) and counts as saved.
 */
export async function insertCheck(row: PlantingCheckRow): Promise<void> {
  const { error } = await supabase.from("planting_checks").insert(row);
  if (error && error.code !== "23505") throw checksError(error);
}

// ---- weather ------------------------------------------------------------------
// The weather_days rows (Phase 8), written by the functions from Open-Meteo and read here for
// Today's card, and the weather setting in the settings table. Until the SQL that creates the table
// has been run, reads fail with WeatherUnavailable and the card stays hidden.

export class WeatherUnavailable extends Error {
  constructor(message: string) {
    super(message);
    this.name = "WeatherUnavailable";
  }
}

/** The stored days from `from` to `to` (YYYY-MM-DD), by date. */
export async function listWeather(from: string, to: string): Promise<WeatherDay[]> {
  const r = await supabase.from("weather_days").select("*").gte("day", from).lte("day", to).order("day", { ascending: true });
  if (r.error) throw missingTable(r.error, "weather_days") ? new WeatherUnavailable(r.error.message) : new Error(r.error.message);
  return (r.data ?? []) as WeatherDay[];
}

/**
 * Each plant's latest diagnosis made since `sinceIso` (an ISO timestamp), with the plant's tag: the
 * weather card's spray line shows when one of them asks for a spray. An older diagnosis of the same
 * plant is left out, since the latest one says where it stands now.
 */
export async function listRecentTreatments(sinceIso: string): Promise<SprayTreatment[]> {
  const r = await supabase
    .from("photos")
    .select("plant_id, ai_result, plant:plants(tag)")
    .eq("kind", "problem")
    .gte("taken_at", sinceIso)
    .order("taken_at", { ascending: false });
  const rows = must(r) as unknown as Array<{ plant_id: string; ai_result: unknown; plant: { tag: string } | null }>;
  const seen = new Set<string>();
  return rows.flatMap((row) => {
    if (seen.has(row.plant_id)) return [];
    seen.add(row.plant_id);
    const result = problemResult(row.ai_result);
    if (!result || !row.plant) return [];
    return [{ tag: row.plant.tag, text: result.organic_treatment, spray: result.spray ?? null, kind: topCause(result)?.kind ?? null }];
  });
}

export const WEATHER_KEY = "weather";

export async function loadWeatherSettings(): Promise<WeatherSettings> {
  return weatherSettings(await getSetting<unknown>(WEATHER_KEY));
}

export async function saveWeatherSettings(next: WeatherSettings): Promise<WeatherSettings> {
  const clean = weatherSettings(next);
  await setSetting(WEATHER_KEY, clean);
  return clean;
}

// ---- export -----------------------------------------------------------------
// The CSV exports (Settings) read whole tables. PostgREST answers at most 1,000 rows per request,
// so the readers page through with range(); a single year of waterings passes that mark.

const PAGE = 1000;

/** Every plant with its species, oldest first, for the plants CSV. */
export async function listAllPlants(): Promise<PlantWithSpecies[]> {
  const out: PlantWithSpecies[] = [];
  for (let from = 0; ; from += PAGE) {
    const r = await supabase
      .from("plants")
      .select("*, species(*)")
      .order("created_at", { ascending: true })
      .order("id", { ascending: true })
      .range(from, from + PAGE - 1);
    const page = must(r) as unknown as PlantWithSpecies[];
    out.push(...page);
    if (page.length < PAGE) return out;
  }
}

/** Every task of every status, earliest due first, each with its plant's tag, site and zone, for the tasks CSV. */
export async function listAllTasks(): Promise<TaskWithPlant[]> {
  const out: TaskWithPlant[] = [];
  for (let from = 0; ; from += PAGE) {
    const r = await supabase
      .from("tasks")
      .select(TASK_WITH_PLANT)
      .order("due_on", { ascending: true })
      .order("created_at", { ascending: true })
      .order("id", { ascending: true })
      .range(from, from + PAGE - 1);
    const page = must(r) as unknown as TaskWithPlant[];
    out.push(...page);
    if (page.length < PAGE) return out;
  }
}

// ---- settings ---------------------------------------------------------------
// Key/value rows of the `settings` table (Phase 5); the zone lists per site live under "zones".
// Until the SQL that creates the table has been run, reads and writes fail with SettingsUnavailable,
// which the Settings screen turns into the instruction to run it and the record form ignores.

export class SettingsUnavailable extends Error {
  constructor(message: string) {
    super(message);
    this.name = "SettingsUnavailable";
  }
}

/** PostgREST answers PGRST205 when a table is not in its schema cache; Postgres says 42P01. */
function missingTable(error: { code?: string; message: string }, table: string): boolean {
  if (error.code === "PGRST205" || error.code === "42P01") return true;
  return error.message.includes(table) && /could not find|does not exist/i.test(error.message);
}

function settingsError(error: { code?: string; message: string }): Error {
  return missingTable(error, "settings") ? new SettingsUnavailable(error.message) : new Error(error.message);
}

export async function getSetting<T>(key: string): Promise<T | null> {
  const r = await supabase.from("settings").select("value").eq("key", key).maybeSingle();
  if (r.error) throw settingsError(r.error);
  return r.data ? (r.data.value as T) : null;
}

export async function setSetting<T>(key: string, value: T): Promise<void> {
  const { error } = await supabase.from("settings").upsert({ key, value }, { onConflict: "key" });
  if (error) throw settingsError(error);
}

export const ZONES_KEY = "zones";

export function emptyZones(): ZoneLists {
  return { backyard: [], farm: [] };
}

/** Trimmed, no blanks, no duplicates (case-insensitive), first spelling kept. */
export function cleanZones(list: string[]): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const raw of list) {
    const zone = raw.trim();
    const key = zone.toLowerCase();
    if (zone && !seen.has(key)) {
      seen.add(key);
      out.push(zone);
    }
  }
  return out;
}

/** The zone lists per site; a site missing from the row has none. */
export async function loadZones(): Promise<ZoneLists> {
  const raw = await getSetting<Partial<Record<Site, unknown>>>(ZONES_KEY);
  const zones = emptyZones();
  for (const site of SITES) {
    const list = raw?.[site];
    if (Array.isArray(list)) zones[site] = cleanZones(list.filter((z): z is string => typeof z === "string"));
  }
  return zones;
}

/** Writes the whole row; returns the lists as stored. */
export async function saveZones(zones: ZoneLists): Promise<ZoneLists> {
  const clean: ZoneLists = { backyard: cleanZones(zones.backyard), farm: cleanZones(zones.farm) };
  await setSetting(ZONES_KEY, clean);
  return clean;
}
