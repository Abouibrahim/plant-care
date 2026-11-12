import { useMemo, type ReactNode } from "react";
import { cardRows, narrowSources, wordSources } from "../../lib/derja";
import { tabTexts, type ProfileTab } from "../../lib/profileTexts";
import { taskDerjaOn, taskSources, taskTexts } from "../../lib/taskDerja";
import { useDerja } from "../../lib/useDerja";
import type { SpeciesProfile } from "../../types";
import type { WordSource } from "../../lib/derja";
import { ProfileDerjaCard } from "./ProfileDerjaCard";
import { DerjaSources } from "./sources";

interface Props {
  speciesId: string;
  species: SpeciesProfile;
  /** The screen is busy or an editor is open: no fetch may start. */
  disabled?: boolean;
  /**
   * The profile's sections. `card(tab)` is the "Derja words" card of one tab, or of the whole
   * profile with "all"; `fetching` tells the screen to hold its own actions while Claude is asked.
   */
  children: (derja: { card: (tab: ProfileTab | "all") => ReactNode; fetching: boolean; taskWords: WordSource[] }) => ReactNode;
  /** The tasks drawn inside (a plant's Calendar tab): their cards get `taskWords`, the named things only (Phase 18). */
  tasks?: Array<{ title: string; instruction?: string | null }> | null;
}

/**
 * The derja words of a species profile (Phase 17): reads them once for the screen, gives them to
 * every DerjaText inside through the context, and hands out the cards. The profile sections drawn
 * inside show the word beside each key term; anything else inside (task cards, past diagnoses)
 * does not use DerjaText and stays plain.
 */
export function ProfileDerja({ speciesId, species, disabled = false, children, tasks = null }: Props) {
  const derja = useDerja({ speciesId });
  const texts = useMemo(() => tabTexts(species), [species]);
  const all = useMemo(() => [...texts.needs, ...texts.calendar, ...texts.health, ...texts.guild], [texts]);
  const sources = useMemo(
    () => (derja.status === "off" ? [] : narrowSources(all, wordSources(derja.species?.terms ?? [], derja.corrections, derja.words))),
    [all, derja.status, derja.species, derja.corrections, derja.words],
  );
  const card = (tab: ProfileTab | "all") => <ProfileDerjaCard rows={cardRows(tab === "all" ? all : texts[tab], sources, "standing")} derja={derja} disabled={disabled} />;
  // The task cards read as they do on Today: the corrections, the app-wide words and this plant's
  // own name, operations left out. They cannot take the profile's list above, which is narrowed to
  // the profile's texts and shows the operations; the species' fetched list is not a source here.
  const names = species.common_names;
  const taskWords = useMemo(
    () => (derja.status === "off" || !tasks || !taskDerjaOn() ? [] : narrowSources(taskTexts(tasks), taskSources(derja.corrections, derja.words, [names]))),
    [tasks, names, derja.status, derja.corrections, derja.words],
  );
  return <DerjaSources.Provider value={sources}>{children({ card, fetching: derja.fetching, taskWords })}</DerjaSources.Provider>;
}
