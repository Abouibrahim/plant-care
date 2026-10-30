// Placing a plant (Phase 9): a full-screen map with a fixed cross in the middle. The grower moves the
// map until the cross sits on the tree and saves; "Use my location" listens to the GPS and brings the
// map to the phone first. Under trees a phone is often 5 to 15 m off, so the satellite view, with
// the site's other plants shown as small dots, is what makes the position right. Loaded lazily.
import { useEffect, useRef, useState } from "react";
import { Layers, LocateFixed, X } from "lucide-react";
import { t } from "../../i18n";
import { listPlantSpots } from "../../lib/db";
import { neighboursOf, roundPosition, startView, TREE_ZOOM, type LatLng } from "../../lib/map";
import { COARSE_M, LocateError, locate, type Fix } from "../../lib/location";
import { useBackClose } from "../../lib/useBackClose";
import { addTiles, createMap, drawMe, HAS_SATELLITE, L, neighbourIcon, readLayer, removeMap, writeLayer } from "./leaflet";
import type { Site } from "../../types";

interface Props {
  title: string;
  /** The plant being placed, left out of the dots; null for a plant not saved yet (Capture). */
  plantId: string | null;
  site: Site;
  initial: LatLng | null;
  onSave: (position: LatLng) => Promise<void> | void;
  /** Offered when the plant has a position. */
  onClear?: () => Promise<void> | void;
  onClose: () => void;
}

type Status = { kind: "hint" } | { kind: "listening"; metres: number | null } | { kind: "found"; metres: number } | { kind: "note"; text: string };

