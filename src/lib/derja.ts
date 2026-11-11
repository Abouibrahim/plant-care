// Derja words on a diagnosis (Phase 16): the Tunisian word shown beside a key term so the grower
// can say it to a worker or a supplier. Pure rules, shared by the card, the app's writes and
// /api/diagnose: cleaning a word, the normal form of a term, reading Claude's list and the grower's
// corrections, and placing the words in a text. No word lives here: they come from Claude and
// from the grower.
import type { Correction, DerjaTerm } from "../types.js";

/** The settings row the grower's corrections live in. */
export const DERJA_KEY = "derja";
/** Terms a diagnosis may carry. */
export const MAX_TERMS = 8;
/** Corrections kept in the settings row; past it the oldest go. */
export const MAX_CORRECTIONS = 200;

const MARKS = /[\u200E\u200F\u202A-\u202E\u2066-\u2069\u0640]/g;
const ARABIC_LETTER = /(?=\p{L})\p{Script=Arabic}/u;
const LATIN_LETTER = /\p{Script=Latin}/u;
/** Arabic letters with their marks and punctuation, as a run of words. */
const ARABIC_RUN = /\p{Script=Arabic}(?:\p{Script=Arabic}|\p{M}|[\u0640\u060C\u061B\u061F\u200E\u200F])*(?:\s+\p{Script=Arabic}(?:\p{Script=Arabic}|\p{M}|[\u0640\u060C\u061B\u061F\u200E\u200F])*)*/gu;

/** The word as it is kept and drawn, or "" when it is not one: Arabic letters, no Latin letter. */
export function cleanWord(raw: string): string {
  const word = raw.normalize("NFC").replace(MARKS, "").replace(/\s+/g, " ").trim();
  return ARABIC_LETTER.test(word) && !LATIN_LETTER.test(word) ? word : "";
}

