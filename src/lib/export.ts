// The two CSV exports of the Settings screen: the columns and the rows, built from the db readers
// and handed to the browser as a download. Column names and values are the database's own (site
// "farm", status "done", dates YYYY-MM-DD), so the files read the same whatever the app language.
import { downloadText, toCsv } from "./csv";
import { localIsoDate } from "./dates";
import { listAllPlants, listAllTasks } from "./db";

export interface ExportResult {
  rows: number;
  filename: string;
}

const PLANT_COLUMNS = [
  "tag",
  "quantity",
  "species_en",
  "species_fr",
  "species_ar",
  "species_ar_latin",
  "scientific_name",
  "cultivar",
  "site",
  "zone",
  "lat",
  "lng",
  "planted_on",
  "source",
  "rootstock",
  "plant_id",
  "species_id",
  "created_at",
];

const TASK_COLUMNS = [
  "plant_tag",
  "site",
  "zone",
  "type",
  "title",
  "due_on",
  "window_end",
  "status",
  "acted_at",
  "note",
  "instruction",
  "rule_key",
  "task_id",
  "plant_id",
  "created_at",
];

/** One row per plant, oldest first. */
export async function exportPlantsCsv(): Promise<ExportResult> {
  const plants = await listAllPlants();
  const rows = plants.map((p) => [
    p.tag,
    p.quantity,
    p.species?.common_names.en ?? "",
    p.species?.common_names.fr ?? "",
    p.species?.common_names.ar ?? "",
    p.species?.common_names.ar_latin ?? "",
    p.species?.scientific_name ?? "",
    p.species?.cultivar ?? "",
    p.site,
    p.zone,
    p.lat,
    p.lng,
    p.planted_on,
    p.source,
    p.rootstock,
    p.id,
    p.species_id,
    p.created_at,
  ]);
  const filename = `plant-care-plants-${localIsoDate()}.csv`;
  downloadText(filename, toCsv(PLANT_COLUMNS, rows));
  return { rows: rows.length, filename };
}

/** One row per task of every status, earliest due first. */
export async function exportTasksCsv(): Promise<ExportResult> {
  const tasks = await listAllTasks();
  const rows = tasks.map((task) => [
    task.plant?.tag ?? "",
    task.plant?.site ?? "",
    task.plant?.zone ?? "",
    task.type,
    task.title,
    task.due_on,
    task.window_end,
    task.status,
    task.acted_at,
    task.note,
    task.instruction,
    task.rule_key,
    task.id,
    task.plant_id,
    task.created_at,
  ]);
  const filename = `plant-care-tasks-${localIsoDate()}.csv`;
  downloadText(filename, toCsv(TASK_COLUMNS, rows));
  return { rows: rows.length, filename };
}
