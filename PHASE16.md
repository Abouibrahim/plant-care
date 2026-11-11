# Phase 16 — Derja words on a diagnosis

Done when, on the deployed Vercel URL: a new diagnosis shows, after each key term, the word said in Tunisian in Arabic letters; the "Derja words" card lists them; a word corrected once shows on every diagnosis made since this phase and is given to Claude for the next ones; and no task title, notification or shared list carries Arabic.

Reference: Mohamed's request of 2026-11-11 ("how can we show all the app content in Arabic Tunisian?"), narrowed in conversation to the words he needs to say to workers and suppliers about a disease and its treatment. The design is `docs/superpowers/specs/2026-11-11-derja-words-design.md`, the plan `docs/superpowers/plans/2026-11-11-derja-words.md`; both were approved on 2026-11-11.

## Plan

- **A prompter, not a third language.** Mohamed reads the app in English. The derja word follows the English term in parentheses, "Sooty mould (…)", on the opened diagnosis only: the summary, the causes and their evidence, the checks, the treatment and the prevention. A term is marked once in each text.
- **Claude lists the words.** The diagnosis gains `terms`, up to eight `{ term, derja }`: the causes' names first, then the products, the action, a tool. The word is the one said in Cap Bon, the French name in Arabic letters when that is what people say, and empty rather than a guess.
- **The app places them** (`src/lib/derja.ts`): any case, across a plural "s" or "es", never inside a word, skipping a compound ("copper-based") or a possessive; a longer term first; inside existing parentheses with " · " where the term is followed by some.
- **The "Derja words" card**, below the treatment: each term with its word, "your word" on a corrected one, "add your word" where Claude gave none, "no word" where Mohamed cleared it. A tap opens a right-to-left field with Save, Cancel and, on a corrected term, "Use Claude's word". A word in Latin letters is refused.
- **Corrections** live in the `settings` row `derja` (at most 200), win over Claude's word wherever the term stands, and go to Claude with each new diagnosis.
- **No Arabic elsewhere.** The prompt keeps every other field in English, and titles and notes built from a cause's name are stripped of Arabic as a second guard. A diagnosis from before this phase is drawn as it was.

## Setup (Mohamed does the parts marked ★)

- [ ] ★ An Arabic keyboard on the phone: Gboard → Settings → Languages → Add keyboard → Arabic. The globe key switches; ڨ ڥ پ are under a long press on ق ف ب. Without it a correction cannot be typed.
- [ ] ★ After the deploy, tap "Reload" on the update banner (or close and reopen the installed app).
- [x] Nothing else: no SQL, no key, no setting.

## Build

- [x] `src/lib/derja.ts` and `src/types.ts` (`DerjaTerm`, `Correction`, `Diagnosis.terms`); `tests/derja.test.ts`.
- [x] `src/lib/diagnosis.ts`: `problemResult` keeps `terms`, `shortCause` strips Arabic; `tests/diagnosis.test.ts`.
- [x] `prompts/diagnose.schema.json`, `prompts/diagnose.md`, `api/diagnose.ts` (the corrections block); `tests/diagnose.test.ts`.
- [x] `src/lib/db.ts`: `loadCorrections`, `saveCorrection`, `removeCorrection`; `tests/db.test.ts`.
- [x] `src/screens/plant/DerjaText.tsx`, `DerjaWords.tsx`, `DiagnosisCard.tsx`, the strings in English and French, the styles.
- [x] Settings phase card, version 0.16.0; README, CLAUDE.md, `docs/USER-GUIDE.md` (chapters 1, 6, 10 and 15) and `docs/DECISIONS.md`.

## Acceptance tests

1. **The words on a diagnosis.** Diagnose a real problem: key terms carry a word in parentheses, and "Derja words" lists them below the treatment.
2. **Correct one.** Tap a line, type your word, Save: it changes at once in the text, and on another diagnosis made since this phase that has the same term.
3. **Clear one, and give it back.** Save a line empty: the English shows alone and the line stays, saying "no word". "Use Claude's word" brings Claude's back.
4. **Add one.** On an "add your word" line, type a word: it shows in the text.
5. **The next diagnosis.** A later diagnosis of the same problem shows the corrected word.
6. **No Arabic elsewhere.** Today, the morning notification, a shared list and the journal's lines show no Arabic letter.
7. **An older diagnosis.** One made before this phase looks as it did, with no "Derja words" card.

Only Mohamed can judge whether the words are the ones his workers say; correcting them is part of using the phase.

## Usage check

About 100 to 250 more output tokens a diagnosis (a cent or so), and the corrections list as input once there are some. No other call changes.
