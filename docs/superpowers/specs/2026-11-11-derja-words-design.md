# Derja words on a diagnosis — design

Date: 2026-11-11. Status: waiting for Mohamed's approval. Would be built as Phase 16 (0.16.0), after Phase 15 is committed. Checked on 2026-11-11 by three reviewers (a builder's reading, the fit with the code, the Arabic text handling); their findings are folded in below.

## Intent

Mohamed is the only reader of the app, and he reads it in English. When a diagnosis comes back he has to explain it aloud to the worker who will treat the tree or to the supplier who sells the product, and he lacks the Tunisian (derja) words for the disease and the treatment. The app should prompt him with those words, so he can say them.

It is a prompter for Mohamed, not a text for the worker, and not a third app language.

## What Mohamed decided

- Scope is the diagnosis only: the name of the disease, pest or disorder, the treatment and the product.
- Keywords only. The English text stays as it is; the derja word follows the English term in parentheses, as in "Sooty mould (الفحمة)".
- Derja is written in Arabic letters.
- When a word is not the one his workers use, he corrects it once and the app uses his word from then on.

Everything else in this document is the designer's call.

## Goals

1. A new diagnosis shows the derja word beside each key term, in the text where the term stands.
2. The word is the one said around Menzel Bouzelfa and Cap Bon. Where people use the French name pronounced in derja (mildiou, cochenille), that is the word, written in Arabic letters.
3. A correction is made in a few taps on the diagnosis itself, is remembered, shows wherever the term stands on any diagnosis made since this phase, and is given to Claude for later diagnoses.
4. Where Claude knows no local word, Mohamed can give his own in the same place.

## Non-goals

- No Arabic interface, no right-to-left layout, no `ar` strings file, no change to Settings → Language.
- No derja on tasks, Today, the digest and other notifications, the shared lists, species profiles, Ask answers or planting checks. The Past diagnoses list and the photo tile, which show a cause name and the summary, stay bare too: the words show on the opened diagnosis card only.
- No Latin-letter transliteration and no audio.
- No words on diagnoses made before this phase (a stored diagnosis without a `terms` field is drawn as today, corrections included).
- No screen listing all corrections. Each is changed where it shows.
- No handling of spelling variants (mould / mold, sulphur / sulfur): each spelling is its own term.

## Anti-goals

- An invented or textbook Arabic word shown as if it were local. When Claude knows no word people really say, it gives none.
- Arabic letters reaching task titles, notes, notifications, the shared lists or the journal's titles, which are built from the cause's name.
- A hard-coded word list in the app (CLAUDE.md: no plant facts in the app or seed data).

## Constraints

- Structured output: every schema property required, `additionalProperties: false`.
- A diagnosis is stored whole in `photos.ai_result`, by the route and by the app. `problemResult()` in `src/lib/diagnosis.ts` rebuilds a stored diagnosis field by field and drops what it does not name, and after a recovered lost reply the app writes the row again from that rebuilt object. So `problemResult()` must carry `terms` (cleaned as below), and `Diagnosis.terms` is optional in `src/types.ts`, as `spray` is, for older rows.
- The shared system prompt (`prompts/system-context.md`) stays byte for byte, so its cache holds. Its line asking for names in Arabic script with a Latin transliteration is overridden for this call by a rule in `prompts/diagnose.md`.
- No ★ SQL step: corrections live in a `settings` row, which the browser reads and writes under RLS (as `zones`) and the functions read with the service role.
- A grower-visible change: `docs/USER-GUIDE.md`, the Settings phase card and `docs/DECISIONS.md` in the same commit; new strings in `en.ts` and `fr.ts`.

## How it works

### Claude lists the words; the app places them

The diagnose schema gains one required array, `terms`, of `{ term, derja }`:

- `term`: a key term exactly as it is written somewhere in the diagnosis text: the cause's name, the product, the action (spraying, cutting out), a tool when it matters.
- `derja`: the word as said in Tunisian, Arabic letters only, short, something to say aloud. An empty string when Claude knows no word people really use; the term is still listed, so Mohamed can give his.

New rules in `prompts/diagnose.md`:

- Up to eight terms, the cause names and the products first.
- Only words people really use in Cap Bon; the French name in Arabic letters when that is what people say; an empty `derja` rather than a guess.
- Every text field is written in English (French product names as sold stay as they are). No Arabic letters and no transliteration anywhere outside `terms[].derja`, whatever the site context says about names.
- The grower's own words (below) are used exactly, and where one applies the text itself uses the grower's spelling of the English term, so that `term` is both "as in the text" and "as in the grower's list".

Claude does not write the parentheses into the text. The app adds them when it draws the card, so the stored English stays clean and a correction changes what shows without rewriting stored diagnoses.

As a second guard, the places that build a title or note from the cause's name (`shortCause` and the titles and notes made from it) strip any Arabic-script run, and the empty parentheses that leaves, before use.

### Cleaning a word

One function, used for Claude's words when a diagnosis is read and for a correction at Save: trim, Unicode NFC, remove direction marks (U+200E, U+200F, U+202A to U+202E, U+2066 to U+2069) and tatweel, collapse spaces. The result is a word when it has at least one letter of the Arabic script (`\p{Script=Arabic}` and `\p{L}`, which covers ڨ ڥ پ) and no Latin letter; otherwise it counts as empty for Claude's words, and Save refuses a correction with "Write the word in Arabic letters". An empty correction is allowed and means "no word".

### Normal form of a term

