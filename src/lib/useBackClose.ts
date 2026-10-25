// The system back gesture closes a full-screen sheet instead of leaving the plant. A sheet is React
// state, not a route, so back used to pop the router and unmount it mid-call. The hook pushes one
// history entry when the sheet opens and listens for it being popped; while the sheet is busy (a
// paid call out, a save running) the entry is pushed again so the sheet stays and nothing is lost.
import { useEffect, useRef } from "react";

/** The router keeps its own fields in history.state (`idx`); the marker is added beside them. */
function sheetState(): Record<string, unknown> {
  return { ...((window.history.state as Record<string, unknown> | null) ?? {}), plantcareSheet: true };
}

function isSheetEntry(): boolean {
  return (window.history.state as { plantcareSheet?: boolean } | null)?.plantcareSheet === true;
}

/** Sheets mounted right now; a cleanup gives up the entry only when none claims it again at once. */
let mounted = 0;

/**
 * `onClose` may return false to keep the sheet open (the grower declined to lose unsaved work); the
 * history entry is then pushed back so the next back gesture asks again instead of leaving the plant.
 */
export function useBackClose(onClose: () => boolean | void, locked: boolean): void {
  const closeRef = useRef(onClose);
  const lockedRef = useRef(locked);
  useEffect(() => {
    closeRef.current = onClose;
    lockedRef.current = locked;
  });

  useEffect(() => {
    mounted += 1;
    // StrictMode mounts, cleans up and mounts again in development: the entry pushed the first time is reused.
    if (!isSheetEntry()) window.history.pushState(sheetState(), "");
    let poppedAway = false;
    const onPop = () => {
      if (isSheetEntry()) return; // another sheet's entry, or ours pushed back
      if (lockedRef.current || closeRef.current() === false) {
        window.history.pushState(sheetState(), "");
        return;
      }
      poppedAway = true;
    };
    window.addEventListener("popstate", onPop);
    return () => {
      mounted -= 1;
      window.removeEventListener("popstate", onPop);
      if (poppedAway || !isSheetEntry()) return;
      // Closed by its button: drop the entry so back does not need a second tap. Deferred, so a
      // sheet mounted again at once (StrictMode, or one sheet replacing another) keeps it instead.
      queueMicrotask(() => {
        if (mounted === 0 && isSheetEntry()) window.history.back();
      });
    };
  }, []);
}
