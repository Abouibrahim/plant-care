// POST /api/check  { species_id, site?, zone?, note?, lang? }  ->  PlantingCheck + usage
// Before planting: does this species suit this ground? The species profile is read against the
// grower's sites as they are, with every plant already recorded grouped by site and zone, and the
// site and zone the grower has in mind. The app saves the check; this route only reads.
import type { SupabaseClient } from "@supabase/supabase-js";
import type { VercelRequest, VercelResponse } from "./_http.js";
import { callJson, readPrompt, readSchema } from "./_claude.js";
import { calendarBlock, guildUsesBlock, pestsBlock, profileStatusLine, siteWords, speciesBlock, todayLine } from "./_context.js";
import { handleError, sendError, serviceClient, verifyUser } from "./_supabase.js";
import { ageInMonths, ageStage, isoDateIn, SITE_TIME_ZONE } from "../src/lib/dates.js";
import {
  CHECK_MAX_NOTE_CHARS,
  CHECK_MAX_ZONE_CHARS,
  SITES,
  type CheckRequest,
  type CommonNames,
  type PlantingCheck,
  type Site,
  type Species,
  type ZoneLists,
} from "../src/types.js";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
/** PostgREST answers at most this many rows per request; the inventory is read in pages of it. */
const PAGE = 1000;
/** Farm first, as on Today and in the digest. */
const SITE_ORDER: Site[] = ["farm", "backyard"];

export interface CheckInput {
  species_id: string;
  site: Site | null;
  zone: string;
  note: string;
  lang: "en" | "fr";
}

/** A recorded plant as the inventory reads it. */
export interface InventoryPlant {
  species_id: string;
  site: Site;
  zone: string;
  quantity: number;
  planted_on: string | null;
  species: { scientific_name: string; common_names: CommonNames } | null;
}

export interface CheckContext {
  species: Species;
  /** The Tunis date, YYYY-MM-DD. */
  today: string;
  site: Site | null;
  zone: string;
  note: string;
  lang: "en" | "fr";
  /** Every recorded plant, this species included. */
  plants: InventoryPlant[];
  /** The zone lists from Settings; empty lists when the settings row or table is missing. */
  zones: ZoneLists;
}

function clean(text: string): string {
  return text.replace(/\s+/g, " ").trim();
}

/** The validated body, or the message of a 400. */
export function parseCheckRequest(body: unknown): CheckInput | string {
  const b = (body && typeof body === "object" ? body : {}) as Partial<Record<keyof CheckRequest, unknown>>;
  if (typeof b.species_id !== "string" || !UUID.test(b.species_id)) return "species_id must be a UUID";
  if (b.site !== undefined && b.site !== null && !SITES.includes(b.site as Site)) return "site must be farm or backyard";
  if (b.zone !== undefined && typeof b.zone !== "string") return "zone must be a string";
  if (b.note !== undefined && typeof b.note !== "string") return "note must be a string";
  if (b.lang !== undefined && b.lang !== "en" && b.lang !== "fr") return "lang must be en or fr";
  const zone = clean((b.zone as string | undefined) ?? "");
  const note = clean((b.note as string | undefined) ?? "");
  if (zone.length > CHECK_MAX_ZONE_CHARS) return `zone is longer than ${CHECK_MAX_ZONE_CHARS} characters`;
  if (note.length > CHECK_MAX_NOTE_CHARS) return `note is longer than ${CHECK_MAX_NOTE_CHARS} characters`;
  return {
    species_id: b.species_id,
    site: (b.site as Site | null | undefined) ?? null,
    // A zone means nothing without its site.
    zone: b.site ? zone : "",
    note,
    lang: (b.lang as "en" | "fr" | undefined) ?? "en",
  };
}

function speciesName(s: InventoryPlant["species"]): string {
  if (!s) return "species unknown";
  const common = s.common_names?.en;
  return common ? `${common} (${s.scientific_name})` : s.scientific_name;
}

/**
 * The zones of a site in display order: the Settings list first, then the zones only plants use,
 * matched without case (zones are free text), the first spelling kept.
 */
export function siteZones(site: Site, plants: InventoryPlant[], zones: ZoneLists): string[] {
  const out: string[] = [];
  const seen = new Set<string>();
  const add = (zone: string) => {
    const z = zone.trim();
    if (z && !seen.has(z.toLowerCase())) {
      seen.add(z.toLowerCase());
      out.push(z);
    }
  };
  for (const z of zones[site] ?? []) add(z);
  for (const p of plants) if (p.site === site) add(p.zone);
  return out;
}

/** "6 × Olive (Olea europaea), 1 × Carob (Ceratonia siliqua)": the plants of one zone, by species, largest first. */
function zoneContents(plants: InventoryPlant[]): string {
  const counts = new Map<string, number>();
  for (const p of plants) {
    const name = speciesName(p.species);
    counts.set(name, (counts.get(name) ?? 0) + Math.max(1, p.quantity));
  }
  return [...counts.entries()]
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
    .map(([name, n]) => `${n} × ${name}`)
    .join(", ");
}