Terms are compared, and corrections keyed, in one normal form: NFC, lower case, curly apostrophes to straight, hyphens and no-break spaces to a space, spaces collapsed, trimmed. A term also matches with a trailing "s" or "es" on its last word, and the other way round ("aphid" finds "aphids", "scale insects" finds "scale insect").

### Drawing the card

A pure function (suggested: `src/lib/derja.ts`) takes a text, the diagnosis's `terms` and the corrections, and returns the pieces to draw.

- Word sources, for a diagnosis that has a `terms` field: its own list, and every correction, whether Claude listed that term or not. A correction wins over Claude's word for the same term. A term whose word is empty places nothing.
- Texts annotated: the summary, each cause's name and evidence, each check, the treatment, the prevention.
- In each text, a term is annotated once, at its first free occurrence. Longer terms are placed first; a shorter term whose first occurrence lies inside a longer term's match takes its next occurrence in that text, if any ("Spray copper hydroxide (…) …; repeat the copper (…) after rain").
- A match must not touch a letter or digit on either side, in the Unicode sense (`(?<![\p{L}\p{N}])…(?![\p{L}\p{N}])`, flags `iu`, the term escaped; `\b` is ASCII-only and must not be used). An occurrence followed by a hyphen and a letter, or by an apostrophe and a letter, is skipped ("copper-based", "the scale's").
- Placement: a space, then the word in parentheses. Two exceptions avoid doubled parentheses: when the term is directly followed by an opening parenthesis, the word goes first inside it, followed by " · " ("Black scale (النمرة · Saissetia oleae)"); when the term ends directly before a closing parenthesis, " · " and the word go before it ("copper (Bordeaux mixture · بوردو)").
- The word is drawn as `<bdi dir="rtl" lang="aeb">` with the app's existing `.arabic` class (slightly larger, isolated), never inside an ancestor with letter-spacing, upper-casing or italics.

Below Treatment, a card "Derja words" lists one row per term: every entry of the diagnosis's list (whether or not it was placed in a text), then the corrections that matched a text and are not in the list. The row's label is the term as Claude listed it (or as found in the text). Each row shows the word and its state: Claude's word, "your word", "no word" (cleared by Mohamed), or "add your word" (Claude gave none).

### Corrections

- Tapping a row opens an inline editor: a right-to-left text field with the current word (`autoCorrect="off"`, `autoCapitalize="none"`, `spellCheck={false}`), Save, Cancel, and, when the row carries a correction, "Use Claude's word", which removes the correction. Saving an empty field stores "no word"; the row stays, so a word can be put back.
- Stored in the `settings` row `derja` as an array of `{ term, word, at }`: the term in normal form, the cleaned word (empty for "no word"), the time saved. One entry per term. At most 200 entries; over that, the oldest by `at` are dropped at Save.
- The editor reads the row again just before writing, changes its one entry and writes the row, bounded in time like the app's task writes. Two phones saving within the same moment can still lose one of the two; accepted for a single user.
- `/api/diagnose` reads the row and adds to the user message "The grower's own derja words; use these exactly", newest first, an empty word given as "no local word: list it with an empty derja". A failed read sends none and the diagnosis goes ahead.
- The editor needs a connection; offline it reports the network error like other saves. No queue.

### Cost

About 100 to 250 more output tokens per diagnosis, and the corrections list as input (a few hundred tokens once grown). `max_tokens` stays 2048 with the existing retry at double; the builder raises it only if real calls show cut outputs.

## Setup Mohamed does

- ★ An Arabic keyboard on the phone (Gboard → Languages → add Arabic; the globe key switches; ڨ ڥ پ are under a long press on ق ف ب). Without it a correction cannot be typed. Nothing in the app can switch the keyboard.
- ★ Reload after the deploy. No SQL, no key.

## Risk Mohamed should know

Claude's knowledge of Cap Bon farm vocabulary is uneven: some words will be standard Arabic rather than local, and only Mohamed and his workers can tell. The corrections are the remedy, and the first weeks will need some. The acceptance test is his judgement on real diagnoses, not a check Claude can run.

## Tests and acceptance

- Unit tests for cleaning a word, the normal form and the placing function: first free occurrence, longest first, the shorter term's next occurrence, Unicode boundaries with accented terms ("huile d'été"), terms with regex characters, hyphen and possessive skipped, the plural rule, both parenthesis exceptions, a correction overriding, a correction for an unlisted term, an empty word, a diagnosis without `terms`.
- `problemResult()` keeps `terms` through a stored row and through lost-reply recovery followed by the app's save.
- The route: the corrections block in the user message, newest first, the empty-word wording, a failed settings read, `terms` in the photos row.
- The correction write: read again before writing, one entry per term, the cap, removal.
- The Arabic strip on titles: a cause carrying Arabic gives a clean task title.
- On the phone: (1) diagnose a real problem: key terms carry a word in parentheses and "Derja words" lists them; (2) correct one: it changes at once in the text, and on another diagnosis made since this phase with the same term; (3) clear one: the English shows alone and the row stays; "Use Claude's word" brings Claude's back; (4) give a word on an "add your word" row; (5) a later diagnosis of the same problem shows the corrected word; (6) Today, the notification, a shared list and the journal titles show no Arabic; (7) a diagnosis from before this phase looks as it did.

## Left to the builder

- The exact wording of the prompt rules and of the corrections block.
- Component structure and CSS of the "Derja words" card and its editor, in the app's existing style.
- The time bound and error wording of the correction write, following `db.ts`.
- French strings.
