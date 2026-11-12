# Derja words on task cards — design

Date: 2026-11-12. Status: waiting for Mohamed's approval. Would be built as Phase 18 (0.18.0), on top of 0.17.1. Checked on 2026-11-12 by two reviewers (a builder's reading, the fit with the code); their findings are folded in. It extends Phases 16 and 17 (`docs/superpowers/specs/2026-11-11-derja-words-design.md`, `docs/superpowers/specs/2026-11-11-derja-profile-words-design.md`), whose rules stay as built unless this document says otherwise.

## Intent

Mohamed reads the app in English and hands work out aloud. Today's task cards are what he reads from when he tells a worker what to do or a supplier what he needs, and they are the one place the derja words do not show. He wants the word there for the things he names: the plant, the pest or disease, the product, the tool.

In Phase 17 he chose to keep task cards plain; this reopens that choice, on his request of 2026-11-12.

## What Mohamed decided (2026-11-12, in three rounds of questions)

1. Same purpose and look as elsewhere: the English text unchanged, the derja word in Arabic letters in parentheses after the term.
2. Every task card: Today's cards for work due now, the batch cards, the coming days, and the task cards on a plant's Calendar tab.
3. Both the title and the instruction.
4. No new Claude call for tasks: the cards use words the app already knows.
5. Display only: no "Derja words" card and no editing on Today. A word is corrected on a plant's tabs, the species page or a diagnosis.
6. The phone keeps the last-read words, so the cards show them without a connection.
7. Tasks the app wrote itself (a diagnosis's follow-up, his own log entries) carry the words in their title and instruction too; the notes he typed stay as written.
8. The morning notification and the shared lists stay plain.
9. A switch in Settings, per phone, on by default, turns the words off on task cards only.
10. The toasts ("Done: …") and the journal's lines of past tasks stay plain.
11. When the words cannot be read and the phone has kept none, the cards are plain, with no message.
12. 0.17.1 is committed first; this is Phase 18.
13. The same way of working as Phases 16 and 17: this design approved, a plan, built on a branch with a review at the end, nothing merged or pushed until he says so.
14. Only named things are marked on task cards: plant names, pests and diseases, products, tools. Operations (pruning, watering, mulching) are left out there. For that, Claude labels each term's kind from now on. He was told and accepted: words stored before this have no label and do not show on task cards until a refresh of the species or a new diagnosis lists the term; a correction of his shows on task cards once its term's kind is known.
15. Plant names come from the Arabic name each species already carries in its profile, wherever a task's text names the plant, at no cost.

The profile tabs and the diagnoses keep showing operations as they do now.

Everything below is the designer's call.

## Goals

1. A task card shows the derja word beside the plants, pests and diseases, products and tools its title and instruction name.
2. It costs nothing and asks nothing: no call, no button, no message.
3. It works at the farm without a connection.
4. One switch turns it off.

## Non-goals

- No words on notifications, shared lists, the CSV exports, toasts or the journal.
- No editing from a task card.
- No call to label the words already stored; they are labelled as calls list them again.
- No change to what the profile tabs and the diagnoses show, except the placement rule for quantities below.

## Anti-goals

- Arabic written into a task row. The words are placed when a card is drawn; `tasks.title` and `tasks.instruction` stay English, so the digest, the shared lists and the exports cannot carry any.
- An operation word on a task card.
- A read under the anon key: without a session Today reads nothing and uses what the phone kept.
- A slower Today: the words must not delay the list or add a visible pause.

## Constraints

- No SQL step.
- Structured output: every property required, `additionalProperties: false`. Both term lists (diagnose, derja) gain one required property.
- A stored list, an app-wide entry and a correction written before this phase have no kind and must still be read.
- `prompts/system-context.md` stays byte for byte.
- Strings in `en.ts` and `fr.ts`; the guide, the Settings phase card, `docs/DECISIONS.md` and `CLAUDE.md` in the same commit.
- No component test harness exists (vitest runs in node): what can be a pure rule is one, and is tested; the screens are checked in the browser.

## How it works

### A kind for every term

- `DerjaKind` is one of `plant`, `pest` (pests and diseases), `product` (products and inputs), `tool`, `operation`, `other`.
- The item of `terms` in `prompts/diagnose.schema.json` and `prompts/derja.schema.json` gains a required `kind` with those six values. Both prompts say what each kind is, with examples from the farm, and that a companion or any other plant named is `plant`.
- `DerjaTerm`, `AppWord` and `Correction` gain `kind?`. Every reader and writer carries it: `cleanTerms`, `readWords` and `readCorrections` keep a valid kind and drop an invalid one (never the entry); `withCorrection` and `saveCorrection` take a kind and keep the stored one when the row's is unknown; `DerjaWords` passes the row's kind; `speciesWordsRow`, `withoutCorrected` and `problemResult` pass it through. A list, an entry or a correction stored before this phase reads as having no kind.
- **The app-wide list remembers kinds, also for terms that have no word of Claude's.** Today reads only the corrections and the app-wide list, so that list is where a kind must be found. An entry may now have an empty word: it then carries only the kind. `withWords`, for each term a call returns with a kind:
  - an entry exists: a missing kind is filled; an empty word is filled by the call's word, unless the grower corrected the term; a word already there never changes (the first word still wins);
  - no entry: one is added, with the call's word, or with an empty word when Claude gave none or the grower corrected the term (his word never enters as Claude's).
  An entry with an empty word gives no word anywhere (`wordSources` treats it as none); it only tells the kind. So a term Mohamed corrected, or one he added a word to where Claude had none, shows on task cards as soon as any call has listed it with a kind. A changed entry is a new object, so the server's "nothing new" test (compared entry by entry) sees it; a call that only adds kinds writes once, and a repeat writes nothing.
