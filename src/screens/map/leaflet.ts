// Leaflet set up the way the app's maps use it (Phase 9). Only the map screens import this file, so
// the library loads with the first map and stays out of the main bundle. Pins are HTML (a coloured
// dot, the group's size, the tag), not Leaflet's PNG markers, whose image paths break under a bundler;
// they are built as DOM nodes so a tag is never read as HTML.
import L from "leaflet";
import "leaflet/dist/leaflet.css";
import { MAP_MAX_ZOOM, tileSources, type LatLng, type MapLayer, type PinState } from "../../lib/map";

export { L };

const SOURCES = tileSources(import.meta.env.VITE_ARCGIS_API_KEY as string | undefined);

/** Whether a map key is set: without it the maps show the street map alone. */
export const HAS_SATELLITE = SOURCES.satellite !== null;

/** Zoom from which the pins show their tags. */
export const LABEL_ZOOM = 18;

const LAYER_KEY = "plantcare.mapLayer";

/** The layer chosen last on this phone; satellite by default when there is a key. */
export function readLayer(): MapLayer {
  if (!HAS_SATELLITE) return "street";
  try {
    return localStorage.getItem(LAYER_KEY) === "street" ? "street" : "satellite";
  } catch {
    return "satellite";
  }
}

export function writeLayer(layer: MapLayer): void {
  try {
    localStorage.setItem(LAYER_KEY, layer);
  } catch {
    // storage blocked: the layer still applies until the map closes
  }
}

/** A map in `el`, without Leaflet's own credit (the tile providers' credits stay, as their terms ask). */
export function createMap(el: HTMLElement, centre: LatLng, zoom: number): L.Map {
  const map = L.map(el, { maxZoom: MAP_MAX_ZOOM, zoomControl: true, attributionControl: true }).setView([centre.lat, centre.lng], zoom);
  map.attributionControl.setPrefix(false);
  // The tags show once the trees are far enough apart to read them.
  const labels = () => el.classList.toggle("map-labels", map.getZoom() >= LABEL_ZOOM);
  map.on("zoomend", labels);
  labels();
  return map;
}

/**
 * Removes a map when its screen closes. Leaflet can throw while tearing down mid-gesture or
 * mid-animation; inside React's cleanup that would blank the whole app, so the error stops here.
 */
export function removeMap(map: L.Map): void {
  try {
    map.remove();
  } catch {
    // the container goes with the screen anyway
  }
}

/** Satellite tiles failing this many times before any loads: a wrong or expired key, or no connection. */
const SATELLITE_FAILURES = 6;

/**
 * The tiles of a layer. On the satellite layer, `onSatelliteFailed` is called once if the first
 * tiles all fail, so the map can fall back to the street map instead of staying blank.
 */
export function tileLayer(layer: MapLayer, onSatelliteFailed?: () => void): L.TileLayer {
  const satellite = layer === "satellite" && SOURCES.satellite !== null;
  const source = satellite && SOURCES.satellite ? SOURCES.satellite : SOURCES.street;
  const tiles = L.tileLayer(source.url, { attribution: source.attribution, maxNativeZoom: source.maxNativeZoom, maxZoom: MAP_MAX_ZOOM });
  if (satellite && onSatelliteFailed) {
    let loaded = 0;
    let failed = 0;
    tiles.on("tileload", () => {
      loaded += 1;
    });
    tiles.on("tileerror", () => {
      failed += 1;
      if (loaded === 0 && failed === SATELLITE_FAILURES) onSatelliteFailed();
    });
  }
  return tiles;
}

function span(className: string, text?: string): HTMLSpanElement {
  const el = document.createElement("span");
  el.className = className;
  if (text !== undefined) el.textContent = text;
  return el;
}

/** A plant's pin: a dot in its state's colour, ×N for a group, and the tag beside it. */
export function pinIcon(opts: { state: PinState; quantity: number; label: string; selected?: boolean }): L.DivIcon {
  const root = span(`pin pin-${opts.state}${opts.selected ? " selected" : ""}`);
  root.append(span("pin-dot"));
  if (opts.quantity > 1) root.append(span("pin-qty", `×${opts.quantity}`));
  root.append(span("pin-label", opts.label));
  return L.divIcon({ html: root, className: "pin-icon", iconSize: [40, 40], iconAnchor: [20, 20] });
}

/** Another plant of the site, shown small and grey while a tree is being placed. */
export function neighbourIcon(label: string): L.DivIcon {
  const root = span("pin pin-neighbour");
  root.append(span("pin-dot"), span("pin-label", label));
  return L.divIcon({ html: root, className: "pin-icon", iconSize: [24, 24], iconAnchor: [12, 12] });
}

/** The phone's own position: a dot with its accuracy circle. */
export function drawMe(group: L.LayerGroup, at: LatLng, accuracy: number): void {
  group.clearLayers();
  L.circle([at.lat, at.lng], { radius: accuracy, className: "me-accuracy", interactive: false }).addTo(group);
  L.circleMarker([at.lat, at.lng], { radius: 7, className: "me-dot", interactive: false }).addTo(group);
}
