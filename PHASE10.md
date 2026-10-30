# Phase 10 — The tables pinned to the owner, and the first items of the review

Done when the tables and the photos bucket accept the owner's account alone, whatever the sign-up setting in Supabase, with the app saying so when another account signs in; and when the first items of the review of 2026-10-30 (`docs/REVIEW-2026-10-30.md`) are in: photo thumbnails with batched signing and a cache on the phone (review 3.1 to 3.3), and the daily actions, done-all, a note on Done and the manual care log (review 4.3, 6.1, 6.2), on the deployed Vercel URL.

Reference: item 1.2 of the review. Since Phase 1 every table policy read `to authenticated using (true)`: with the anon key in the app, the data was guarded by the "Allow new users to sign up" toggle alone (the ★ check of `PHASE6.md`). The `/api` routes were already closed to the owner by `OWNER_USER_ID` (0.6.1).

## Plan

- **An `owners` table with one row**, the owner's user id, and a function `is_owner()` that every policy calls: `using (is_owner()) with check (is_owner())` on the nine tables and on the `photos` bucket. An account with no row sees empty tables and cannot write; the functions use the service role and are unaffected.
- **`owners_read`**: an account can read its own row only, which is what `is_owner()` needs and what the app asks before showing its banner.
- **The app asks `owners` once per sign-in.** When the table exists and the account has no row, a banner on every screen says so and names this file. Before the SQL is run the table does not exist, nothing is shown, and the policies are the old ones.
- **`OWNER_USER_ID` stays** for the functions: no database round trip before a Claude call. The variable and the row must name the same account.
- **The thumbnails and the daily actions** are built on their own branches and merged here; their choices are in `docs/DECISIONS.md`.

## Setup (Mohamed does the parts marked ★, in this order)

- [ ] ★ Supabase → Authentication → Sign In / Providers: "Allow new users to sign up" off (the ★ check of `PHASE6.md`). The SQL below closes the tables either way; the toggle still keeps strangers from making accounts at all.
- [ ] ★ Run this once in the Supabase SQL editor (project → SQL Editor → New query → Run), with your sign-in email in the `insert` statement. `supabase/schema.sql` has the same table, function and policies for a fresh project. Running it twice does no harm. Until it is run, the policies stay as they were.

  ```sql
  create table if not exists owners (
    user_id    uuid primary key references auth.users(id) on delete cascade,
    created_at timestamptz not null default now()
  );
  alter table owners enable row level security;
  drop policy if exists owners_read on owners;
  create policy owners_read on owners for select to authenticated using (user_id = auth.uid());

  create or replace function is_owner() returns boolean
    language sql stable
    set search_path = public
    as $$ select exists (select 1 from owners where user_id = auth.uid()) $$;

  -- Your account: the row the policies look for (the same id as OWNER_USER_ID in Vercel).
  insert into owners (user_id)
    select id from auth.users where email = 'you@example.com'
    on conflict (user_id) do nothing;

  drop policy if exists owner_all on species;
  drop policy if exists owner_all on plants;
  drop policy if exists owner_all on photos;
  drop policy if exists owner_all on tasks;
  drop policy if exists owner_all on push_subscriptions;
  drop policy if exists owner_all on settings;
  drop policy if exists owner_all on questions;
  drop policy if exists owner_all on planting_checks;
  drop policy if exists owner_all on weather_days;
  create policy owner_all on species            for all to authenticated using (is_owner()) with check (is_owner());
  create policy owner_all on plants             for all to authenticated using (is_owner()) with check (is_owner());
  create policy owner_all on photos             for all to authenticated using (is_owner()) with check (is_owner());
  create policy owner_all on tasks              for all to authenticated using (is_owner()) with check (is_owner());
  create policy owner_all on push_subscriptions for all to authenticated using (is_owner()) with check (is_owner());
  create policy owner_all on settings           for all to authenticated using (is_owner()) with check (is_owner());
  create policy owner_all on questions          for all to authenticated using (is_owner()) with check (is_owner());
  create policy owner_all on planting_checks    for all to authenticated using (is_owner()) with check (is_owner());
  create policy owner_all on weather_days       for all to authenticated using (is_owner()) with check (is_owner());

  do $$ begin
    drop policy if exists "owner photos" on storage.objects;
    create policy "owner photos" on storage.objects for all to authenticated
      using (bucket_id = 'photos' and is_owner()) with check (bucket_id = 'photos' and is_owner());
  exception
    when insufficient_privilege then raise notice 'Set the "owner photos" policy from Storage -> Policies: bucket_id = ''photos'' and is_owner()';
  end $$;

  select count(*) as owners from owners;
  ```

  The last line must say 1. If it says 0 the email did not match: fix it and run the `insert` again, or the app shows the banner and empty lists. If the run ends with the notice about "owner photos", open Storage → Policies, bucket `photos`, policy "owner photos", and set both expressions to `bucket_id = 'photos' and is_owner()`.

- [ ] ★ After the deploy, tap "Reload" on the update banner (or close and reopen the installed app) so the phone runs the 0.10.0 shell.

## Build

- [x] `owners`, `owners_read` and `is_owner()` in `supabase/schema.sql`; the nine `owner_all` policies and the bucket policy read it.
- [x] `isOwner()` in `src/lib/db.ts`; the banner in `src/components/Layout.tsx`; strings in `en.ts` and `fr.ts`; `tests/owner.test.ts`.
- [x] README step 1 and step 12, CLAUDE.md, `docs/DECISIONS.md`.
- [x] Thumbnails at upload, batched signing and the photo cache on the phone (review 3.1 to 3.3): merged from `claude/frosty-curran-62d5e8`; its choices are in `docs/DECISIONS.md`. Not tested against the real bucket: a phone test.
- [x] Done-all, the note on Done and the manual care log (review 4.3, 6.1, 6.2): merged from `claude/nifty-spence-0aeb95`; checked at phone width in both languages against the in-memory tables.
- [x] Version 0.10.0 and the Settings phase card.

## Acceptance tests (phone, installed app on 0.10.0)

1. Signed in as the owner: Today, Plants, Species and a plant's photos load as before, a Done writes, Settings shows the zone lists; no banner anywhere.
2. In Supabase → Table Editor → `owners`, delete the row. Close and reopen the app: the banner "This account is not listed as the owner…" shows on every screen, Plants and Species are empty, and a Done on Today fails with an error. Insert the row again (the `insert` statement above): everything is back after a reload.
3. Optional, to see the closed door: with sign-ups on for a minute, create a second account and sign in with it in a private window: the banner, empty lists, and `/api/identify` with its token answers 403 as before. Sign out, delete that account under Authentication → Users, and turn sign-ups off again.

## Usage check

No Claude call changes. One more small read per sign-in (`owners`, one row).
