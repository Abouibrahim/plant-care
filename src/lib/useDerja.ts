// One reading of the derja words for a screen (Phase 17): the grower's corrections, the app-wide
// words and, on a profile, the species' fetched list, with the state of a fetch under way. Every
// card of the screen draws from it, so a correction saved on one tab shows on the others at once.
import { useCallback, useEffect, useRef, useState } from "react";
import { t } from "../i18n";
import { isRefusal, type AppWord, type Correction, type SpeciesWords } from "../types";
import { api } from "./api";
import { useAuth } from "./auth-context";
import { DERJA_WRITE_MS, loadDerja, saveSpeciesWords } from "./db";
import { cleanTerms, MAX_SPECIES_TERMS } from "./derja";
import { describeError } from "./errors";
import { keepDerja, recallDerja } from "./offline";

export interface DerjaView {
  /**
   * "off": no session (the offline shell) or not wanted, and nothing was read. "failed": the read
   * failed; it is tried again when the phone is back online or the app returns to the front.
   */
  status: "off" | "loading" | "ready" | "failed";
  corrections: Correction[];
  words: AppWord[];
  /** The species' fetched list; null when it has none, and while the status is not "ready". */
  species: SpeciesWords | null;
  fetching: boolean;
  /** The last fetch's failure or refusal, in the app's words; null otherwise. */
  fetchError: string | null;
  /** A card saved or removed a correction: the list as stored. */
  saved: (list: Correction[]) => void;
  /** Runs the species call. Nothing happens without a species, during a fetch, or unless the status is "ready". */
  fetchWords: () => Promise<void>;
}

interface Read {
  /** What was asked: the species id, or "" for the corrections and the words alone. */
  key: string;
  ok: boolean;
  corrections: Correction[];
  words: AppWord[];
  species: SpeciesWords | null;
}

/** How a species call ended: its list, or what to tell the grower. */
type Outcome = { list: SpeciesWords } | { error: string };

/**
 * The species calls under way, by species. Kept outside the components: a plant's page drops its
 * profile tabs (and this hook with them) when the Journal tab is opened, and the call it started
 * goes on. A tab that comes back finds the call here and waits for it, instead of offering the
 * button again for a list that is already being paid for.
 */
const inFlight = new Map<string, Promise<Outcome>>();

function runFetch(speciesId: string): Promise<Outcome> {
  const call = (async (): Promise<Outcome> => {
    try {
      const answer = await api.derja({ species_id: speciesId, asked_at: new Date().toISOString() });
      if (isRefusal(answer)) return { error: answer.refusal };
      const list: SpeciesWords = { terms: cleanTerms(answer.terms, MAX_SPECIES_TERMS), at: answer.at, asked_at: answer.asked_at };
      // The server stored the list before replying; the app stores it again, so a list the server
      // could not write is not lost.
      await saveSpeciesWords(speciesId, list, AbortSignal.timeout(DERJA_WRITE_MS)).catch(() => undefined);
      return { list };
    } catch (err) {
      return { error: `${t.diagnose.derjaFetchFailed}: ${describeError(err)}` };
    } finally {
      inFlight.delete(speciesId);
    }
  })();
  inFlight.set(speciesId, call);
  return call;
}

/** Told to every copy of the hook when the stored words changed: a correction saved, a list fetched. */
const CHANGED = "plantcare:derja";

/**
 * `kept` (Today, Phase 18): start from the words kept on the phone and fall back to them, without
 * a session too, so the task cards have their words at the farm. `reloadKey`: a change reads again.
 */
