# Phase 3 — Push reminders

Done when the installed app can turn reminders on from Settings, the 06:00 cron sends one Web Push per site with the day's tasks ("Farm: 6 tasks" and the first three titles), tapping the notification opens Today, and the Today tab shows how many tasks are due today or overdue, on the deployed Vercel URL.

Reference: step 5 of the "Reminder engine" section and the Notifications decision in `CLAUDE.md`; the Phase 3 line of the build plan and the Today row of the screen table in `docs/SPEC.md`.

## Setup (Mohamed does the parts marked ★)

- [ ] ★ Add the four Web Push variables to the Vercel project `plant-care` (Settings → Environment Variables, Production and Preview), with the names from `.env.example` and the values already in `.env.local`: `VAPID_PUBLIC_KEY`, `VAPID_PRIVATE_KEY`, `VAPID_SUBJECT` (`mailto:` followed by your address) and `VITE_VAPID_PUBLIC_KEY` (the same value as the public key; the `VITE_` copy is what the browser uses to subscribe). If `.env.local` does not have them yet, generate a pair once with `npx web-push generate-vapid-keys` and put the same pair in both places.
- [ ] ★ Redeploy after adding them (Deployments → ⋯ → Redeploy, or push any commit): `VITE_VAPID_PUBLIC_KEY` is baked into the app at build time, so the deploy that ran before the variable existed cannot subscribe.
- [ ] ★ On the phone, open the installed app → Settings → Reminders → Turn on, and allow notifications when Chrome asks.
- [ ] No database change: `push_subscriptions` is already part of `supabase/schema.sql`.

## Build

- [x] `package.json`: `web-push` (and its types); version 0.3.0.
- [x] `api/push-subscribe.ts`: bearer check first (`verifyUser`, as in `api/expand.ts`); `POST { subscription }` validates the endpoint and the `p256dh` and `auth` keys and upserts into `push_subscriptions` on `endpoint`; `POST { unsubscribe: true, endpoint }` or `DELETE { endpoint }` removes the row; answers `{ ok, subscribed }`.
- [x] `api/_push.ts`: the digest. Pending tasks with `due_on <= today`, plus window tasks on the one day that is exactly `lead_days` before their `due_on` (the lead comes from the matching rule of the plant's species, found by `rule_key`); grouped by site, Farm first; title "Farm: 6 tasks", body the first three task titles with the plant tag and "+N more"; one push per subscription per site through `web-push` with the VAPID keys; a subscription that the push service answers with 404 or 410 is deleted; returns the counts.
- [x] `api/daily.ts`: keeps the `CRON_SECRET` check, runs the expansion, then the digest; answers `{ ok, today, plants, tasks_created, tasks_removed, pushes_sent, pushes_failed, subscriptions, subscriptions_dropped, digest }`. With no subscription the digest is skipped silently; with subscriptions but no VAPID variables the response carries `digest_error` instead of failing the expansion. `?dry=1` composes the digest without sending it.
- [x] Service worker: `public/push-sw.js`, pulled into the generated worker through `workbox.importScripts` in `vite.config.ts`; shows the notification from the push payload (title, body, tag per site, app icon) and on tap focuses the open app or opens `/`.
- [x] `src/lib/push.ts`: support check, current state (on, off, blocked, unsupported, key missing), `enablePush` (permission → subscribe with `VITE_VAPID_PUBLIC_KEY` → `POST /api/push-subscribe`, rolled back if the server rejects) and `disablePush` (server first, then the browser). `src/lib/api.ts`: `api.pushSubscribe`, `api.pushUnsubscribe`.
- [x] Settings screen: a "Reminders" card with the state, a Turn on / Turn off button, the reason when it cannot be turned on (blocked in Chrome, key missing, browser without push), and what the digest sends. The phase card reads Phase 3.
- [x] Today tab badge: the count of pending tasks due today or overdue (phone's date) on the Today tab in the bottom nav; refreshed on navigation, after Done / Skip / Snooze, after an expansion and when the app returns to the foreground; mirrored to the app icon through the Badging API where the phone supports it.
- [x] All new strings in `src/i18n/en.ts` (the digest text too, so the function and the app share one table); `docs/DECISIONS.md` lists the deviations; README mentions the route and the VAPID step.

## Acceptance tests

Tests 3 and 4 assume the data of 24 Oct 2026 (a mature persimmon in the backyard, a mature papaya at the farm, both with overdue window tasks); the counts shift with the day.

1. Server: `POST /api/push-subscribe` without a token → 401; `GET /api/daily` without the secret → 401.
2. Phone (installed app, after the ★ steps): Settings → Reminders reads "Off"; Turn on → Chrome asks for permission → Allow → the card reads "On" and `push_subscriptions` holds one row for the phone.
3. Server: `GET /api/daily?dry=1` with the secret → `digest` lists Farm then Backyard with their task counts and three titles each, `pushes_sent: 0`. Then `GET /api/daily` with the secret → `pushes_sent: 2` (one per site), `pushes_failed: 0`; the phone shows "Farm: N tasks" with the first three titles and a second notification "Backyard: N tasks".
4. Phone: tapping a notification opens the app on Today (if the app is already open it comes to the front on Today); the notification closes.
5. Phone: the Today tab shows a badge with the number of tasks due today or overdue; Done on one task lowers it by one; at zero the badge disappears. The app icon shows the same number when the phone supports it.
6. Phone: Settings → Reminders → Turn off → the card reads "Off" and the row is gone from `push_subscriptions`; `GET /api/daily` with the secret → `pushes_sent: 0`, `subscriptions: 0`.
7. Lead: a window task due in exactly `lead_days` days appears once in that day's digest, dated ("From 1 Nov: …"), and again from its due date on while it stays pending. A subscription the push service no longer knows (site data cleared on the phone) is removed on the next daily run and counted in `subscriptions_dropped`.

## Usage check

Phase 3 makes no Claude call; the Claude Console usage page does not move. Vercel's cron log shows one `/api/daily` run per day with the counts above.