- `WordSource` gains `kind: DerjaKind | null`: the listed term's, else the app-wide entry's, else the correction's.

### What a task card shows

- The words of a task card are the page's word sources (corrections, then app-wide words, as built in Phase 17; no species list is read for Today) of kind `plant`, `pest`, `product` or `tool`, plus the plant names below.
- A source of kind `operation`, `other` or unknown is not removed: it is passed to the placing function with its word withheld, so it still holds its place in the text. Otherwise a plant's name would be marked inside a longer term the app knows but may not show ("Scout for olive fly" must not read "olive (…) fly").
- **Plant names.** For each species among the tasks Today lists, the names of its profile give terms of kind `plant` whose word is the profile's Arabic name:
  - the English name is split on commas, semicolons, slashes and " or ", parenthesised remarks dropped; each part is a term, and a part ending in " tree", " bush", " shrub" or " vine" also gives the term without that word; a term under three letters is ignored;
  - the Arabic name is its first part before a comma (Arabic or Latin), a slash or a parenthesis, cleaned as any word (`cleanWord`; a name that is not Arabic letters gives no word, and then no term);
  - two species with one English name: the first with an Arabic name wins.
  Precedence for a term: Mohamed's correction, then the species' own Arabic name, then the app-wide word. A correction whose term is a species' English name counts as kind `plant`, and one cleared to "no word" hides the name. These terms mark any card that names the plant, whatever the task's own species ("Keep fig trees 6 m away" on an olive's card).
- This is an exception to Phase 17's "one word per term everywhere": on task cards a plant's name takes its profile's Arabic name, while a profile tab or a diagnosis that names the plant shows the app-wide word. Recorded in `docs/DECISIONS.md`; a correction makes them agree.
- Today's task rows do not carry the species' names today: `listDueTasks` alone is widened to bring `species(id, common_names)` with each plant (the CSV export's read keeps its own select). A list kept on the phone before this phase has no names and gives none.
- The texts marked: `task.title` and `task.instruction` on a task card; the shared job title and the shared instruction on a batch card; the title in the coming days. A term is marked once in each text, at its first mention. The watering round's "15 plants" line, the plant tags, the zone, the dates and the chips are not prose and carry none.
- Not marked: a task's note, the toasts, the journal lines, the kind headings, the due-task lines in the map's plant popup, and everything that leaves the screen (the handout builds its text from the stored title, so it stays plain by construction).
- On a plant's Calendar tab the task cards read as they do on Today: the corrections, the app-wide words and the plant's own species' name, filtered to the four kinds, with no second read (they come from the page's existing reading of the words). The species' fetched list is not a source for them. The profile's own list of sources is narrowed to the profile's texts, so it cannot serve the task cards, whose texts (a diagnosis's follow-up, a log entry) are not in the profile: the page's wrapper hands out a second list, narrowed over the tab's task texts, and `TaskCard` takes it as a prop. The care rules below keep the profile's words, operations included. Other species' names are not marked there (the page holds only its own species).

