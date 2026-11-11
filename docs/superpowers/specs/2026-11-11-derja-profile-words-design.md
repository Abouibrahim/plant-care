# Derja words on the species profile — design

Date: 2026-11-11. Status: waiting for Mohamed's approval. Would be built as Phase 17 (0.17.0). Checked on 2026-11-11 by two reviewers (a builder's reading, the fit with the code); their findings are folded in. It extends Phase 16 (`docs/superpowers/specs/2026-11-11-derja-words-design.md`), whose rules for cleaning a word, comparing terms and placing a word in a text stay as built (`src/lib/derja.ts`) unless this document says otherwise.

## Intent

Phase 16 gave Mohamed the Tunisian (derja) word beside the key terms of a diagnosis, so he can say it to a worker or a supplier. He wants the same on the species profile: the Needs, Calendar, Health and Guild tabs. The reason is unchanged: he reads the app in English and needs the local word for what he is about to ask someone to do, buy or look for.

## What Mohamed decided (2026-11-11, in three rounds of questions)

1. Same purpose and same look as on a diagnosis: the English text unchanged, the derja word in Arabic letters in parentheses after the term.
2. Only things he names or asks for get a word: pests and diseases, products and inputs, operations (pruning, mulching, grafting, thinning), tools, companion plants. No ratings or adjectives.
3. One list of his corrections for the whole app: a correction made anywhere applies everywhere.
4. The words show on a plant's page and on the species page in the library.
5. On a plant's page, each of the four tabs ends with its own "Derja words" card listing that tab's terms. The species page has a single card at the bottom.
6. The words stay on the tabs. Today, task cards (those on the plant's Calendar tab included), notifications and shared lists stay plain.
7. A companion plant in the Guild is a term like any other.
8. The words come from a separate, small Claude call per species that reads the stored profile and returns only the term list, kept beside the profile, not inside it. The profile is not rewritten and not reset to unconfirmed.
9. The call runs only when he taps a button ("Get derja words"). Nothing automatic, not even for a new species.
10. After an edit or a regeneration the stored words stay; a term no longer in the text shows nothing; "Refresh words" runs the call again.
11. Up to 40 terms per species: pests, products and operations first, companion plants last.
12. One word per term across the app: Claude's first word for a term is reused on every species and every diagnosis, until he corrects it.
13. The call has its own line, "Derja words", in Settings' monthly usage and in the guide's cost table.
14. A term already known (from another species, a diagnosis or his corrections) shows its word on a species he never fetched, at no cost.
15. No "fetch for all species" button.
16. The two leftovers of Phase 16's review are fixed here: a failed read of his corrections must not silently show Claude's words, and a cleaned-up task title must not keep stray punctuation.
17. Phase 17 goes through the same steps as Phase 16: this design approved, a plan, built on a branch with a review at the end, nothing merged or pushed until he says so.

He was told and accepted: because of point 12, a diagnosis he already has may change the word it shows for a term to the first word Claude gave for it elsewhere, until he corrects it.

Everything below is the designer's call.

## Goals

1. On a species whose words were fetched, the four tabs show a derja word beside each key term, and the cards list them.
2. On any species, fetched or not, a term the app already knows shows its word.
3. One term, one word, everywhere: his correction first, else the app-wide word, else the word of the call that listed it.
4. Every cost is one he chose, and is visible.

## Non-goals

- No words on tasks, Today, notifications or shared lists (a shared list is a text for a worker, a different need).
- No automatic call, no bulk call.
- No change to the profile call, its schema or the stored profile.
- No Arabic interface, no transliteration, no audio (as Phase 16).
- No words inside the editors (rule editor, pest editor, field editor): the words show on the read view only.
- No migration of the words of diagnoses made before this phase into the app-wide list.

## Anti-goals

- An invented or textbook word shown as local (as Phase 16: an empty word rather than a guess).
- A fetch that changes, rewrites or unconfirms a profile.
- Arabic reaching a task title, a note, a notification or a shared list. The care rules' titles and instructions are copied into tasks by the expansion; they are stored and copied in English only, and the words are placed when a tab is drawn.
- A read under the anon key: without a session (the offline shell) these cards make no read (CLAUDE.md, Today without a connection).

## Constraints

- No SQL step: everything new lives in `settings` rows, which the browser reads and writes under RLS and the functions read and write with the service role.
- The API conventions of CLAUDE.md apply to the new route: bearer check first, `keepAlive` before the Claude call, `reply`/`sendError`, the usage in the answer, the ledger through `onUsage`, a row written before the reply so a lost reply is found and not paid twice.
- Structured output: every property required, `additionalProperties: false`.
- `prompts/system-context.md` stays byte for byte.
- Strings in `en.ts` and `fr.ts`; the guide, the Settings phase card, `docs/DECISIONS.md` and `CLAUDE.md` in the same commit.

## How it works

### Three sources of words, one precedence

For any text the app annotates, the word of a term is, in order:

1. Mohamed's correction (the `derja` settings row, Phase 16), an empty one meaning "no word";
2. the app-wide word (new, below);
3. the word given by the call that listed the term on this page (the diagnosis's own `terms`, or the species' fetched terms).

The row's state in a card follows the source: "your word" for 1; Claude's word for 2 and 3; "add your word" when a term is listed and no source has a word; "no word" when he cleared it. "Use Claude's word" removes the correction and the term falls back to 2, then 3.

All three also act as sources for terms the page's own list does not have: a correction or an app-wide word whose term stands in a text is annotated there. That is what gives words to a species never fetched (decision 14), and it now applies to the diagnosis card too, for a diagnosis that has a `terms` list. A diagnosis made before 0.16.0 (no `terms`) stays plain, with no card and no read, as Phase 16 left it.

In code: `wordSources` takes the app-wide list as a third argument. A source's `claudeWord` is the app-wide word, else the call's word. A source that has a `claudeWord` keeps its row when cleared (state "no word") as long as its term stands in the page's texts, and offers "Use Claude's word", whether the page's own list has the term or not; this replaces Phase 16's rule that an unlisted cleared correction has no row, which still holds for a term with no Claude word behind it. The diagnosis card keeps listing every term of its own list; the profile cards list only terms that stand in their texts, so `cardRows` gains that mode and does not change for the diagnosis.

To keep drawing fast with up to 600 app-wide terms and 200 corrections, the page narrows its sources once, memoised on the profile, the fetched terms, the corrections and the app-wide list: the listed terms plus the unlisted ones that stand somewhere in the page's texts. Only that short list goes to the placing function and to the cards, and a text's pieces are memoised on the text and the sources.

### The app-wide list

- The settings row `derja:words`: an array of `{ term, word, at }`, the term in its normal form, the word cleaned and never empty, one entry per term (by `sameTerm`), at most 600; over that, the oldest go.
- Written by the server only. After a diagnosis or a species call answers, each returned term with a word, whose term has no entry yet, is added. A term that has an entry keeps it: the first word wins (decision 12). A returned term that matches one of the grower's corrections (by `sameTerm`, a cleared one included) is not added: Claude was told to use his word for it, so the word is his, not Claude's. When the corrections could not be read in that request, nothing is added.
- The write follows the usage ledger's pattern, so two calls ending together do not lose each other's terms: read the row with its `updated_at`, update only where it is unchanged, insert when the row is missing and read a duplicate key as "read again"; at most two tries inside one bound of about 8 s, after the call's own row and before the reply. Its failure never fails the paid call.
- A term evicted at the cap may later take another word; accepted, 600 is far past what a few dozen species give. The corrections' cap stays 200.
- Read by the browser with the corrections.
- It is not sent to Claude. Claude's words for known terms are simply not used when they differ.

### The species call

- Route `POST /api/derja` `{ species_id, asked_at }`, bearer-checked like the others.
- It reads the species row and builds the text from the blocks the other calls already use (`speciesBlock`, `calendarBlock`, `guildUsesBlock` in `api/_context.ts`) and its own pest lines, which add each pest's prevention text (the shared `pestLine` leaves it out and stays as it is, so the other calls' messages do not change). Claude must see every text the tabs annotate. Then come the grower's corrections as a glossary (`correctionsBlock`, whose heading takes its subject as a parameter: "this diagnosis" or "this profile") and the instruction.
- `prompts/derja.md` also says that `term` carries no Arabic letters and no transliteration, whatever the site context says about names.
- `prompts/derja.md` and `prompts/derja.schema.json`: the answer is `{ terms: [{ term, derja }] }`. The rules: up to 40 terms the grower will have to say aloud, in this order of priority: pests and diseases, products and inputs, operations, tools, companion plants; `term` copied exactly as written in the profile text; `derja` the word people in Cap Bon really say, Arabic letters only, the French name in Arabic letters when that is what people say, an empty string rather than a guess; no ratings, adjectives or general vocabulary; the grower's glossary used exactly where a term of it is listed.
- `max_tokens` 3072 at medium effort, with the existing retry at double. The builder measures the first real call and records the cost in `docs/DECISIONS.md`; the estimate given to Mohamed is 5 to 10 cents.
- The answer is stored in the settings row `derja:species:<species id>` as `{ terms, at, asked_at }` (the terms cleaned, at most 40: `cleanTerms` takes its cap as a parameter, 8 for a diagnosis, 40 here), written before the reply with a bounded upsert on `key` (a new helper beside `storeRow`, which is an insert that reads a duplicate as success and would keep an old list on a refresh). The route checks the species still exists just before writing and answers 404 without writing when it is gone. Then the app-wide list is extended, the ledger written, and the route replies `{ terms, at, asked_at, ...usage }`.
- After a normal reply the app writes the same row itself with what it received, so a failed write on the server does not lose a paid list.
- The ledger's route name is `derja`, added to `UsageRoute` and `USAGE_ROUTES`. Settings composes its line as a count and a noun, so the label is "derja word lists" ("2 derja word lists"); the guide's cost table calls the line "Derja words".
- A lost reply: the app reads the row `derja:species:<id>` and takes it when its `asked_at` equals the one it sent, by the existing recovery (`withRecovery` in `src/lib/api.ts`), with the same timings as the other routes.
- A refusal is answered as the other routes do and shown in the card; nothing is stored.

