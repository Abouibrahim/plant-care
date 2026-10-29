// The farm map and the tree tags (Phase 9): the colour a plant's pin takes, where a map opens, the
// short code and link printed on a tag, and the tile sources. Pure helpers shared by the map, the
// position sheet and the tag sheet; nothing here touches the page or the data.
import { dueState } from "./today";
import { TOWN } from "./weather";
import type { Plant, Site, Task } from "../types";

// ---- pins --------------------------------------------------------------------

/** What a pin shows: the most pressing of the plant's pending tasks, or nothing due. */
export type PinState = "overdue" | "today" | "open" | "none";

const PIN_RANK: Record<PinState, number> = { overdue: 0, today: 1, open: 2, none: 3 };

/**
 * The pin state of each plant that has something due, keyed by plant id: late beats due today,
 * which beats an open window, with the same reading of a task as Today's. A plant missing from the
 * map has nothing due; tasks still to come do not colour a pin.
 */
export function pinStates(tasks: Array<Pick<Task, "plant_id" | "due_on" | "window_end">>, today: string): Map<string, PinState> {
  const states = new Map<string, PinState>();
  for (const task of tasks) {
    const due = dueState(task, today);
    if (due === "upcoming") continue;
    const current = states.get(task.plant_id) ?? "none";
    if (PIN_RANK[due] < PIN_RANK[current]) states.set(task.plant_id, due);
  }
  return states;
}

// ---- positions ---------------------------------------------------------------

export interface LatLng {
  lat: number;
  lng: number;
}

/** Whether a plant carries a usable position (both numbers, on the globe). */
export function hasPosition<P extends Pick<Plant, "lat" | "lng">>(plant: P): plant is P & LatLng {
  const { lat, lng } = plant;
  return (
    typeof lat === "number" && typeof lng === "number" && Number.isFinite(lat) && Number.isFinite(lng) && Math.abs(lat) <= 90 && Math.abs(lng) <= 180
  );
}

/** South-west and north-east corners around the positioned plants, or null when none has a position. */
export function boundsOf(plants: Array<Pick<Plant, "lat" | "lng">>): [LatLng, LatLng] | null {
  const placed = plants.filter(hasPosition);
  if (placed.length === 0) return null;
  const lats = placed.map((p) => p.lat);
  const lngs = placed.map((p) => p.lng);
  return [
    { lat: Math.min(...lats), lng: Math.min(...lngs) },
    { lat: Math.max(...lats), lng: Math.max(...lngs) },
  ];
}

/** Zoom for a map with nothing to frame: the town, where both sites are. */
export const TOWN_ZOOM = 15;
/** Zoom when a map centres on one tree (the satellite imagery goes to 18; the map enlarges it). */
export const TREE_ZOOM = 19;
/** Zoom for the middle of a site when the plant being placed has no position yet. */
export const SITE_ZOOM = 17;
/** The map's deepest zoom; past the imagery's own levels the tiles are enlarged. */
export const MAP_MAX_ZOOM = 20;

/**
 * Where a plant's position sheet opens: on the plant when it has a position, otherwise in the
 * middle of the other positioned plants of its site, otherwise on the town.
 */
export function startView(plant: Pick<Plant, "lat" | "lng"> | null, neighbours: Array<Pick<Plant, "lat" | "lng">>): { centre: LatLng; zoom: number } {
  if (plant && hasPosition(plant)) return { centre: { lat: plant.lat, lng: plant.lng }, zoom: TREE_ZOOM };
  const box = boundsOf(neighbours);
  if (box) return { centre: { lat: (box[0].lat + box[1].lat) / 2, lng: (box[0].lng + box[1].lng) / 2 }, zoom: SITE_ZOOM };
  return { centre: { lat: TOWN.lat, lng: TOWN.lng }, zoom: TOWN_ZOOM };
}

/** A position as saved: six decimals is about 10 cm, far finer than a phone or a tap can place. */
export function roundPosition(p: LatLng): LatLng {
  const round = (n: number) => Math.round(n * 1e6) / 1e6;
  return { lat: round(p.lat), lng: round(p.lng) };
}

/** The plants of the site with a position, for the dots the position sheet places a tree against. */
export function neighboursOf<P extends Pick<Plant, "id" | "site" | "lat" | "lng">>(plants: P[], site: Site, exceptId: string | null): Array<P & LatLng> {
  return plants.filter((p): p is P & LatLng => p.site === site && p.id !== exceptId && hasPosition(p));
}

// ---- tags --------------------------------------------------------------------

/**
 * A tag's code: the first 8 hex digits of the plant's id. It needs no column of its own, and keeps
 * the QR code small (version 5 at correction Q, where the whole link would need version 7). Two
 * plants share a code about once in four billion pairs; the tag route lists both if it happens.
 */
export const TAG_CODE_LENGTH = 8;

export function tagCode(plantId: string): string {
  return plantId.replace(/-/g, "").slice(0, TAG_CODE_LENGTH).toLowerCase();
}

/** The code from a scanned link, or null when it is not 8 hex digits. */
export function parseTagCode(raw: string | undefined): string | null {
  const code = (raw ?? "").trim().toLowerCase();
  return /^[0-9a-f]{8}$/.test(code) ? code : null;
}

/** The ids a code covers, as the bounds of a range query on the uuid column. */
export function tagIdRange(code: string): { from: string; to: string } {
  return { from: `${code}-0000-0000-0000-000000000000`, to: `${code}-ffff-ffff-ffff-ffffffffffff` };
}

/** What the QR code holds: the app's address and the code, opened by the /t/:code route. */
export function tagUrl(origin: string, plantId: string): string {
  return `${origin.replace(/\/+$/, "")}/t/${tagCode(plantId)}`;
}

/** The code as printed under the QR code, in two groups for reading aloud: "0D6F 2C1E". */
export function formatTagCode(code: string): string {
  const upper = code.toUpperCase();
  return `${upper.slice(0, 4)} ${upper.slice(4)}`;
}

// ---- tiles -------------------------------------------------------------------

export type MapLayer = "satellite" | "street";

export interface TileSource {
  url: string;
  /** HTML shown in the map's corner, as each provider's terms require. */
  attribution: string;
  /** The deepest zoom the provider has; Leaflet enlarges its tiles beyond it. */
  maxNativeZoom: number;
}

/**
 * Satellite: Esri World Imagery through an ArcGIS Location Platform key (0.34 m imagery around
 * Menzel Bouzelfa, real tiles to zoom 18; above it Esri sends a grey placeholder, hence the cap).
 * Without a key there is no satellite layer: the keyless Esri address is not licensed for this use.
 * Street: OpenStreetMap's standard tiles. Neither may be stored for offline use, so the service
 * worker leaves them alone.
 */
export function tileSources(arcgisKey: string | undefined): { street: TileSource; satellite: TileSource | null } {
  const key = arcgisKey?.trim();
  return {
    street: {
      url: "https://tile.openstreetmap.org/{z}/{x}/{y}.png",
      attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors',
      maxNativeZoom: 19,
    },
    satellite: key
      ? {
          url: `https://ibasemaps-api.arcgis.com/arcgis/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}?token=${encodeURIComponent(key)}`,
          attribution: 'Powered by <a href="https://www.esri.com">Esri</a> | Source: Esri, Vantor, Earthstar Geographics, and the GIS User Community',
          maxNativeZoom: 18,
        }
      : null,
  };
}