### Quantities keep their parentheses

When a term is directly followed by a parenthesis that holds a digit anywhere (or ½, ¼, ¾), the word is not put inside it: "savon noir (…) (30 g per litre)", "Water the olive (…) (up to 40 L)". Names carry no digit, so Phase 16's rule that the word goes inside a following parenthesis stays for them ("Black scale (… · Saissetia oleae)"). The case of a term that ends just before a closing parenthesis is unchanged. This applies everywhere the words are placed, the diagnosis and the profile included, where "savon noir (… · 30 g per litre)" read badly.

### Reading and keeping the words

- Today uses the existing hook, `useDerja`, with two new options rather than a second reader: `kept` (start from the copy kept on the phone and fall back to it, without a session too) and a reload key that Today changes on Refresh. It reads the corrections and the app-wide words in one settings query, bounded like the others, and again when another screen saves a correction (the existing change event). The read never delays the list: the cards draw with the kept words, or plain, and take the fresh ones when they arrive.
- Every good read of the words, on any screen, is kept on the phone (`localStorage`, key `plantcare.derja`: the corrections, the app-wide words, the time; written where the read succeeds, with `keep…`/`recall…` beside the weather's in `offline.ts`). So a correction saved on a species page is on the phone before the signal goes. Without a session, or when the read fails, the cards use the kept copy; with none, or one that cannot be parsed, or when `localStorage` throws, they are plain. No message either way. Screens other than Today keep their Phase 17 behaviour (no words without a session).
- The species' names travel with the task rows, so they are kept with Today's list like the rest of it.
- The page's sources are narrowed once to the terms that stand in the texts on screen (as Phase 17 does for a profile), so drawing a card costs a few matches.

### The switch

Settings gains a small card, "Derja words on task cards", On or Off, kept per phone (`localStorage`, key `plantcare.taskDerja`), on by default. Off, the task cards are plain and Today makes no derja read. It does not touch the profile tabs or the diagnoses.

### Cost

The two calls return one more short field per term: a few tokens per term, under a cent per call. Nothing else is paid.

## Risks

- Until the stored words are labelled, few terms show on task cards besides plant names; the first species refreshes and diagnoses after the deploy fill it in.
- A plant's English name can be a common word in another sense ("Bay", "Date"): its Arabic name would mark that word in an instruction. The remedies are the species' Arabic name itself (edited on the species page), a correction for that term cleared to "no word" where the app offers a line for it, or the switch.
- A plant's name can show one word on a task card (its profile's) and another on a tab or a diagnosis (the app-wide one), as said above.
- Claude may label a term loosely (a net as `product` rather than `tool`); both show, so the effect is nil. An operation labelled `other` hides as intended.

## Tests and acceptance

- Pure rules: `cleanTerms` and the kind; `withWords` storing and filling a kind without changing the word; a correction carrying its kind; `WordSource.kind` from each source; the task filter (the four kinds in, operation, other and unknown out); plant-name terms and their precedence; the quantity parenthesis, and names still merged; lists, entries and corrections stored before this phase.
- The schemas and prompts: `kind` required with its six values in both; the prompts name them.
- The kept copy: written on a good read, used without a session and after a failed read, absent gives nothing, an unexpected value in `localStorage` gives nothing.
- The switch: default on, off stored and read back.
- On the phone: (1) Today shows a plant's Arabic name on a card that names it, with no fetch made; (2) after "Refresh words" on a species, its products, tools and pests show on its task cards, and "pruning" or "watering" does not; (3) correct a product's word on the species page: the task card shows the new word when Today is opened again; (4) airplane mode, close and reopen the app: the cards still show the words; (5) the switch off: the cards are plain, the profile tabs still show their words; (6) a watering card reads "… (40 L)" with its litres untouched; (7) the morning notification, a shared list and a toast show no Arabic.

## Left to the builder

- The wording of the prompts' lines on kinds, and the strings in both languages.
- How the task cards receive their words (a context of their own, or a prop).
- The bound of Today's derja read, following the existing ones.
- Whether a French app also marks the species' French common name; the default is English names only, since task text is English.