### What is annotated

On the read views only, each text below passes through the placing function with the page's sources:

- Needs: the notes and prose (site fit note, water summary, stress and overwatering signs, sun note, salinity note, climate note). Not the ratings.
- Calendar: each care rule's title and instruction. Not the task cards.
- Health: each pest's name, symptoms, organic treatment and prevention. Not the Past diagnoses list.
- Guild: the companion lists (good, bad, root warnings), the uses, the toxicity note.

A term is annotated once per text, at its first mention, exactly as on a diagnosis.

### The cards

- Plant's page: one "Derja words" card at the bottom of each of the four tabs. Its rows are the terms, from any source, that stand in that tab's texts.
- Species page: one card at the bottom, with the terms that stand anywhere in the profile.
- A fetched term that stands in no text (after an edit) has no row and places nothing.
- Each card ends with the action: "Get derja words" when the species has no fetched list, else "Refresh words" with the date of the last fetch in muted text. While the call runs the button shows the spinner and the cards of the other tabs are disabled the same way. With no row and no fetched list, the card shows one muted sentence and the button.
- The editor is Phase 16's: save, clear to "no word", "add your word", "Use Claude's word", Latin letters refused, the typed word kept on a failed save.

### One reading of the words for every card

A shared hook (suggested `useDerja(speciesId?)`), held by the screen above the tabs, replaces the diagnosis card's own load: it reads the corrections, the app-wide list and, on a profile, the species' fetched list (three settings rows in one bounded read), keeps them for the screen, is told when a card saves, and holds the state of a running fetch.

