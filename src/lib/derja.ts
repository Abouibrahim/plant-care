// Derja words on a diagnosis (Phase 16): the Tunisian word shown beside a key term so the grower
// can say it to a worker or a supplier. Pure rules, shared by the card, the app's writes and
// /api/diagnose: cleaning a word, the normal form of a term, reading Claude's list and the grower's
// corrections, and placing the words in a text. No word lives here: they come from Claude and
// from the grower.
import type { AppWord, Correction, DerjaTerm, SpeciesWords } from "../types.js";

/** The settings row the grower's corrections live in. */
export const DERJA_KEY = "derja";
/** The settings row of Claude's first word for each term, app-wide (Phase 17). */
export const WORDS_KEY = "derja:words";
/** App-wide words kept; past it the oldest go. */
export const MAX_WORDS = 600;
/** Terms a species' fetched list may carry. */
export const MAX_SPECIES_TERMS = 40;
/** The settings row of a species' fetched word list. */
export function speciesWordsKey(speciesId: string): string {
  return `derja:species:${speciesId}`;
}
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

/**
 * Two normal forms name one term: equal, one is the other plus "s" or "es", or both are plurals of
 * a word in "o" ("mangos" and "mangoes"). Other plurals in "s" and "es" stay apart: "pipes" and
 * "pips", "canes" and "cans" are different words.
 */
export function sameTerm(a: string, b: string): boolean {
  if (a === b || a === `${b}s` || a === `${b}es` || b === `${a}s` || b === `${a}es`) return true;
  return (a.endsWith("oes") && b === `${a.slice(0, -2)}s`) || (b.endsWith("oes") && a === `${b.slice(0, -2)}s`);
}

