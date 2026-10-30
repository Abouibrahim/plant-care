// The Plants screen's map (Phase 9): a pin per plant with a position, coloured by what is due, a card
// for the pin tapped, the phone's own position on request, and the count of plants still without
// one. Loaded lazily with Leaflet; the Plants screen passes the plants its filter and search keep.
import { useEffect, useMemo, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { Layers, LocateFixed, X } from "lucide-react";
import { t } from "../../i18n";
import { boundsOf, hasPosition, pinStates, TOWN_ZOOM, TREE_ZOOM, type PinState } from "../../lib/map";
import { COARSE_M, LocateError, locate, type Fix } from "../../lib/location";
import { dueState, sortByDue } from "../../lib/today";
import { TOWN } from "../../lib/weather";
import { PhotoImg } from "../../components/PhotoImg";
import { TypePill } from "../../components/TypeIcon";
import { createMap, drawMe, HAS_SATELLITE, L, pinIcon, readLayer, removeMap, tileLayer, writeLayer } from "./leaflet";
import type { LatestPhoto, PlantWithSpecies, TaskWithPlant } from "../../types";

/** Tasks listed on a pin's card before "+N more": two keep the card short enough for the pin to show above it on a small phone. */
const CARD_TASKS = 2;
const LEGEND: PinState[] = ["overdue", "today", "open", "none"];
/** Room kept clear around a selected pin: the tools above it, the card's own height below it. */
const PIN_MARGIN = { top: 64, side: 24, aboveCard: 32 };

/** Whether the tasks behind the pin colours have arrived. */
export type DueStatus = "loading" | "ready" | "failed";

interface Props {
  /** The plants the Plants screen's filter and search keep, with or without a position. */
  plants: PlantWithSpecies[];
  photos: Map<string, LatestPhoto>;
  /** Pending tasks due by today (late, due today, open windows). */
  due: TaskWithPlant[];
  dueStatus: DueStatus;
  today: string;
  /** Whether a site chip or the search narrows the plants (for the "none placed" note). */
  filtering: boolean;
  /** A plant to centre on with its card open (from the plant page's "Show on map"). */
  focusId: string | null;
  /** Lists the plants without a position. */
  onShowMissing: () => void;
  /** Reads the tasks again after they failed. */
  onRetryDue: () => void;
}

export default function PlantMap({ plants, photos, due, dueStatus, today, filtering, focusId, onShowMissing, onRetryDue }: Props) {
  const elRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<L.Map | null>(null);
  const tilesRef = useRef<L.TileLayer | null>(null);
  const pinsRef = useRef<L.LayerGroup | null>(null);
  const meRef = useRef<L.LayerGroup | null>(null);
  const cardRef = useRef<HTMLDivElement>(null);
  const cancelLocateRef = useRef<() => void>(() => {});
  const focusedRef = useRef(false);
  const [layer, setLayer] = useState(readLayer);
  const [selected, setSelected] = useState<string | null>(focusId);
  const [locating, setLocating] = useState(false);
  const [locateNote, setLocateNote] = useState<string | null>(null);
  const [layerNote, setLayerNote] = useState<string | null>(null);

  const placed = useMemo(() => plants.filter(hasPosition), [plants]);
  const missing = plants.length - placed.length;
  const states = useMemo(() => pinStates(due, today), [due, today]);
  // The map frames the pins again only when the set of plants changes, not when a task is done.
  const frameKey = placed.map((p) => p.id).join(",");

  useEffect(() => {
    const el = elRef.current;
    if (!el) return;
    const map = createMap(el, TOWN, TOWN_ZOOM);
    mapRef.current = map;
    // A new map has not centred on the focused plant yet (React may have built and dropped one before it).
    focusedRef.current = false;
    pinsRef.current = L.layerGroup().addTo(map);
    meRef.current = L.layerGroup().addTo(map);
    map.on("click", () => setSelected(null));
    // The container gets its size after the lazy chunk mounts, and again on rotation.
    const resize = new ResizeObserver(() => map.invalidateSize());
    resize.observe(el);
    return () => {
      resize.disconnect();
      cancelLocateRef.current();
      removeMap(map);
      mapRef.current = null;
      tilesRef.current = null;
    };
  }, []);

  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    tilesRef.current?.remove();
    tilesRef.current = tileLayer(layer, () => {
      // A wrong or expired key, or no connection: the street map, for this visit only.
      setLayer("street");
      setLayerNote(t.map.satelliteFailed);
    }).addTo(map);
  }, [layer]);

  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    const focus = focusId && !focusedRef.current ? placed.find((p) => p.id === focusId) : undefined;
    if (focus) {
      focusedRef.current = true;
      // Centred here; the card's effect below then raises it clear of the card that opens with it.
      map.setView([focus.lat, focus.lng], TREE_ZOOM, { animate: false });
      return;
    }
    const box = boundsOf(placed);
    if (!box) map.setView([TOWN.lat, TOWN.lng], TOWN_ZOOM);
    else if (placed.length === 1) map.setView([box[0].lat, box[0].lng], TREE_ZOOM - 1);
    else map.fitBounds([[box[0].lat, box[0].lng], [box[1].lat, box[1].lng]], { padding: [36, 36], maxZoom: TREE_ZOOM });
    // `placed` is read through frameKey: a new list with the same plants must not move the map.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [frameKey, focusId]);

  useEffect(() => {
    const pins = pinsRef.current;
    if (!pins) return;
    pins.clearLayers();
    for (const plant of placed) {
      L.marker([plant.lat, plant.lng], {
        icon: pinIcon({ state: states.get(plant.id) ?? "none", quantity: plant.quantity, label: plant.tag, selected: plant.id === selected }),
        title: plant.tag,
        alt: plant.tag,
        keyboard: true,
        riseOnHover: true,
        zIndexOffset: plant.id === selected ? 1000 : 0,
      })
        .on("click", () => setSelected(plant.id))
        .addTo(pins);
    }
  }, [placed, states, selected]);

  const plant = selected ? placed.find((p) => p.id === selected) : undefined;
  const plantTasks = plant ? sortByDue(due.filter((task) => task.plant_id === plant.id && dueState(task, today) !== "upcoming"), today) : [];
  const cardRows = Math.min(plantTasks.length, CARD_TASKS + 1);

  // The card covers the foot of the map: once it is drawn (and again when its tasks arrive and it
  // grows), the selected pin moves up into the part of the map left in sight.
  useEffect(() => {
    const map = mapRef.current;
    const card = cardRef.current;
    if (!map || !card || !plant) return;
    map.panInside([plant.lat, plant.lng], {
      paddingTopLeft: [PIN_MARGIN.side, PIN_MARGIN.top],
      paddingBottomRight: [PIN_MARGIN.side, card.offsetHeight + PIN_MARGIN.aboveCard],
    });
    // Moves only for a new selection or a card that changed size, not for every new list of plants.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selected, cardRows, dueStatus]);

  function switchLayer() {
    const next = layer === "satellite" ? "street" : "satellite";
    setLayer(next);
    writeLayer(next);
    setLayerNote(null);
  }

  function whereAmI() {
    cancelLocateRef.current();
    setLocating(true);
    setLocateNote(null);
    let first = true;
    const run = locate((fix: Fix) => {
      const map = mapRef.current;
      if (!map || !meRef.current) return;
      drawMe(meRef.current, fix, fix.accuracy);
      if (first) map.setView([fix.lat, fix.lng], Math.max(map.getZoom(), TREE_ZOOM - 1));
      first = false;
      setLocateNote(t.map.accuracy(Math.round(fix.accuracy)));
    });
    cancelLocateRef.current = run.cancel;
    run.done
      .then((fix) => {
        if (fix.accuracy > COARSE_M) setLocateNote(t.position.coarse(Math.round(fix.accuracy)));
      })
      .catch((err: unknown) => {
        if (err instanceof LocateError && err.reason !== "cancelled") setLocateNote(t.position.errors[err.reason]);
      })
      .finally(() => setLocating(false));
  }

  return (
    <div className="stack" style={{ gap: 8 }}>
      <div className="map-wrap plant-map">
        <div ref={elRef} className="map" />
        <div className="map-tools">
          {HAS_SATELLITE && (
            <button type="button" className="icon-btn map-tool" onClick={switchLayer} aria-label={t.map.switchLayer} title={layer === "satellite" ? t.map.street : t.map.satellite}>
              <Layers size={20} aria-hidden />
            </button>
          )}
          <button type="button" className="icon-btn map-tool" onClick={whereAmI} disabled={locating} aria-label={t.map.whereAmI} title={t.map.whereAmI}>
            <LocateFixed size={20} aria-hidden className={locating ? "pulse" : undefined} />
          </button>
        </div>
        {placed.length === 0 && (
          <div className="map-empty small">{plants.length === 0 ? t.plants.emptyFiltered : filtering ? t.map.nonePlacedFiltered : t.map.nonePlaced}</div>
        )}
        {plant && (
          <div ref={cardRef} className="map-card card" role="dialog" aria-label={plant.tag}>
            <div className="row" style={{ alignItems: "flex-start" }}>
              <PhotoImg className="photo thumb" size="thumb" path={photos.get(plant.id)?.storage_path} alt={plant.tag} />
              <div className="grow" style={{ minWidth: 0 }}>
                <div style={{ fontWeight: 600 }}>
                  {plant.tag}
                  {plant.quantity > 1 && <span className="muted"> ×{plant.quantity}</span>}
                </div>
                <div className="small">{plant.species?.common_names.en}</div>
                {dueStatus !== "ready" ? (
                  <div className="muted small">{dueStatus === "loading" ? t.map.tasksLoading : t.map.tasksFailed}</div>
                ) : plantTasks.length === 0 ? (
                  <div className="muted small">{t.map.legend.none}</div>
                ) : (
                  <div style={{ marginTop: 4 }}>
                    {plantTasks.slice(0, CARD_TASKS).map((task) => (
                      <div key={task.id} className="row small" style={{ gap: 6, marginTop: 2 }}>
                        <span className={`pin-dot-inline pin-${dueState(task, today)}`} aria-hidden />
                        <TypePill type={task.type} />
                        <span className="clamp-1">{task.title}</span>
                      </div>
                    ))}
                    {plantTasks.length > CARD_TASKS && <div className="muted small">{t.map.more(plantTasks.length - CARD_TASKS)}</div>}
                  </div>
                )}
              </div>
              <button type="button" className="icon-btn" onClick={() => setSelected(null)} aria-label={t.common.close}>
                <X size={20} aria-hidden />
              </button>
            </div>
            <Link to={`/plants/${plant.id}`} className="btn primary block" style={{ marginTop: 8 }}>
              {t.map.open}
            </Link>
          </div>
        )}
      </div>

      <div className="map-legend small" aria-label={t.map.legendTitle}>
        {LEGEND.map((state) => (
          <span key={state} className="row" style={{ gap: 6 }}>
            <span className={`pin-dot-inline pin-${state}`} aria-hidden />
            {t.map.legend[state]}
          </span>
        ))}
      </div>
      {dueStatus === "failed" && (
        <p className="row between wrap small" style={{ gap: 8 }}>
          <span className="muted">{t.map.tasksFailed}</span>
          <button type="button" className="link small" onClick={onRetryDue}>
            {t.common.retry}
          </button>
        </p>
      )}
      {locateNote && <p className="small muted">{locateNote}</p>}
      {layerNote && <p className="small muted">{layerNote}</p>}
      {missing > 0 && (
        <p className="row between wrap small" style={{ gap: 8 }}>
          <span className="muted">{t.map.missing(missing)}</span>
          <button type="button" className="link small" onClick={onShowMissing}>
            {t.map.showMissing}
          </button>
        </p>
      )}
      {!HAS_SATELLITE && <p className="muted small">{t.map.streetOnly}</p>}
    </div>
  );
}