/** The plants of one site, one line per zone (empty zones from Settings included), then those with no zone. */
export function siteBlock(site: Site, plants: InventoryPlant[], zones: ZoneLists): string {
  const here = plants.filter((p) => p.site === site);
  const heading = `Plants recorded ${siteWords(site)}, by zone:`;
  const lines: string[] = [];
  for (const zone of siteZones(site, plants, zones)) {
    const inZone = here.filter((p) => p.zone.trim().toLowerCase() === zone.toLowerCase());
    lines.push(`- zone "${zone}": ${inZone.length > 0 ? zoneContents(inZone) : "no plants recorded yet"}`);
  }
  const noZone = here.filter((p) => !p.zone.trim());
  if (noZone.length > 0) lines.push(`- no zone given: ${zoneContents(noZone)}`);
  return lines.length > 0 ? `${heading}\n${lines.join("\n")}` : `No plant is recorded ${siteWords(site)} yet.`;
}

/** How many plants of the species are recorded, where, and how old. */
export function sameSpeciesLine(speciesId: string, plants: InventoryPlant[], today: string): string {
  const mine = plants.filter((p) => p.species_id === speciesId);
  if (mine.length === 0) return "No plant of this species is recorded yet.";
  const parts = SITE_ORDER.map((site) => {
    const here = mine.filter((p) => p.site === site);
    if (here.length === 0) return null;
    const count = here.reduce((n, p) => n + Math.max(1, p.quantity), 0);
    const where = [...new Set(here.map((p) => p.zone.trim()).filter(Boolean))];
    // A plant with no planting date is "treated as mature" by the reminders, but here that would
    // read as proof the species copes with the site, so it is named for what it is.
    const stages = [...new Set(here.map((p) => (p.planted_on ? ageStage(ageInMonths(p.planted_on, today)) : "planting date unknown")))];
    return `${count} ${siteWords(site)}${where.length > 0 ? ` (zone ${where.map((z) => `"${z}"`).join(", ")})` : ""}, ${stages.join(" and ")}`;
  }).filter((part): part is string => part !== null);
  return `Plants of this species already recorded: ${parts.join("; ")}.`;
}

function intentLine({ site, zone }: Pick<CheckContext, "site" | "zone">): string {
  if (!site) return "The grower has not chosen a site yet: compare the farm and the backyard.";
  return `The grower has in mind ${siteWords(site)}${zone ? `, zone "${zone}"` : ", no zone chosen yet"}.`;
}

/** The user message: the species, what is already planted, where the grower is thinking of putting it. */
export function describeCheck(ctx: CheckContext): string {
  const s = ctx.species;
  const parts: string[] = [];
  parts.push(todayLine(ctx.today));
  parts.push(`${speciesBlock(s)}\n${profileStatusLine(s)}`);
  parts.push(calendarBlock(s));
  parts.push(pestsBlock(s));
  parts.push(guildUsesBlock(s));
  parts.push(sameSpeciesLine(s.id, ctx.plants, ctx.today));
  parts.push(intentLine(ctx));
  parts.push(ctx.note ? `Grower's note: "${ctx.note}"` : "The grower left no note.");
  for (const site of SITE_ORDER) parts.push(siteBlock(site, ctx.plants, ctx.zones));
  if (ctx.lang === "fr") parts.push("Write every text field in French as used in Tunisia; keep the enum values in English.");
  parts.push("Check whether this species suits this site before it is bought or planted.");
  return parts.join("\n\n");
}

/** Every plant with the names of its species, read in pages. */
export async function inventory(db: SupabaseClient): Promise<InventoryPlant[]> {
  const out: InventoryPlant[] = [];
  for (let from = 0; ; from += PAGE) {
    const { data, error } = await db
      .from("plants")
      .select("species_id, site, zone, quantity, planted_on, species(scientific_name, common_names)")
      .order("created_at", { ascending: true })
      .order("id", { ascending: true })
      .range(from, from + PAGE - 1);
    if (error) throw error;
    const page = (data ?? []) as unknown as InventoryPlant[];
    out.push(...page);
    if (page.length < PAGE) return out;
  }
}

/** The Settings zone lists; none when the row, or the table itself, does not exist. */
export async function zoneLists(db: SupabaseClient): Promise<ZoneLists> {
  const zones: ZoneLists = { backyard: [], farm: [] };
  const { data, error } = await db.from("settings").select("value").eq("key", "zones").maybeSingle();
  // The lists only add the zones no plant uses yet: a missing table (before the Phase 5 SQL) or a failed read costs those, not the check.
  if (error) return zones;
  const value = (data as { value?: Partial<Record<Site, unknown>> } | null)?.value;
  for (const site of SITES) {
    const list = value?.[site];
    if (Array.isArray(list)) zones[site] = list.filter((z): z is string => typeof z === "string");
  }
  return zones;
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
    const input = parseCheckRequest(req.body);
    if (typeof input === "string") {
      sendError(res, 400, input);
      return;
    }

    const db = serviceClient();
    const { data: row, error } = await db.from("species").select("*").eq("id", input.species_id).maybeSingle();
    if (error) throw error;
    if (!row) {
      sendError(res, 404, "Species not found");
      return;
    }
    const [plants, zones] = await Promise.all([inventory(db), zoneLists(db)]);
    const text = describeCheck({ ...input, species: row as Species, today: isoDateIn(SITE_TIME_ZONE), plants, zones });

    const result = await callJson<PlantingCheck>({
      rules: readPrompt("check.md"),
      schema: readSchema("check.schema.json"),
      content: [{ type: "text", text }],
      // Eight factor notes and five short sections, plus medium-effort thinking; callJson retries
      // once at 8,192 when cut.
      maxTokens: 4096,
      // Weighing a species against the site and what grows there: medium effort, like a diagnosis.
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
