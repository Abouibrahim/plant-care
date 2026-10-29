# Phase 8 — Weather for Menzel Bouzelfa

Done when the 06:00 run reads the local forecast and the last week's weather for the sites, skips the waterings a good rain has already done, warns by the 06:00 push, the morning before and on the day, of a heat wave, a sirocco, a frost or a gale with what to do, and Today shows the weather of the coming days, the alerts, the hours that suit spraying savon noir or oil when a task or a recent diagnosis asks for a spray, and what the rain skipped; and when Diagnose, Ask Claude and the planting check take the recent and coming weather into account, on the deployed Vercel URL.

Reference: the weather item of the feature review of 2026-10-25 (Planta and Greg adapt their reminders to local weather; irrigation controllers skip a run after rain; Garden Helpr warns before a heatwave or a frost). The spec and CLAUDE.md had put weather out of scope ("Store nothing about weather"); Mohamed asked for it on 2026-10-26, so that rule is lifted and the choices are in `docs/DECISIONS.md`.

## Plan

- **Source: Open-Meteo**, `https://api.open-meteo.com/v1/forecast`: free for non-commercial use, no key, CC BY 4.0 (the app credits it on Today and in Settings). One request per run gives seven past days and seven forecast days in Tunis time: daily maximum and minimum temperature, rain and its probability, wind and gusts with the dominant direction, the lowest humidity and evapotranspiration, plus hourly temperature, rain and wind for the spray windows.
- **The point:** the mean GPS position of the farm plants that carry one within 30 km of Menzel Bouzelfa, otherwise the town itself (36.683° N, 10.583° E). The backyard is nearby and shares the forecast.
- **Stored per day in a new `weather_days` table** (one row per date, rewritten on each fetch: past days with Open-Meteo's model estimate, which is not a rain gauge and can miss a local shower, coming days with the forecast) so Today, the alerts and the Claude calls read the same numbers, and the 06:00 run can tell what the rain did. One ★ SQL run.
- **Who fetches:** `/api/daily` at 06:00, first of all (a failed fetch is reported and the reminders go on as before), and a new `POST /api/weather` (owner token, no Claude) that Today calls once per session when the stored forecast is missing or more than six hours old.
- **Rain skip:** at 06:00, when the rain of the last two days, or today's rain forecast at 70 % or more, reaches the threshold (10 mm by default), the periodic waterings due today or overdue are closed as skipped with the reason ("Rain: 14 mm in the last two days"; a watering window, a water rule with no interval, is left alone), the number goes on today's weather row and into the morning push. Waterings due later keep their dates. Settings turns it off or sets the threshold (5, 10, 15 or 20 mm).
- **Alerts** for today and the next two days: heat (38 °C or more), sirocco (34 °C or more with humidity down to 25 % or less and a wind from the south, 120° to 240°), frost (2 °C or less), gale (gusts of 60 km/h or more) and heavy rain (30 mm or more). Each comes with generic advice, one text for preparing the day before and one for the day itself (water young plants deeply the evening before or early on the day, shade, stake, cover, open the basins); no plant facts are written into the app.
- **Spray windows:** the hours from 06:00 to 19:00 when it is 28 °C or cooler, the wind 15 km/h or less, the gusts 25 km/h or less, and no rain falls in that hour or the six after, joined into windows of two hours or more, for today and the next two days.
- **The morning push:** a weather notification beside the site digests whenever there is an alert for today or tomorrow, or the rain skipped waterings ("Weather: sirocco tomorrow, 41 °C").
- **Today:** a weather card under the round: today and the next three days, the rain of the last two days, the alerts with their advice, the spray windows, what the rain skipped, and the credit to Open-Meteo. Hidden until the table exists. Since 0.8.1 the spray windows show only when a pending scout, protect, prune or feed task due by tomorrow asks for a spray, or a plant's latest diagnosis from the last 14 days does (the diagnosis now answers that itself, in a `spray` field). The line names the plants, and today's windows are marked "(passed)" or "(now)" instead of dropping out (`docs/DECISIONS.md`, 2026-10-29).
- **Settings:** a Weather card: the rain skip switch and threshold, the point used and the time of the last fetch, the credit.
- **Claude:** Diagnose, Ask and the planting check get a weather block (the last seven days: rain, extremes, alert days; the next three: the forecast and alerts), so heat scorch after a sirocco or a watering question after rain is read in context.

## Setup (Mohamed does the parts marked ★, in this order)

- [ ] ★ After the deploy, tap "Reload" on the update banner (or close and reopen the installed app) so the phone runs the 0.8.1 shell.
- [ ] ★ Run this once in the Supabase SQL editor (project → SQL Editor → New query → Run). `supabase/schema.sql` has the same lines for a fresh project. Running it twice does no harm. Until it is run, the 06:00 run reports the weather as unavailable and everything else works as before.

  ```sql
  create table if not exists weather_days (
    day         date primary key,
    tmax        real,
    tmin        real,
    rain_mm     real,
    rain_prob   integer,
    wind_kmh    real,
    gust_kmh    real,
    wind_dir    integer,
    rh_min      integer,
    et0_mm      real,
    spray       jsonb not null default '[]'::jsonb,
    forecast    boolean not null default true,
    skipped     integer not null default 0,
    lat         double precision,
    lng         double precision,
    fetched_at  timestamptz not null default now()
  );
  alter table weather_days enable row level security;
  drop policy if exists owner_all on weather_days;
  create policy owner_all on weather_days for all to authenticated using (true) with check (true);
  ```

- [x] Nothing else to create: Open-Meteo needs no key.

## Build

- [x] `api/_weather.ts`: the point, the fetch, parsing, spray windows, storing, the rain decision and skip, the weather push; `src/lib/weather.ts`: the alert rules and the summaries shared by the app and the functions; `POST /api/weather`; `/api/daily` runs the fetch first, the rain skip after the expansion, and sends the weather push.
- [x] `weather_days` in `supabase/schema.sql`; `src/lib/db.ts` reads it (`WeatherUnavailable` until the SQL is run); the weather setting in `settings`.
- [x] Today's weather card; Settings' Weather card.
- [x] The weather block in the Diagnose, Ask and check messages.
- [x] Tests: parsing a real response (saved in `tests/data/`), the point, spray windows, alerts, the rain decision, the skip and its preview against the in-memory tables, the setting, the push, the weather block.
- [x] Strings in `en.ts` and `fr.ts`; Settings phase card; version 0.8.0; README, CLAUDE.md and `docs/DECISIONS.md`.

## Acceptance tests (run on the phone, installed app on 0.8.1, after the ★ SQL)

1. Open Today → after a moment the weather card shows today (maximum and minimum, rain, wind and gusts) and the next three days (maximum and minimum, rain), the rain of the last two days, and "Weather data: Open-Meteo". Compare today's figures with any weather app: within a degree or two. The "Spraying" line appears only when a pending scout, protect, prune or feed task due by tomorrow (overdue tasks and open windows included) asks for a spray (savon noir, neem, oil…), or a plant's latest diagnosis of the last two weeks does. It says which plants ("For FIG-01, OL-01") and lists today's windows with "(passed)" or "(now)" and tomorrow's (or "no calm, cool, dry window"). With no such task or diagnosis, the line is absent. Done on the task that asked for the spray takes its plant off the line, unless another of its tasks or its latest diagnosis still asks for one. Left open across the hour, the "(now)" mark moves on its own.
2. Settings → Weather shows the rain skip switch (on, 10 mm), the point used (the farm plants' GPS, or Menzel Bouzelfa) and the time of the last fetch.
3. The next morning after 06:00: the weather row of today has the time of the 06:00 fetch (Settings → Weather). If an alert applies today or tomorrow (heat, sirocco and frost are rare now; a gale, gusts of 60 km/h or more, is common in autumn and winter), a "Weather: …" notification arrives beside the site digests.
4. Rain skip, on a morning when the card's "Rain in the last two days" (Open-Meteo's model figure, which the skip uses; it can differ from a rain gauge) is 10 mm or more, or with the threshold set to 5 mm after a light rain: the waterings due that day are gone from Today, the plant's journal shows them as skipped with "Rain: … mm", and the weather card says how many were skipped.
5. Settings → Weather → turn the rain skip off → the next rainy morning, the waterings stay on Today.
6. Diagnose or Ask Claude on any plant: the answer can refer to the recent weather (ask "Has the weather been hard on it lately?").
7. Settings → Français: the weather card and the Settings card are in French.
8. Diagnose a plant with a pest that Claude treats with a spray (aphids, scale): back on Today, the "Spraying" line names that plant. Diagnose it again once it has recovered, or for a heat or water problem: its name leaves the line, unless one of its pending tasks also asks for a spray.

## Usage check

Open-Meteo: two requests a day at most from the cron and one per app session at most when the stored forecast is old, far under the free limits (10,000 a day). The weather block adds about 200 to 300 input tokens to each Diagnose, Ask or check call (more after a rainy week or with alerts), two to three tenths of a cent at Fable 5.1 prices.

Results (2026-10-26): typecheck, lint, `npm test` (107 tests, 29 of them for the weather) and build pass.

The compiled code was run on the real Open-Meteo answer for Menzel Bouzelfa: 14 days, spray windows on the next two days, no alert this week, and the Claude block reading as intended. That answer is saved in `tests/data/` and parsed by the tests.

A review workflow (four reviewers, each checked by a skeptic) kept 30 findings, all low or medium, all fixed:
- The rain skip could close a season-long watering window.
- The spray check read the rain one hour early.
- Today read before 06:00 kept showing the waterings the rain then skipped. A Done on one counted as done, and its Undo reopened the skipped watering.
- The card never refreshed again in a long session, and showed today's spray windows after they ended.
- Same-day alerts advised acting "the evening before".
- A failed settings read turned a disabled skip back on.
- A second run overwrote the skip count, and the dry run did not preview the skip.
- The Claude block hid how old the forecast was.
- Rounded figures disagreed with the alert thresholds.
- Several texts called the model's past rain "measured" or promised an evening push.

The cards were then driven in the desktop app's browser at phone width, against an in-memory copy of the data with `/api/weather` mocked (nothing sent to Supabase, Claude or Open-Meteo):
- the card with a sirocco tomorrow, a frost after it, rain the two days before, spray windows and two skipped waterings;
- a stale forecast refreshed once and not again on return;
- the missing table, which hides the card and puts the notice in Settings;
- the Settings card saving the threshold and the switch;
- Done on a watering the rain had already closed;
- today's ended spray windows dropping out;
- French.

### 0.8.1 (2026-10-29): the spray line

Mohamed asked why the card always showed the spray line. It came up every day by design, and it dropped today's windows once they ended, so by late morning it read "no calm, cool, dry window". Now it shows only when a task or a diagnosis asks for a spray, names the plants, and marks today's windows "(passed)" or "(now)" (`docs/DECISIONS.md`, 2026-10-29). Diagnose returns one more field, `spray`, which adds a few output tokens.

Results (2026-10-29): typecheck, lint, `npm test` (114 tests, 38 of them for the weather) and build pass.

Three review workflows:
- The first (three reviewers, each checked by a skeptic) found that a treatment saying not to spray ("do not spray a stressed tree", "no spray is needed") still brought the line up.
- The second probed the wording rule with 178 texts and found about forty realistic misreadings each way. The rule was rebuilt on them (lists of sprays, dashes, deferrals, "won't help", limits, conditions), the tasks were narrowed to scout, protect, prune and feed, and diagnoses got their own `spray` answer. The texts are kept in `tests/data/spray-texts.json` (288, with 10 known misreadings listed in the test).
- The third wrote 80 blind texts and reviewed the change. 73 of the texts read right; the seven misses were all false positives, six of them diagnoses that their own answer now settles. The test wording here was aligned with the rule, and Today now reads the hour on the hour, so "(now)" moves while the screen stays open.

The card was driven in the desktop app's browser at phone width, against the in-memory data:
- the line naming the plants ("For POM-01, LEM-01, FIG-01 +1"), with today's windows marked passed and now;
- the line absent when nothing asks for a spray;
- a re-photograph reminder, a "do not spray" harvest note and a superseded diagnosis left out;
- an older diagnosis without the field counted by its wording;
- Done on a spray task taking its plant off;
- the mark moving at 16:00 with the screen open (the page's clock shifted);
- French ("Pour …", "(passé)", "(en cours)").

Tests 1 to 8 on the phone wait for Mohamed.