export function useDerja({
  speciesId = null,
  enabled = true,
  kept = false,
  reloadKey = 0,
}: {
  speciesId?: string | null;
  enabled?: boolean;
  kept?: boolean;
  reloadKey?: number;
}): DerjaView {
  const { session } = useAuth();
  // Without a session a read would go out under the anon key and come back empty: none is made.
  const key = enabled && session ? (speciesId ?? "") : null;
  const [read, setRead] = useState<Read | null>(null);
  const [attempt, setAttempt] = useState(0);
  // The species whose call this copy is waiting for; a copy mounted during a call picks it up.
  const [waitingFor, setWaitingFor] = useState<string | null>(() => (speciesId && inFlight.has(speciesId) ? speciesId : null));
  const [fetchError, setFetchError] = useState<string | null>(null);
  // The list a card saved here. Its write read the row again itself, so it is newer than any read
  // of this hook that was already on its way, which must not put the older list back.
  const savedHere = useRef<Correction[] | null>(null);
  // Set while this copy tells the others of a change, so it does not answer its own news.
  const telling = useRef(false);

  // The words as last read on this phone, by any screen; read once, when the screen opens.
  const [copy] = useState(() => (kept ? recallDerja() : null));
  const fallback = kept && enabled ? copy : null;

  const current = read && read.key === key ? read : null;
  const live: DerjaView["status"] = key === null ? "off" : !current ? "loading" : current.ok ? "ready" : "failed";
  // With a kept copy the words are there whatever the read does: no line about a failure, no wait.
  const status: DerjaView["status"] = fallback && live !== "ready" ? "ready" : live;
  const fetching = speciesId !== null && waitingFor === speciesId;

  useEffect(() => {
    if (key === null) return;
    let live = true;
    const startedWith = savedHere.current;
    loadDerja(key === "" ? null : key, AbortSignal.timeout(DERJA_WRITE_MS)).then(
      (data) => {
        if (!live) return;
        const corrections = savedHere.current !== startedWith && savedHere.current ? savedHere.current : data.corrections;
        setRead({ key, ok: true, corrections, words: data.words, species: data.species });
        // Every good read, on any screen, is kept for Today's cards (Phase 18).
        keepDerja({ corrections, words: data.words, at: Date.now() });
      },
      () => {
        if (!live) return;
        // A re-read that fails after a good one keeps what the screen shows.
        setRead((prev) => (prev && prev.key === key && prev.ok ? prev : { key, ok: false, corrections: savedHere.current ?? [], words: [], species: null }));
      },
    );
    return () => {
      live = false;
    };
  }, [key, attempt, reloadKey]);

  // After a failed read, try again when the signal or the app comes back.
  useEffect(() => {
    // On the read itself, not on the status: with a kept copy a failed read still shows as ready.
    if (live !== "failed") return;
    const again = () => setAttempt((n) => n + 1);
    const onVisible = () => {
      if (document.visibilityState === "visible") again();
    };
    window.addEventListener("online", again);
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      window.removeEventListener("online", again);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, [live]);

  // Another copy of the hook changed the stored words (the diagnosis sheet over a plant's tabs,
  // or the other way round): read them again.
  useEffect(() => {
    if (key === null) return;
    const onChanged = () => {
      if (!telling.current) setAttempt((n) => n + 1);
    };
    window.addEventListener(CHANGED, onChanged);
    return () => window.removeEventListener(CHANGED, onChanged);
  }, [key]);

  const tellOthers = useCallback(() => {
    telling.current = true;
    try {
      window.dispatchEvent(new Event(CHANGED));
    } finally {
      telling.current = false;
    }
  }, []);

  const saved = useCallback(
    (list: Correction[]) => {
      savedHere.current = list;
      setRead((prev) => {
        if (prev?.ok) keepDerja({ corrections: list, words: prev.words, at: Date.now() });
        return prev ? { ...prev, corrections: list } : prev;
      });
      tellOthers();
    },
    [tellOthers],
  );

  /** What a finished call means for this copy: its list and one more read, or its failure. */
  const settle = useCallback(
    (id: string, outcome: Outcome) => {
      setWaitingFor((w) => (w === id ? null : w));
      if ("error" in outcome) {
        setFetchError(outcome.error);
        return;
      }
      setRead((prev) => (prev && prev.key === id ? { ...prev, species: outcome.list } : prev));
      // One more read brings the app-wide words the call added; the other copies read too.
      setAttempt((n) => n + 1);
      tellOthers();
    },
    [tellOthers],
  );

  // A copy mounted while a call for its species is under way waits for it.
  useEffect(() => {
    if (!speciesId || waitingFor !== speciesId) return;
    let live = true;
    // The call may have ended between this copy's first render and now: then there is nothing
    // to wait for, and one read shows the list it stored.
    const call = inFlight.get(speciesId) ?? Promise.resolve(null);
    void call.then((outcome) => {
      if (!live) return;
      if (outcome) settle(speciesId, outcome);
      else {
        setWaitingFor((w) => (w === speciesId ? null : w));
        setAttempt((n) => n + 1);
      }
    });
    return () => {
      live = false;
    };
  }, [speciesId, waitingFor, settle]);

  const fetchWords = useCallback(async () => {
    if (!speciesId || key !== speciesId || status !== "ready" || inFlight.has(speciesId)) return;
    setFetchError(null);
    // The effect above waits for the call and settles it, for this copy as for one mounted later.
    void runFetch(speciesId);
    setWaitingFor(speciesId);
  }, [speciesId, key, status]);

  return {
    status,
    corrections: current?.ok ? current.corrections : (fallback?.corrections ?? current?.corrections ?? []),
    words: current?.ok ? current.words : (fallback?.words ?? current?.words ?? []),
    species: current?.ok ? current.species : null,
    fetching,
    fetchError,
    saved,
    fetchWords,
  };
}