export default function PositionSheet({ title, plantId, site, initial, onSave, onClear, onClose }: Props) {
  const elRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<L.Map | null>(null);
  const tilesRef = useRef<L.TileLayer | null>(null);
  const meRef = useRef<L.LayerGroup | null>(null);
  const neighboursRef = useRef<L.LayerGroup | null>(null);
  const movedRef = useRef(false);
  /** Set at the first GPS reading: from then on the GPS, not the site's middle, places the map. */
  const locatedRef = useRef(false);
  const cancelLocateRef = useRef<() => void>(() => {});
  const [layer, setLayer] = useState(readLayer);
  const [status, setStatus] = useState<Status>({ kind: "hint" });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [layerNote, setLayerNote] = useState<string | null>(null);

  useBackClose(onClose, busy);

  useEffect(() => {
    const el = elRef.current;
    if (!el) return;
    const start = startView(initial, []);
    const map = createMap(el, start.centre, start.zoom);
    mapRef.current = map;
    neighboursRef.current = L.layerGroup().addTo(map);
    meRef.current = L.layerGroup().addTo(map);
    map.on("dragstart", () => {
      movedRef.current = true;
    });
    const resize = new ResizeObserver(() => map.invalidateSize());
    resize.observe(el);

    let active = true;
    listPlantSpots()
      .then((spots) => {
        const group = neighboursRef.current;
        if (!active || !group) return;
        const neighbours = neighboursOf(spots, site, plantId);
        for (const n of neighbours) L.marker([n.lat, n.lng], { icon: neighbourIcon(n.tag), interactive: false, keyboard: false }).addTo(group);
        // A plant without a position opens on its site's other trees, unless the grower has moved the
        // map or asked for the GPS already (the dots can arrive late on a weak connection).
        if (!initial && !movedRef.current && !locatedRef.current && neighbours.length > 0) {
          const view = startView(null, neighbours);
          map.setView([view.centre.lat, view.centre.lng], view.zoom);
        }
      })
      .catch(() => {
        // the dots only help: the map works without them
      });

    return () => {
      active = false;
      resize.disconnect();
      cancelLocateRef.current();
      removeMap(map);
      mapRef.current = null;
      tilesRef.current = null;
    };
    // The sheet opens once per plant; later changes to the props do not move the map.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    tilesRef.current?.remove();
    tilesRef.current = addTiles(map, layer, () => {
      // A wrong key, the month's free tiles used up, or no connection: the street map, for this visit only.
      setLayer("street");
      setLayerNote(t.map.satelliteFailed);
    });
  }, [layer]);

  function switchLayer() {
    const next = layer === "satellite" ? "street" : "satellite";
    setLayer(next);
    writeLayer(next);
    setLayerNote(null);
  }

  function findMe() {
    cancelLocateRef.current();
    setStatus({ kind: "listening", metres: null });
    let first = true;
    const run = locate((fix: Fix) => {
      const map = mapRef.current;
      if (!map || !meRef.current) return;
      drawMe(meRef.current, fix, fix.accuracy);
      locatedRef.current = true;
      // Each better reading brings the cross back to the phone, until the grower moves the map.
      if (first || !movedRef.current) map.setView([fix.lat, fix.lng], first ? TREE_ZOOM : map.getZoom());
      if (first) movedRef.current = false;
      first = false;
      setStatus({ kind: "listening", metres: Math.round(fix.accuracy) });
    });
    cancelLocateRef.current = run.cancel;
    run.done
      .then((fix) => {
        const metres = Math.round(fix.accuracy);
        setStatus(fix.accuracy > COARSE_M ? { kind: "note", text: t.position.coarse(metres) } : { kind: "found", metres });
      })
      .catch((err: unknown) => {
        if (!(err instanceof LocateError)) return;
        if (err.reason !== "cancelled") setStatus({ kind: "note", text: t.position.errors[err.reason] });
        // Stopped by a Save: back to the hint, so a failed save leaves "Use my location" usable again.
        else setStatus((prev) => (prev.kind === "listening" ? { kind: "hint" } : prev));
      });
  }

  async function save() {
    const map = mapRef.current;
    if (!map || busy) return;
    const centre = map.getCenter();
    setBusy(true);
    setError(null);
    cancelLocateRef.current();
    try {
      await onSave(roundPosition({ lat: centre.lat, lng: centre.lng }));
      onClose();
    } catch (err) {
      setError(`${t.position.saveFailed}: ${err instanceof Error ? err.message : t.errors.generic}`);
      setBusy(false);
    }
  }

  async function clear() {
    if (!onClear || busy) return;
    setBusy(true);
    setError(null);
    try {
      await onClear();
      onClose();
    } catch (err) {
      setError(`${t.position.saveFailed}: ${err instanceof Error ? err.message : t.errors.generic}`);
      setBusy(false);
    }
  }

  const statusText =
    status.kind === "hint"
      ? t.position.hint
      : status.kind === "listening"
        ? t.position.listening(status.metres)
        : status.kind === "found"
          ? t.position.found(status.metres)
          : status.text;

  return (
    <div className="sheet position-sheet" role="dialog" aria-modal="true" aria-label={title}>
      <div className="screen">
        <div className="screen-header">
          <button type="button" className="icon-btn" onClick={onClose} disabled={busy} aria-label={t.common.close}>
            <X size={22} aria-hidden />
          </button>
          <h1>{title}</h1>
        </div>

        <div className="map-wrap position-map">
          <div ref={elRef} className="map" />
          <svg className="crosshair" viewBox="0 0 48 48" aria-hidden>
            <circle cx="24" cy="24" r="9" />
            <path d="M24 2v14M24 32v14M2 24h14M32 24h14" />
          </svg>
          <div className="map-tools">
            {HAS_SATELLITE && (
              <button type="button" className="icon-btn map-tool" onClick={switchLayer} aria-label={t.map.switchLayer} title={layer === "satellite" ? t.map.street : t.map.satellite}>
                <Layers size={20} aria-hidden />
              </button>
            )}
          </div>
        </div>

        <p className="small muted" role="status" style={{ margin: "8px 0" }}>
          {statusText}
        </p>
        {!HAS_SATELLITE && <p className="small muted" style={{ marginTop: 0 }}>{t.map.streetOnly}</p>}
        {layerNote && <p className="small muted" style={{ marginTop: 0 }}>{layerNote}</p>}
        {error && <div className="banner error">{error}</div>}

        <div className="action-grid">
          <button type="button" className="small" onClick={findMe} disabled={busy || status.kind === "listening"}>
            <LocateFixed size={18} aria-hidden className={status.kind === "listening" ? "pulse" : undefined} />
            {t.position.useMyLocation}
          </button>
          <button type="button" className="small primary" onClick={() => void save()} disabled={busy}>
            {busy ? t.position.saving : t.position.save}
          </button>
        </div>
        {onClear && initial && (
          <button type="button" className="link small danger-text" style={{ marginTop: 12 }} onClick={() => void clear()} disabled={busy}>
            {t.position.remove}
          </button>
        )}
      </div>
    </div>
  );
}