/** The form terms are compared and corrections keyed in. */
export function normalTerm(term: string): string {
  return term
    .normalize("NFC")
    .toLowerCase()
    .replace(/[’‘ʼ]/g, "'")
    .replace(/[-‐‑\xA0]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/** Two normal forms name one term: equal, or one is the other plus "s" or "es". */
export function sameTerm(a: string, b: string): boolean {
  return a === b || a === `${b}s` || a === `${b}es` || b === `${a}s` || b === `${a}es`;
}

/** Claude's list as stored or received: well-formed entries, the word cleaned, one per term, at most eight. */
export function cleanTerms(v: unknown): DerjaTerm[] {
  if (!Array.isArray(v)) return [];
  const out: DerjaTerm[] = [];
  const keys: string[] = [];
  for (const raw of v) {
    if (out.length >= MAX_TERMS) break;
    const e = raw as Partial<DerjaTerm> | null;
    if (!e || typeof e !== "object" || typeof e.term !== "string") continue;
    const term = e.term.replace(/\s+/g, " ").trim();
    const key = normalTerm(term);
    if (key === "" || keys.some((k) => sameTerm(k, key))) continue;
    keys.push(key);
    out.push({ term, derja: typeof e.derja === "string" ? cleanWord(e.derja) : "" });
  }
  return out;
}

/** The `derja` settings row as a list: newest first, one entry per term; [] for anything unexpected. */
export function readCorrections(v: unknown): Correction[] {
  if (!Array.isArray(v)) return [];
  const all: Correction[] = [];
  for (const raw of v) {
    const e = raw as Partial<Correction> | null;
    if (!e || typeof e !== "object" || typeof e.term !== "string" || typeof e.word !== "string" || typeof e.at !== "string") continue;
    const term = normalTerm(e.term);
    const word = cleanWord(e.word);
    if (term === "" || (e.word.trim() !== "" && word === "")) continue;
    all.push({ term, word, at: e.at });
  }
  all.sort((a, b) => (a.at < b.at ? 1 : a.at > b.at ? -1 : 0));
  const seen = new Set<string>();
  return all.filter((c) => (seen.has(c.term) ? false : (seen.add(c.term), true)));
}

/** A text without its Arabic: for the titles and notes built from a cause's name. */
export function stripArabic(text: string): string {
  return text
    .replace(ARABIC_RUN, "")
    .replace(/\(\s*[·\s]*\)/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

/** The list with the term's word set ("" for no word), newest first, cut to the cap. */
export function withCorrection(list: Correction[], term: string, word: string, at: string): Correction[] {
  const key = normalTerm(term);
  const next = [{ term: key, word: cleanWord(word), at }, ...list.filter((c) => c.term !== key)];
  if (next.length <= MAX_CORRECTIONS) return next;
  return [...next].sort((a, b) => (a.at < b.at ? 1 : a.at > b.at ? -1 : 0)).slice(0, MAX_CORRECTIONS);
}

/** The list without the term's entry. */
export function withoutCorrection(list: Correction[], term: string): Correction[] {
  const key = normalTerm(term);
  return list.filter((c) => c.term !== key);
}

/** claude: Claude's word; yours: the grower's; none: cleared by the grower; missing: Claude gave no word. */
export type WordState = "claude" | "yours" | "none" | "missing";

export interface WordSource {
  /** The term a correction is saved or removed under: the applied correction's own term when one applies, else the label's normal form. */
  key: string;
  /** The term as Claude listed it, or the correction's term. */
  label: string;
  /** The word to draw; "" for none. */
  word: string;
  state: WordState;
  /** Claude's own word; "" when it gave none. */
  claudeWord: string;
  /** In the diagnosis's own list. */
  listed: boolean;
}

/** Listed terms first, in their order, each with its correction applied; then the other corrections, newest first. */
export function wordSources(terms: DerjaTerm[], corrections: Correction[]): WordSource[] {
  const used = new Set<Correction>();
  const out: WordSource[] = terms.map((t) => {
    const own = normalTerm(t.term);
    const paired = corrections.filter((c) => sameTerm(c.term, own));
    for (const c of paired) used.add(c);
    const applied = paired[0];
    if (!applied) return { key: own, label: t.term, word: t.derja, state: t.derja ? "claude" : "missing", claudeWord: t.derja, listed: true };
    return { key: applied.term, label: t.term, word: applied.word, state: applied.word ? "yours" : "none", claudeWord: t.derja, listed: true };
  });
  for (const c of corrections) {
    if (used.has(c)) continue;
    out.push({ key: c.term, label: c.term, word: c.word, state: c.word ? "yours" : "none", claudeWord: "", listed: false });
  }
  return out;
}

export type Piece = { kind: "text"; text: string } | { kind: "word"; word: string; place: "paren" | "lead" | "trail" };

const patterns = new Map<string, RegExp>();
const SEPARATOR = "[\\s\\xA0\\-‐‑]+";
const APOSTROPHE = "['’‘ʼ]";

function escapeWord(word: string): string {
  return word.replace(/[.*+?^${}()|[\]\\/-]/g, "\\$&").replace(/'/g, APOSTROPHE);
}

/**
 * The matcher of a term in its normal form: any case, spaces or hyphens between its words, either
 * apostrophe, a trailing "s" or "es" more or less on the last word; never inside a word (in the
 * Unicode sense: \b is ASCII-only), nor the head of a compound or a possessive.
 */
function termPattern(key: string): RegExp {
  const cached = patterns.get(key);
  if (cached) return new RegExp(cached.source, cached.flags);
  const words = normalTerm(key).split(" ");
  const last = words[words.length - 1];
  let tail = escapeWord(last);
  if (/\p{L}$/u.test(last)) {
    const stems = [last];
    // "es" comes off only where English adds it (bushes, boxes, tomatoes): "bees" must not find "be".
    if (/(?:s|x|z|ch|sh|o)es$/.test(last)) stems.push(last.slice(0, -2));
    if (last.length > 2 && last.endsWith("s")) stems.push(last.slice(0, -1));
    tail = `(?:${stems.map(escapeWord).join("|")})(?:e?s)?`;
  }
  const body = [...words.slice(0, -1).map(escapeWord), tail].join(SEPARATOR);
  const pattern = new RegExp(`(?<![\\p{L}\\p{N}])${body}(?![\\p{L}\\p{N}])(?![-‐‑'’]\\p{L})`, "giu");
  patterns.set(key, pattern);
  return new RegExp(pattern.source, pattern.flags);
}

/** Whether a term stands in the text, by the same matching as annotate. */
export function occurs(text: string, key: string): boolean {
  return key !== "" && termPattern(key).test(text);
}

/**
 * The text cut into pieces: its own slices, in order, with a word piece after each annotated term.
 * Each term is annotated once, at its first occurrence free of a longer term's match. A word piece
 * is drawn " (word)" (paren), "word · " just after an existing "(" (lead), or " · word" just before
 * an existing ")" (trail), so parentheses never double.
 */
export function annotate(text: string, sources: WordSource[]): Piece[] {
  // A term without a word still holds its place, so a shorter term's word never lands inside it.
  const byLength = sources.filter((s) => s.key !== "").sort((a, b) => b.key.length - a.key.length);
  const taken: Array<[number, number]> = [];
  const inserts: Array<{ at: number; word: string; place: "paren" | "lead" | "trail" }> = [];
  for (const s of byLength) {
    const free = [...text.matchAll(termPattern(s.key))].filter((m) => m[0] !== "" && !taken.some(([a, b]) => m.index < b && m.index + m[0].length > a));
    // The term as written comes before its looser forms: "leaves" marks "leaves", not an earlier "Leave".
    const m = free.find((x) => normalTerm(x[0]) === s.key) ?? free[0];
    if (!m) continue;
    const end = m.index + m[0].length;
    taken.push([m.index, end]);
    if (s.word === "") continue;
    const open = /^\s*\(/.exec(text.slice(end));
    if (open) inserts.push({ at: end + open[0].length, word: s.word, place: "lead" });
    else if (text[end] === ")") inserts.push({ at: end, word: s.word, place: "trail" });
    else inserts.push({ at: end, word: s.word, place: "paren" });
  }
  if (inserts.length === 0) return [{ kind: "text", text }];
  inserts.sort((a, b) => a.at - b.at);
  const pieces: Piece[] = [];
  let from = 0;
  for (const ins of inserts) {
    if (ins.at > from) pieces.push({ kind: "text", text: text.slice(from, ins.at) });
    pieces.push({ kind: "word", word: ins.word, place: ins.place });
    from = ins.at;
  }
  if (from < text.length) pieces.push({ kind: "text", text: text.slice(from) });
  return pieces;
}

/** The rows of the card: every listed source, then the unlisted ones with a word that stand in one of the texts. */
export function cardRows(texts: string[], sources: WordSource[]): WordSource[] {
  return sources.filter((s) => s.listed || (s.word !== "" && texts.some((text) => occurs(text, s.key))));
}
