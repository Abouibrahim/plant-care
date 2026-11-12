// The derja words of a task card (Phase 18). A card shows the word of the things a task names: a
// plant, a pest or disease, a product, a tool. An operation ("pruning", "watering") gets none
// there. The words come from what the app already knows (the grower's corrections, Claude's first
// word for each term) and from the Arabic name each species' profile carries; no call is made.
import { cleanWord, normalTerm, sameTerm, wordSources, type WordSource } from "./derja.js";
import type { AppWord, Correction, DerjaKind, SpeciesNames } from "../types.js";

export type { SpeciesNames };

/** The kinds a task card shows the word of. */
export const TASK_KINDS: DerjaKind[] = ["plant", "pest", "product", "tool"];

const GENERIC = / (?:tree|bush|shrub|vine)$/;

/**
 * The terms a species' names give: each English name, and its form without "tree", "bush",
 * "shrub" or "vine", with the Arabic name as its word. "Fig tree, Common fig" gives "fig tree",
 * "fig" and "common fig". Names that are missing, or an Arabic name not in Arabic letters, give
 * nothing; a term another species already gave is skipped.
 */
export function plantNameTerms(names: SpeciesNames[]): Array<{ term: string; word: string }> {
  const out: Array<{ term: string; word: string }> = [];
  for (const n of names) {
    if (!n || typeof n.en !== "string" || typeof n.ar !== "string") continue;
    const word = cleanWord(n.ar.split(/[,،/(]/)[0]);
    if (word === "") continue;
    const parts = n.en
      .replace(/\([^)]*\)/g, " ")
      .split(/[,;/]|\s+or\s+/i)
      .map(normalTerm);
    for (const part of parts) {
      for (const term of [part, part.replace(GENERIC, "")]) {
        if (term.length < 3 || out.some((o) => sameTerm(o.term, term))) continue;
        out.push({ term, word });
      }
    }
  }
  return out;
}

/**
 * The words of task cards. Every term the app knows is in the list, so each holds its place in a
 * text, but only a plant, a pest, a product or a tool keeps its word: "Scout for olive fly" does
 * not read "olive (…) fly" while "olive fly" has no kind yet. For a plant's name the word is, in
 * order, the grower's correction, the Arabic name of its profile, the app-wide word.
 */
export function taskSources(corrections: Correction[], words: AppWord[], names: SpeciesNames[]): WordSource[] {
  const sources = wordSources([], corrections, words);
  const isCorrection = (s: WordSource | null): s is WordSource => s !== null && (s.state === "yours" || s.state === "none");
  const given: string[] = [];
  // One species at a time: a correction of one form of its name ("olive") holds for the others
  // ("olive tree"), so the grower corrects or clears a plant's name once.
  for (const one of names) {
    const terms = plantNameTerms([one]).filter((t) => !given.some((g) => sameTerm(g, t.term)));
    given.push(...terms.map((t) => t.term));
    const at = terms.map(({ term }) => sources.findIndex((s) => sameTerm(s.key, term) || sameTerm(normalTerm(s.label), term)));
    const own = at.map((i) => (i >= 0 ? sources[i] : null));
    const shared = own.find(isCorrection) ?? null;
    terms.forEach(({ term, word }, k) => {
      const mine = own[k];
      const from = isCorrection(mine) ? mine : shared;
      const next: WordSource = {
        key: mine?.key ?? term,
        label: mine?.label ?? term,
        word: from ? from.word : word,
        state: from ? from.state : "claude",
        claudeWord: word,
        listed: false,
        kind: "plant",
      };
      if (at[k] >= 0) sources[at[k]] = next;
      else sources.push(next);
    });
  }
  return sources.map((s) => (s.kind !== null && TASK_KINDS.includes(s.kind) ? s : { ...s, word: "" }));
}

/** The texts of a list of tasks that carry words: each title and instruction. */
export function taskTexts(tasks: Array<{ title: string; instruction?: string | null }>): string[] {
  return tasks.flatMap((t) => [t.title, t.instruction ?? ""]).filter((text) => text.trim() !== "");
}

/** The names of the species among a list of tasks, one entry per species. A list kept before 0.18.0 has none. */
export function namesOf(tasks: Array<{ plant?: { species?: { id: string; common_names: SpeciesNames | null } | null } | null }>): SpeciesNames[] {
  const seen = new Set<string>();
  const out: SpeciesNames[] = [];
  for (const task of tasks) {
    const species = task.plant?.species;
    if (!species || !species.common_names || seen.has(species.id)) continue;
    seen.add(species.id);
    out.push(species.common_names);
  }
  return out;
}

/** The switch of Settings, kept per phone: absent means on, "off" means off. */
export const TASK_DERJA_KEY = "plantcare.taskDerja";

/** Whether task cards show the words. On unless switched off; on when the phone's storage cannot be read. */
export function taskDerjaOn(): boolean {
  try {
    return localStorage.getItem(TASK_DERJA_KEY) !== "off";
  } catch {
    return true;
  }
}

/** Stores the switch; false when the phone's storage refuses. */
export function storeTaskDerja(on: boolean): boolean {
  try {
    if (on) localStorage.removeItem(TASK_DERJA_KEY);
    else localStorage.setItem(TASK_DERJA_KEY, "off");
    return true;
  } catch {
    return false;
  }
}
