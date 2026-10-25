# Phase 6 — Ask Claude about a plant

Done when Mohamed can open a plant on the installed app, ask Claude a question in English or French, get an answer written for that plant (its profile and care calendar, its age, the plants in its zone, its task records, its diagnoses and their treatments) with suggested next questions, carry on the conversation, and find each answered question in the plant's journal, from where the conversation reopens and goes on, on the deployed Vercel URL.

Reference: the "Ask Claude about this plant" item of the feature review of 2026-10-25 (Seedtime's chatbot, From Seed to Spoon's Growbot and PictureThis's expert chat are what users of those apps ask of them), the Claude call conventions in `CLAUDE.md`, and the Phase 4 diagnosis flow it sits beside. This phase goes beyond the five of `docs/SPEC.md`; the choices are in `docs/DECISIONS.md`.

## Setup (Mohamed does the parts marked ★, in this order)

- [ ] ★ After the deploy, tap "Reload" on the update banner (or close and reopen the installed app) so the phone runs the 0.6.0 shell.
- [ ] ★ Before the SQL below: run acceptance test 1, and the first query of test 7 (the count the anon key gets today). Both need the database as it is now.
- [ ] ★ Then run this once in the Supabase SQL editor (project → SQL Editor → New query → Run). It creates the `questions` table that keeps the answers, and rebuilds the `journal` view so it lists the questions and reads the tables with the caller's rights (`security_invoker`): until now the view ran as its owner, so the anon key that ships in the app's JavaScript could read every journal row. `supabase/schema.sql` has the same lines for a fresh project. Running it twice does no harm. Until it is run, Ask Claude still answers, and the panel says the answers are not kept.

  ```sql
  create table if not exists questions (
    id         uuid primary key default gen_random_uuid(),
    plant_id   uuid not null references plants(id) on delete cascade,
    thread_id  uuid not null,
    asked_at   timestamptz not null default now(),
    question   text not null,
    answer     jsonb not null
  );
  create index if not exists questions_plant_idx on questions (plant_id, asked_at desc);
  create index if not exists questions_thread_idx on questions (thread_id, asked_at);
  alter table questions enable row level security;
  drop policy if exists owner_all on questions;
  create policy owner_all on questions for all to authenticated using (true) with check (true);

  create or replace view journal with (security_invoker = true) as
    select plant_id, taken_at as at, 'photo'::text as kind, kind::text as subtype, note as text, storage_path as ref
      from photos
    union all
    select plant_id, acted_at as at, 'task', type::text, coalesce(nullif(note, ''), title), status::text
      from tasks where acted_at is not null
    union all
    select plant_id, asked_at as at, 'question', thread_id::text, question, id::text
      from questions;
  ```

- [ ] ★ Supabase → Authentication → Sign In / Providers: check that "Allow new users to sign up" is off. The app has one user, and every table policy trusts any signed-in user; with sign-ups on (the Supabase default), anyone holding the anon key could create an account and read the tables. This was already so before Phase 6; Ask adds one more paid route. (Since 0.6.1 the `/api` routes accept the owner only, see the next item.)
- [x] ★ Vercel → Settings → Environment Variables: `OWNER_USER_ID` = the UUID of your user under Supabase → Authentication → Users, for Production and Preview, then redeploy. Required since 0.6.1: without it every `/api` route answers 500 "Server is not configured", and with a wrong value every route answers 403. Recorded as done before the 0.6.1 deploy, but on the evening of 2026-10-25 the project had no such variable and Capture showed "OWNER_USER_ID is missing" on 0.6.2. Added that evening (Production only) and redeployed as `dpl_QYS4e5yYNB781yK1s4RFBoNsAe6v`; a dummy token now gets 401 instead of 500.
- [x] Nothing else to create: the route uses the keys already in Vercel, and each question is one Claude call.

## Build

- [x] `POST /api/ask` (`api/ask.ts`): bearer check first as on every route, then `{ plant_id, question, history? }`. The question is trimmed with its spaces collapsed and refused over 1,000 characters (the text box stops there too); `history` is the conversation so far, of which the last six exchanges are read, each answer cut at 2,000 characters. The route reads the plant with its species, the last time each kind of task was marked done (whatever the date), the tasks acted on in the last 30 days, the pending tasks due in the next 30 (overdue included), the other plants of its zone at its site (zones compared without case), and its last three diagnoses with the treatments logged for them. A list cut by its limit says so. All of it goes as one user message with the earlier exchanges and the question. Structured output against `prompts/ask.schema.json` (`answer`, `profile_note`, `follow_ups`), rules in `prompts/ask.md`, `max_tokens` 3,072 at medium effort with `callJson`'s doubled retry; a refusal comes back as `{ refusal }` like the other routes. The route writes nothing.
- [x] Shared context (`api/_context.ts`): the date line, the species block, the pests, the care calendar, companions with uses and toxicity, the profile's state (confirmed, blocks edited by hand), the plant line and the task lines. `/api/diagnose` now builds its message from the same helpers; its text is unchanged (compared byte for byte on a fixture before and after).
- [x] Ask panel (`src/screens/plant/AskPanel.tsx`): a full-screen sheet from the "Ask Claude about this plant" button on the Plant screen, like Diagnose. Three starter questions in the app language, a text box (Ctrl+Enter sends on a keyboard), the question shown as a bubble and the answer as a card with the token usage, the profile note as a warning with a link to the species profile, and the follow-up questions not yet asked as chips that fill the box without sending (each question is a paid call). Close waits while a question is out or an answer is being saved; leaving another way while Claude answers (the back gesture, the profile link) still saves the answer. A refusal is shown and not saved.
- [x] Saved answers: the app writes one `questions` row per answered exchange, with an id and a time made when the answer arrived, so "Save again" keeps the exchange in its place and cannot write it twice. `thread_id` is shared by the conversation and made in the browser at the first answer; `answer` holds the JSON and its usage. Without the table the panel shows the ★ notice instead. The `journal` view lists each question with its thread id; the Journal tab shows it with the opening lines of its answer and "Open the conversation", which reopens the panel on that thread with every exchange so far.
- [x] All new strings in `src/i18n/en.ts` and `fr.ts`; the Settings phase card reads Phase 6; version 0.6.0 in `package.json`, `package-lock.json` and `src/version.ts`; README, CLAUDE.md and `docs/DECISIONS.md` updated.

## Acceptance tests (run on the phone, installed app on 0.6.0)

1. Before the ★ SQL: Plants → any plant → "Ask Claude about this plant" → the panel shows the intro and three starter questions. Tap "What should I do for it this month?" → it fills the box → Ask → "Claude is thinking…", then the question bubble and an answer card with the usage line; the notice under it says the answers are not kept. Close → the Journal tab is unchanged.
2. After the ★ SQL: open the panel on the same plant and ask the same question → the answer names the month and draws on this plant (its age, a task due or done, the zone) rather than the species in general. No notice. Keep the panel open.
3. Tap one of the suggested next questions under that answer → it fills the box (nothing is sent) → Ask → the answer follows on from the first one. Close → Journal → two "Question" entries dated today, each with its question, the first lines of its answer and "Open the conversation".
4. Journal → "Open the conversation" on either entry → both exchanges load in order → ask a third question → it answers in the same thread; the journal shows three entries, and opening any of them shows all three.
5. Settings → Language → Français → the plant → "Demander à Claude" → the starters are in French → ask a question in French → the answer and the suggested questions are in French. English again afterwards.
6. On a plant with a diagnosis (Phase 4), ask "Is the treatment working, and what next?" → the answer refers to the diagnosis and to the treatment logged, by date.
7. In the Supabase SQL editor: `set role anon; select count(*) from journal; reset role;` Before the ★ SQL it counts every journal row; after it, 0. The app's journal still lists everything when signed in.

## Usage check

One Claude call per question: about 4,000 to 8,000 input tokens and 1,000 to 2,000 output tokens with the thinking, so about 9 to 18 cents a question at Fable 5.1 prices ($10 and $50 per million tokens), most of it output. The site context (about 800 tokens) is read from the cache only when the previous Claude call came less than five minutes before; otherwise it is written to it again. The usage line under each answer shows the uncached input and the output, so its "in" figure leaves out the cached part. Each earlier exchange sent back adds about 500 input tokens for a typical answer and up to about 900 for the longest, six at most.

Results (2026-10-25): typecheck, lint and build pass. The request validation and the context text were checked with a script on a compiled copy of `api/ask.ts` (empty, long and malformed questions and history, history cut to six and trimmed, whitespace, zone neighbours, empty sections), and the diagnose text compared unchanged. A review workflow (four reviewers, each checked by a skeptic) found 17 issues, all low or medium, all fixed: the prompt claimed the context held every record, cut lists did not say so, a late "Save again" could reorder or double an exchange, a paid answer was dropped when the panel was left mid-question, the journal lost "Open the conversation" when the answers could not be read, the goats were described as present, the ★ SQL failed on a second run, and the cost and caching notes were off. The panel was then driven in the desktop app's browser against an in-memory copy of the data with `/api/ask` mocked (nothing sent to Supabase or Claude): starters, an answer with its profile note and follow-ups, a follow-up sending one earlier exchange, the Journal entries, reopening a conversation and continuing it with two, an API error keeping the question in the box, a refusal, the missing-table notice with the journal untouched, a failed save and Save again, French, and dark mode at phone width. Tests 1 to 7 on the phone, with real Claude answers, wait for Mohamed.
