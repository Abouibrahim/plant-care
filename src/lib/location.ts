// "Use my location" (Phase 9): the phone's GPS, listened to for up to 20 seconds, keeping the most
// precise reading. The first fix is often a coarse one from the network and the accuracy improves as
// the satellites lock, so a single reading is not enough to place a tree; a reading made before the
// listening started (one the phone kept from earlier) never counts.

export interface Fix {
  lat: number;
  lng: number;
  /** Radius in metres within which the true position lies, at 95 % confidence. */
  accuracy: number;
  /** When the phone made the reading (ms since 1970). */
  at: number;
}

/** How long a "Use my location" listens before settling on its best reading. */
export const LOCATE_MS = 20_000;
/** A reading this precise ends the listening at once. */
export const GOOD_ENOUGH_M = 5;
/**
 * Still coarser than this when the listening ends, the phone is sharing an approximate location
 * (Chrome can give a site only that; Android's approximate grid is about 2 km). A first reading from
 * the mobile network can be hundreds of metres off while the GPS locks, so only the final one counts.
 */
export const COARSE_M = 1000;

/** The better of the best reading so far and a new one: a reading from before the start is ignored, then the smaller radius wins. */
export function betterFix(best: Fix | null, next: Fix, startedAt: number): Fix | null {
  if (next.at < startedAt || !Number.isFinite(next.accuracy) || !Number.isFinite(next.lat) || !Number.isFinite(next.lng)) return best;
  if (best === null || next.accuracy < best.accuracy) return next;
  return best;
}

export type LocateFailure = "unsupported" | "denied" | "unavailable" | "cancelled";

export class LocateError extends Error {
  constructor(readonly reason: LocateFailure) {
    super(reason);
    this.name = "LocateError";
  }
}

/**
 * Listens to the GPS and calls `onBetter` each time the best reading improves. `done` settles with
 * the best reading when the time is up or one is good enough, and fails with a LocateError when
 * location is blocked, there is no reading at all, or `cancel` is called (a closed sheet).
 */
export function locate(onBetter: (fix: Fix) => void, ms: number = LOCATE_MS): { done: Promise<Fix>; cancel: () => void } {
  let cancel = () => {};
  const done = new Promise<Fix>((resolve, reject) => {
    if (typeof navigator === "undefined" || !("geolocation" in navigator)) {
      reject(new LocateError("unsupported"));
      return;
    }
    const startedAt = Date.now();
    let best: Fix | null = null;
    let settled = false;
    let watchId: number | null = null;
    const finish = (error: LocateError | null) => {
      if (settled) return;
      settled = true;
      if (watchId !== null) navigator.geolocation.clearWatch(watchId);
      window.clearTimeout(timer);
      if (error) reject(error);
      else if (best) resolve(best);
      else reject(new LocateError("unavailable"));
    };
    const timer = window.setTimeout(() => finish(null), ms);
    cancel = () => finish(new LocateError("cancelled"));
    watchId = navigator.geolocation.watchPosition(
      (position) => {
        const next = betterFix(
          best,
          { lat: position.coords.latitude, lng: position.coords.longitude, accuracy: position.coords.accuracy, at: position.timestamp },
          // A margin for the clock of the reading against the page's: a fresh fix may be stamped a moment early.
          startedAt - 1000,
        );
        if (next === best || next === null) return;
        best = next;
        onBetter(next);
        if (next.accuracy <= GOOD_ENOUGH_M) finish(null);
      },
      (error) => {
        // A timeout restarts with each update and an unavailable fix may still come: only a refusal ends it.
        if (error.code === error.PERMISSION_DENIED) finish(new LocateError("denied"));
      },
      { enableHighAccuracy: true, maximumAge: 0, timeout: ms },
    );
  });
  return { done, cancel: () => cancel() };
}