- While the species' list is unknown (the read is pending or failed), a card shows neither "Get derja words" nor "Refresh words", only the "could not be read" line: a failed read must never look like "not fetched yet" and invite a second paid call.
- On the species page the button is disabled while the page is busy (a regeneration, a delete) or an editor is open, and Regenerate, Delete and the editors are disabled while the fetch runs.

- Without a session it reads nothing.
- When the read fails or times out, the cards say so in one muted line ("Your own words could not be read; showing Claude's") and the hook reads again when the phone comes back online or the app returns to the foreground. This is the first leftover of decision 16.
- A read that resolves after a save on the screen does not overwrite the saved list (as fixed in Phase 16's review).

### The second leftover

`stripArabic` also removes the direction marks and the separators an Arabic run leaves behind ("(, el-fahma)", "( · Saissetia oleae)", "Scale ( / )", a trailing " -"), so a title or note built from a cause's name is clean.

### Housekeeping

- Deleting a species deletes its `derja:species:<id>` row: a new `deleteSetting(key)` in `db.ts`, called inside `deleteSpeciesIfUnused` once the species row is gone, best effort (a failure leaves an orphan row and nothing else).
- Settings → usage shows the kind `derja` as "Derja words"; the guide's cost table gains its line.

## Risks

- Claude's Cap Bon vocabulary is uneven (as Phase 16); corrections are the remedy, and only Mohamed can judge the words.
- "First word wins" can fix a poor word app-wide; one correction replaces it everywhere.
- A short, general term in the app-wide list ("oil", "cut") will be marked wherever it stands. The prompt keeps general vocabulary out; clearing a term to "no word" removes it everywhere.

## Tests and acceptance

- Pure rules: the precedence of the three sources, the states of a row, unlisted app-wide words as sources, the first-word-wins merge and its cap, `stripArabic`'s tidy cases, the rows of a tab's card (only terms that stand in that tab).
- The route: the request validation, the stored row, the lost-reply lookup by `asked_at`, the app-wide list extended and never overwritten, a failed list write that does not fail the call, the ledger kind, the refusal.
- The hook: no read without a session, the failed-read line and the re-read, a late read that does not overwrite a save.
- On the phone: (1) on a species, tap "Get derja words": the four tabs show words and each tab's card lists its terms; Settings' usage shows a "Derja words" call; (2) correct a word on one tab: it changes on the other tabs, on another species and on a diagnosis that has the term; (3) open a species never fetched: terms already known carry their word, and the card offers "Get derja words"; (4) edit a care rule's title so a term disappears: its word and its row go, nothing else changes, and the profile is still confirmed; (5) "Refresh words" runs the call again; (6) Today, the Calendar tab's task cards, the notification and a shared list show no Arabic; (7) with a plant's page open, switch to airplane mode and come back to the app: the tabs stay as they were, the re-read fails quietly with the muted line, and no error banner shows; (8) a diagnosis made before 0.16.0 still looks as it did.

## Left to the builder

- The exact wording of `prompts/derja.md` and of the strings, in English and French.
- Component structure: how the four section components and the species page's rule and pest cards receive the sources (a prop or a context).
- The timing bounds of the hook's read and of the app-wide list's write, following the existing ones.
- Whether a pest's French name is annotated as well as its English one.
