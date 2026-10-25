// The system back gesture closes a full-screen sheet instead of leaving the plant. A sheet is React
// state, not a route, so back used to pop the router and unmount it mid-call. The hook pushes one
// history entry when the sheet opens and listens for it being popped; while the sheet is busy (a
// paid call out, a save running) the entry is pushed again so the sheet stays and nothing is lost.
import { useEffect, useRef } from "react";

const STATE = { plantcareSheet: true };

function isSheetEntry(): boolean {
  return (window.history.state as { plantcareSheet?: boolean } | null)?.plantcareSheet === true;
}

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
    window.history.pushState(STATE, "");
    let poppedAway = false;
    const onPop = () => {
      if (isSheetEntry()) return; // another sheet's entry, or ours pushed back
      if (lockedRef.current) {
        window.history.pushState(STATE, "");
        return;
      }
      if (closeRef.current() === false) {
        window.history.pushState(STATE, "");
        return;
      }
      poppedAway = true;
    };
    window.addEventListener("popstate", onPop);
    return () => {
      window.removeEventListener("popstate", onPop);
      // Closed by its button: drop the entry so back does not need a second tap.
      if (!poppedAway && isSheetEntry()) window.history.back();
    };
  }, []);
}