/** Claude's list as stored or received: well-formed entries, the word cleaned, one per term, at most `cap` (eight for a diagnosis). */
export function cleanTerms(v: unknown, cap: number = MAX_TERMS): DerjaTerm[] {
  if (!Array.isArray(v)) return [];
  const out: DerjaTerm[] = [];
  const keys: string[] = [];
  for (const raw of v) {
    if (out.length >= cap) break;
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

const cp = (code: number) => String.fromCharCode(code);
/** The invisible direction marks and isolates, built from their code points so none sits in this file. */
const DIRECTION_MARKS = new RegExp(`[${cp(0x200e)}${cp(0x200f)}${cp(0x202a)}-${cp(0x202e)}${cp(0x2066)}-${cp(0x2069)}]`, "g");

/**
 * The marks that set a word apart in a name: comma, semicolon, colon, middle dot, slash, bar,
 * dashes. A hyphen before a digit is a minus sign ("-2 °C"), not a mark.
 */
const SET_APART = "(?:[,،;:·/|–—]|-(?!\\d))";
/**
 * An Arabic run, or runs with only marks between them ("النمرة / الفحمة"), with the marks on either
 * side (1: before, 2: after), so what stays is decided where it stood.
 */
const ARABIC_SEGMENT = new RegExp(
  `((?:\\s*${SET_APART})*)\\s*(?:${ARABIC_RUN.source})(?:\\s*(?:${SET_APART}\\s*)*(?:${ARABIC_RUN.source}))*\\s*((?:${SET_APART}\\s*)*)`,
  "gu",
);

/**
 * What stays of an Arabic run and the marks around it. At the start or the end of the text, nothing.
 * Between two words, a mark that only opened the run goes with it, and so does a pair of dashes
 * around it, which set it apart as an aside ("– … –"). Otherwise one mark stays, so two names of a
 * list never run together: a colon that opened the list ("Turn 10 leaves: …, honeydew"), else the
 * mark after the run (", … ," keeps one comma, "/ …," keeps the comma).
 */
function leftOf(segment: string, before: string, after: string, at: number, text: string): string {
  if (text.slice(0, at).trim() === "" || text.slice(at + segment.length).trim() === "") return "";
  const opening = before.replace(/\s/g, "").slice(-1);
  const closing = after.replace(/\s/g, "").slice(0, 1);
  if (closing === "" || (closing === opening && /[–—-]/.test(closing))) return " ";
  const kept = opening === ":" ? ":" : closing;
  const mark = kept === "،" ? "," : kept;
  return /[,;:]/.test(mark) ? `${mark} ` : ` ${mark} `;
}

/**
 * A text without its Arabic: for the titles and notes built from a cause's name. The marks, the
 * separators and the parentheses an Arabic run leaves behind go with it, so "Scale (… / …)" is
 * "Scale", "Sooty mould (…, el-fahma)" is "Sooty mould (el-fahma)" and "Black scale – … – on
 * twigs" is "Black scale on twigs".
 */
export function stripArabic(text: string): string {
  const bare = text.replace(DIRECTION_MARKS, "").replace(ARABIC_SEGMENT, (segment: string, before: string, after: string, at: number, whole: string) => leftOf(segment, before, after, at, whole));
  // Nothing was removed: the text is the grower's or Claude's English as written, and a minus
  // sign or a slash inside its parentheses is content, not a leftover.
  if (bare === text) return text.replace(/\s+/g, " ").trim();
  const left = bare
    .replace(/\(\s*(?:(?:[,،;·/|–—]|-(?!\d))\s*)+/g, "(")
    .replace(/(?:\s*[,،;·/|–—-])+\s*\)/g, ")")
    .replace(/\(\s*\)/g, "")
    .replace(/\(\s+/g, "(")
    .replace(/\s+\)/g, ")")
    .replace(/[\s,،;·/|–—-]+$/, "")
    .replace(/\s+([.,])/g, "$1")
    .replace(/\s+/g, " ")
    .trim();
  // A text all in Arabic leaves its punctuation ("تحقق من الأغصان." gives "."), which is no text.
  return /\p{L}/u.test(left) ? left : "";
}

const newestFirst = (a: { at: string }, b: { at: string }) => (a.at < b.at ? 1 : a.at > b.at ? -1 : 0);

/**
 * A call's terms as they are stored: the word of a term the grower corrected is dropped. Claude
 * was told to use his word for it, so what came back is his word, and kept in the page's list it
 * would pass for Claude's once he takes his correction away. With the corrections unknown (null)
 * the terms stay as they came.
 */
export function withoutCorrected(terms: DerjaTerm[], corrections: Correction[] | null): DerjaTerm[] {
  if (!corrections || corrections.length === 0) return terms;
  return terms.map((t) => (corrections.some((c) => sameTerm(c.term, normalTerm(t.term))) ? { ...t, derja: "" } : t));
}

/** The `derja:words` row as a list, in its stored order: the word cleaned and never empty, the first entry of a term kept. */
export function readWords(v: unknown): AppWord[] {
  if (!Array.isArray(v)) return [];
  const out: AppWord[] = [];
  for (const raw of v) {
    const e = raw as Partial<AppWord> | null;
    if (!e || typeof e !== "object" || typeof e.term !== "string" || typeof e.word !== "string" || typeof e.at !== "string") continue;
    const term = normalTerm(e.term);
    const word = cleanWord(e.word);
    if (term === "" || word === "" || out.some((w) => sameTerm(w.term, term))) continue;
    out.push({ term, word, at: e.at });
  }
  return out;
}

/** A species' fetched list from its settings row; null when the row holds none (an empty list is a list). */
export function readSpeciesWords(v: unknown): SpeciesWords | null {
  const e = v as Partial<SpeciesWords> | null;
  if (!e || typeof e !== "object" || !Array.isArray(e.terms) || typeof e.at !== "string" || typeof e.asked_at !== "string") return null;
  return { terms: cleanTerms(e.terms, MAX_SPECIES_TERMS), at: e.at, asked_at: e.asked_at };
}

/**
 * The app-wide list after a call: each term that came with a word joins it, unless the term is
 * there already (the first word wins) or the grower corrected it (the word is then his, which
 * Claude was told to use). Past the cap the oldest go.
 */
export function withWords(list: AppWord[], terms: DerjaTerm[], corrections: Correction[], at: string): AppWord[] {
  const next = [...list];
  for (const t of terms) {
    const term = normalTerm(t.term);
    const word = cleanWord(t.derja);
    if (term === "" || word === "") continue;
    if (corrections.some((c) => sameTerm(c.term, term)) || next.some((w) => sameTerm(w.term, term))) continue;
    next.push({ term, word, at });
  }
  if (next.length <= MAX_WORDS) return next;
  const dropped = new Set([...next].sort(newestFirst).slice(MAX_WORDS));
  return next.filter((w) => !dropped.has(w));
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

/**
 * The words of a page, from three sources in this order: the grower's correction, the app-wide
 * word (Claude's first word for the term, Phase 17), the word of the call that listed the term.
 * Listed terms come first, in their order; then the app-wide words no listed term used, then the
 * corrections still unused, each of which marks its term wherever it stands.
 */
export function wordSources(terms: DerjaTerm[], corrections: Correction[], words: AppWord[] = []): WordSource[] {
  const usedCorrections = new Set<Correction>();
  const usedWords = new Set<AppWord>();
  const pick = (key: string) => {
    const paired = corrections.filter((c) => sameTerm(c.term, key));
    for (const c of paired) usedCorrections.add(c);
    return paired[0];
  };
  const out: WordSource[] = terms.map((t) => {
    const own = normalTerm(t.term);
    const applied = pick(own);
    const app = words.filter((w) => sameTerm(w.term, own));
    for (const w of app) usedWords.add(w);
    const claudeWord = app[0]?.word || t.derja;
    if (!applied) return { key: own, label: t.term, word: claudeWord, state: claudeWord ? "claude" : "missing", claudeWord, listed: true };
    return { key: applied.term, label: t.term, word: applied.word, state: applied.word ? "yours" : "none", claudeWord, listed: true };
  });
  for (const w of words) {
    if (usedWords.has(w)) continue;
    const applied = pick(w.term);
    if (!applied) out.push({ key: w.term, label: w.term, word: w.word, state: "claude", claudeWord: w.word, listed: false });
    else out.push({ key: applied.term, label: w.term, word: applied.word, state: applied.word ? "yours" : "none", claudeWord: w.word, listed: false });
  }
  for (const c of corrections) {
    if (usedCorrections.has(c)) continue;
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

/** The forms a term's last word stands under, before an "s" or "es" more: itself, and without the plural it may carry. */
function stemsOf(last: string): string[] {
  const stems = [last];
  if (!/\p{L}$/u.test(last)) return stems;
  // "es" comes off only where English adds it (bushes, boxes, tomatoes): "bees" must not find "be".
  if (/(?:s|x|z|ch|sh|o)es$/.test(last)) stems.push(last.slice(0, -2));
  if (last.length > 2 && last.endsWith("s")) stems.push(last.slice(0, -1));
  return stems;
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
  const tail = /\p{L}$/u.test(last) ? `(?:${stemsOf(last).map(escapeWord).join("|")})(?:e?s)?` : escapeWord(last);
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

/**
 * Lower-cased the long way round, a final sigma written as a medial one, so the letters the
 * matcher's case folding pairs (ſ and s, ς and σ) are equal here too. The sigma needs its own step:
 * lower-casing writes "Σ" as "ς" or "σ" by the letters around it, which differ on the page and in a
 * term's piece.
 */
function fold(text: string): string {
  return text.toLowerCase().toUpperCase().toLowerCase().replace(/ς/g, "σ");
}

/** The words of a text as the matcher bounds them: runs of letters and digits, folded. */
function wordsOf(text: string): string[] {
  return fold(text).split(/[^\p{L}\p{N}]+/u);
}

/**
 * Whether every word of a term is among a page's words as the matcher could find it: each word but
 * the last as it is, the last at one of its forms with an "s" or "es" more or less. A term that
 * fails cannot stand in the page, and its matcher is never built.
 */
function mayStand(key: string, page: Set<string>): boolean {
  const words = normalTerm(key).split(" ");
  const last = words.pop() ?? "";
  if (!words.every((w) => wordsOf(w).every((p) => p === "" || page.has(p)))) return false;
  return stemsOf(last).some((stem) => {
    const parts = wordsOf(stem);
    const end = parts.pop() ?? "";
    return parts.every((p) => p === "" || page.has(p)) && (end === "" || page.has(end) || page.has(`${end}s`) || page.has(`${end}es`));
  });
}

/**
 * The sources a page needs: the listed ones, and the unlisted ones whose term stands in one of its
 * texts. Done once per page, so that hundreds of app-wide words are not tried on every text drawn.
 * The page's words are looked up first: building a matcher for each of 800 terms took about half a
 * second on the first page drawn, and most of them are not on the page at all.
 */
export function narrowSources(texts: string[], sources: WordSource[]): WordSource[] {
  const all = texts.join("\n");
  const page = new Set(wordsOf(all));
  return sources.filter((s) => s.listed || (mayStand(s.key, page) && occurs(all, s.key)));
}

/**
 * The rows of a card. A term with a word, or with a Claude word behind a cleared one, has a row
 * where it stands. "listed" (a diagnosis) also keeps every term of the page's own list;
 * "standing" (a profile tab) keeps a listed term only where it stands in the tab's texts.
 */
export function cardRows(texts: string[], sources: WordSource[], mode: "listed" | "standing" = "listed"): WordSource[] {
  const stands = (s: WordSource) => texts.some((text) => occurs(text, s.key));
  const worded = (s: WordSource) => s.word !== "" || s.claudeWord !== "";
  if (mode === "listed") return sources.filter((s) => s.listed || (worded(s) && stands(s)));
  return sources.filter((s) => (s.listed || worded(s)) && stands(s));
}
