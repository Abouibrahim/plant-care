// Typed access to the four tables and the photos bucket. Screens import from here only.
import { PHOTOS_BUCKET, supabase } from "./supabase";
import type {
  Photo,
  PhotoInsert,
  Plant,
  PlantInsert,
  PlantWithSpecies,
  Site,
  Species,
  SpeciesProfile,
} from "../types";

interface Result<T> {
  data: T | null;
  error: { message: string } | null;
}

function must<T>(r: Result<T>): T {
  if (r.error) throw new Error(r.error.message);
  if (r.data === null || r.data === undefined) throw new Error("No data returned");
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

export async function insertPlant(input: PlantInsert): Promise<Plant> {
  const r = await supabase.from("plants").insert(input).select("*").single();
  return must(r) as Plant;
}

export async function updatePlant(id: string, patch: Partial<PlantInsert>): Promise<Plant> {
  const r = await supabase.from("plants").update(patch).eq("id", id).select("*").single();
  return must(r) as Plant;
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

export async function uploadPhoto(storagePath: string, blob: Blob): Promise<void> {
  const { error } = await supabase.storage
    .from(PHOTOS_BUCKET)
    .upload(storagePath, blob, { contentType: "image/jpeg", upsert: false, cacheControl: "3600" });
  if (error) throw new Error(error.message);
}

export async function insertPhoto(input: PhotoInsert): Promise<Photo> {
  const r = await supabase.from("photos").insert(input).select("*").single();
  return must(r) as Photo;
}

export async function listPhotos(plantId: string): Promise<Photo[]> {
  const r = await supabase.from("photos").select("*").eq("plant_id", plantId).order("taken_at", { ascending: false });
  return must(r) as Photo[];
}

/** The newest photo of each plant in the list, keyed by plant id. */
export async function latestPhotos(plantIds: string[]): Promise<Map<string, Photo>> {
  const map = new Map<string, Photo>();
  if (plantIds.length === 0) return map;
  const r = await supabase
    .from("photos")
    .select("*")
    .in("plant_id", plantIds)
    .order("taken_at", { ascending: false });
  for (const photo of must(r) as Photo[]) {
    if (!map.has(photo.plant_id)) map.set(photo.plant_id, photo);
  }
  return map;
}

const SIGNED_TTL_S = 3600;
const urlCache = new Map<string, { url: string; expires: number }>();

/** A signed URL for a private photo; cached for most of its lifetime. */
export async function photoUrl(storagePath: string): Promise<string> {
  const now = Date.now();
  const hit = urlCache.get(storagePath);
  if (hit && hit.expires > now) return hit.url;
  const { data, error } = await supabase.storage.from(PHOTOS_BUCKET).createSignedUrl(storagePath, SIGNED_TTL_S);
  if (error || !data) throw new Error(error?.message ?? "Could not sign the photo URL");
  urlCache.set(storagePath, { url: data.signedUrl, expires: now + (SIGNED_TTL_S - 600) * 1000 });
  return data.signedUrl;
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
