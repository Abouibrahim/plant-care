# Plant Care Assistant — Design Spec v0.1

As of 2026-10-23 · Mohamed Farhat · borgdanet / backyard

## Goal and scope

A phone-first web app for one user: photograph a plant at the backyard or at borgdanet, get a named plant record with a care profile written for Cap Bon conditions, and receive reminders for the actions that matter (water, prune, feed, mulch, harvest, scout).

- Sites: **Backyard** (the walled garden at home) and **Farm** (borgdanet, Menzel Bouzelfa). Every record carries its site and zone, and reminders are grouped by site.
- Users: you only, one login. The model leaves room for a helper later.
- Every Claude call carries the same site context, so profiles are written for your conditions rather than for a generic garden: Mediterranean dryland, 450–550 mm of rain, little to no frost, saline well water (high chloride and nitrate), calcareous alluvial soil with good structure, high weed pressure, free-ranging chickens, organic inputs only.
- Out of scope for v1: weather feeds, shared task lists, livestock records, offline identification.

## Selected attributes

The core set agreed on 23 Oct 2026: 26 attributes in eight blocks. Claude fills the species-level blocks from the photo and the site context, you fill the plant record, and the app derives the reminders.

| Block | Attributes kept | Filled by |
| --- | --- | --- |
| A. Identification | Common name in EN, FR and Arabic; scientific name and cultivar when known; plant type and lifecycle; confidence with 2–3 alternatives; food-forest layer | Claude, from the photo |
| B. Plant record | Tag and quantity; site, zone and GPS pin; dated photo timeline; planting date and source | You, pre-filled where the app can |
| C. Environment needs | Water need and seasonal rhythm (establishment vs mature, litres per watering); drought tolerance and stress signs; salinity tolerance; sun and heat tolerance | Claude, species profile |
| D. Care calendar | Pruning window and type; feeding and timing; mulching; harvest window and ripeness cues | Claude, species profile; drives reminders |
| E. Health | Pests and diseases of the species in Cap Bon with a scouting calendar; problem-photo diagnosis | Claude, profile plus on-demand call |
| F. Guild | Good companions, antagonists, root-competition warnings | Claude, species profile |
| G. Uses | Edible parts, preparation and storage; toxicity for humans, chickens, goats, dogs and cats | Claude, species profile |
| H. Reminders | Task calendar generated from D; eight reminder types; done, skip and snooze with a log; grouped by site | App |

## Data model

Four tables. A species profile is written once and shared by every plant of that species, so the second olive costs no new Claude call; a plant is one individual or a group at a site; tasks are expanded from the profile's calendar and the plant's planting date.

| Table | Fields | Type | Filled by |
| --- | --- | --- | --- |
| species | id, scientific_name, cultivar, common_names (en, fr, ar) | text, JSON | Claude; you confirm |
| species | plant_type, lifecycle, foliage (evergreen or deciduous), layer (canopy to climber) | enum | Claude |
| species | water: need (low, medium, high), establishment_schedule and mature_schedule (days between waterings per season), litres_per_watering, drought_tolerance, stress_signs | JSON | Claude |
| species | sun: exposure, heat_tolerance, summer_shade_needed | JSON | Claude |
| species | salinity_tolerance: level, note on the rain-to-well-water blend it accepts | JSON | Claude |
| species | care_calendar[]: type, months, frequency_days, age_condition, lead_days, instruction | JSON array | Claude; becomes the task rules |
| species | pests[]: name (en, fr), months, symptoms, organic_treatment | JSON array | Claude |
| species | companions: good[], bad[], root_warnings[] | JSON | Claude |
| species | uses: edible_parts, preparation, storage; toxicity: humans, chickens, goats, dogs_cats | JSON | Claude |
| species | generated_by (model id), generated_at, confirmed | metadata | App |
| plant | id, species_id, tag, quantity | text, integer | You |
| plant | site (backyard or farm), zone, lat, lng | enum, text, decimal | You; GPS read from the photo's EXIF in the browser before the resize strips it |
| plant | planted_on, source (nursery, seed, cutting, graft, existing), rootstock | date, enum, text | You |
| photo | id, plant_id, taken_at, storage_path, kind (identify, journal, problem), ai_result | metadata, JSON | App |
| task | id, plant_id, type (water, prune, feed, mulch, harvest, scout, propagate, protect), due_on, window_end, title, instruction | enum, date, text | App, from the rules |
| task | status (pending, done, skipped, snoozed), rule_key, acted_at, note | enum, text | You, one tap; App |

The species row is also the JSON schema sent to Claude: what the profile call returns is stored as it comes, after your review.

## Identification pipeline on the Claude API

Flow: photo on the phone → resize in the browser (max 1,280 px, JPEG) → identify (Claude: photo + site context) → 1 to 3 candidates with names, confidence and evidence → you confirm or correct (second photo if confidence is low) → profile already saved? no → write profile (Claude, once per species, cached); yes → skip → review and save (plant + species profile) → expand tasks from the calendar rules.

The identify call runs for every photo; the profile call runs only when the confirmed species is new to your library. Both use `claude-sonnet-5-5` with structured outputs, so the app receives JSON that already matches the schema.

| Call | Model | Input | Output (schema) | When |
| --- | --- | --- | --- | --- |
| identify | claude-sonnet-5-5 | photo, site context, identification rules | candidates[] with scientific_name, common_names (en, fr, ar), confidence 0–1, evidence; plant_type; layer | every new photo |
| profile | claude-sonnet-5-5 | confirmed species, site context, profile rules | the species row above, all fields required | first plant of a species; on request to regenerate |
| diagnose | claude-sonnet-5-5 | problem photo, species, plant age, site, last 30 days of tasks | likely_causes[] with likelihood, checks_to_do, organic_treatment, urgency, rephotograph_in_days | when you tap Diagnose on a plant |

- The site context and rules (about 1,500 tokens) are one shared system prompt marked for prompt caching; repeat calls read it at 5% of the input price.
- Schemas mark every field required with `additionalProperties: false` and enums for type, layer and toxicity levels: structured outputs reorder optional fields and cap them at 24, and a required field cannot be silently skipped.
- Confidence under 0.6 makes the app ask for a second photo (leaf close-up, bark, fruit or flower) and resend both, labelled Image 1 and Image 2.
- Photo preparation in the browser: read EXIF GPS first, then resize to 1,280 px on the long edge as JPEG. Claude bills images in 28 px patches, so that size costs 1,300–2,100 visual tokens and uploads in under 1 MB.
- Rules in the prompt: name the plant in English, French and Tunisian Arabic usage; never state a cultivar without visible evidence; give chill-hour needs and name low-chill varieties that suit Cap Bon; give water as litres per watering and days between, for establishment and for mature plants; rate salinity tolerance against the saline well; list pests with the months they appear in Cap Bon; organic treatments only (savon noir, neem, white oil, trunk banding, boric acid baits); always fill toxicity for chickens, goats, dogs and cats.
- A profile shows as "AI-written, confirm" until you tick it. Fields you edit are kept and never overwritten by a regeneration.

Sources: [structured outputs](https://platform.claude.com/docs/en/build-with-claude/structured-outputs), [vision](https://platform.claude.com/docs/en/build-with-claude/vision), [models overview](https://platform.claude.com/docs/en/models/overview).

## Reminder engine

Reminders are never typed per plant: a daily job expands each species' calendar rules against each plant's planting date and site, 90 days ahead, and sends one digest per morning grouped by site.

A rule (one entry of `care_calendar`) says: type, the months it applies, how often in days (watering only), which age it applies to (establishment, first 24 months, or mature), how many days of warning you want, and the instruction to show.

1. The job runs once a day at 06:00 Tunis time.
2. For every plant and every rule of its species, it computes the plant's age from planted_on and skips rules whose age condition does not match.
3. Window rules (prune, feed, mulch, harvest, scout, propagate, protect) create one task at the start of the window, with the alert sent lead_days earlier. Watering rules create one task every frequency_days inside their months.
4. A task is created only if no task with the same plant, rule_key and due_on exists, so re-running never duplicates.
5. The digest lists today's and overdue tasks per site: "Farm: 6 tasks — water 3 young trees, scout olive fly on 2 olives, mulch the pomegranate"; tapping it opens the Today screen.
6. Done writes acted_at and a line in the plant's journal; Skip records a reason; Snooze moves due_on forward by the number of days you pick.

| Type | Trigger | Example |
| --- | --- | --- |
| water | every frequency_days inside the rule's months; schedule depends on plant age | young carob, July: every 7 days, 20 litres |
| prune | start of the species' pruning window | olive, February: formative pruning, open the centre |
| feed | start of the feeding window | citrus, March and September: compost ring, no extra nitrogen while the well supplies nitrate |
| mulch | start of the mulching window | every tree, April: refresh to 10 cm before the heat |
| harvest | start of the harvest window, with ripeness cues | fig, August: pick when the neck droops |
| scout | start of each pest's months | olive, June: check for olive fly stings, hang traps |
| propagate | the species' propagation season | artichoke, October: divide offshoots |
| protect | heat waves, livestock pressure, staking | young trees, June: shade cloth on the west side |

## Screen flow

Five screens and a settings page; the app opens on Today, and the camera button is on every screen.

| Screen | Shows | Actions |
| --- | --- | --- |
| Today | Tasks due today and this week, overdue first, grouped by site (Farm, Backyard); counts in the tab badge | Done, Skip with reason, Snooze 1/3/7 days; tap a task to open its plant |
| Capture | Camera or gallery picker; the candidates with confidence and evidence; a short form (tag, quantity, site, zone, planted on, source) | Confirm a candidate, pick an alternative, or type the name; add a second photo; save |
| Plant | Header with latest photo, tag, names in EN/FR/AR and layer. Tabs: Needs (water, sun, salinity, drought), Calendar (care windows and the next tasks), Health (pests by month, Diagnose button), Guild and uses (companions, edible parts, toxicity badge), Journal (dated photos, task log, diagnoses) | Add a journal photo, edit the record, diagnose a problem, regenerate the profile |
| Plants | All plant records as cards, filtered by site, zone or species; search by tag or name | Open a plant; bulk-move a group to a zone |
| Species library | One card per species profile with the number of plants using it and its confirmation state | Confirm, edit any field, regenerate from Claude keeping your edits |
| Settings | Sites and their zones, digest time, UI language (EN or FR), export | Edit lists; export plants and tasks as CSV |

## Architecture and stack

Phone (PWA on the home screen) → Vercel (static app + API functions: identify, profile, diagnose, expand tasks, send digest; one daily job at 06:00 Tunis) → Claude API (Sonnet 5.5, JSON out) and Supabase (Postgres, photos, auth). The daily job sends a web push back to the phone. Keys live in Vercel environment variables; the phone only talks to the functions.

| Layer | Choice | Why |
| --- | --- | --- |
| App | Progressive web app, React + Vite, TypeScript; camera through the file input with capture | Installs on Android and iPhone from the browser, no app store; one codebase |
| Hosting and API | Vercel: static site, serverless functions, one cron job | Already connected to this workspace; the free tier covers one user |
| AI | Claude API, `claude-sonnet-5-5`, structured outputs, prompt caching | Strong vision for identification; JSON output needs no parsing fallback; the shared prompt is cached |
| Data and photos | Supabase: Postgres, Storage bucket for photos, Auth for the single login | One free project covers tables, files and login; alternative: Vercel Postgres + Blob |
| Notifications | Web Push (VAPID) from the digest function; fallback: a daily email | Works on an installed PWA on Android and on iOS 16.4 or later |
| Secrets | ANTHROPIC_API_KEY, SUPABASE_SERVICE_KEY, VAPID keys as Vercel environment variables | The browser never sees a key; you add them in the Vercel dashboard yourself |

## Cost estimate for the Claude API credit

About 1 cent per photo identified and 3 cents per new species profile: a first year with 150 plants, 50 species and 30 diagnoses costs under $5 at Sonnet 5.5 list prices ($2 per million input tokens, $10 per million output tokens, as of 23 Oct 2026).

| Call | Input tokens | Output tokens | Cost per call (USD) |
| --- | --- | --- | --- |
| identify (one photo at 1,280 px) | about 3,800 | about 400 | 0.012 |
| profile (text only, once per species) | about 2,500 | about 2,500 | 0.030 |
| diagnose (one photo plus context) | about 4,000 | about 600 | 0.014 |

Prompt caching lowers the shared-prompt part of each call to $0.10 per million tokens on cache hits; the Batch API is not useful here because every call is interactive. Haiku 5.5 at $0.10 per million input tokens would cut the identify call to a fraction of a cent if volume ever grows; its vision is the trade-off to test. Source: [pricing](https://platform.claude.com/docs/en/about-claude/pricing).

Vercel and Supabase stay on their free tiers at this scale.

## Build plan

Five phases, each one usable on its own; Phase 1 already lets you photograph a tree and read its profile on the phone.

1. **Capture and identify.** App shell installed on the phone; camera; the identify function; candidates with confirm or correct; plant record saved with site and zone; species profile generated, reviewed and stored.
2. **Tasks and the Today screen.** Calendar rules expanded into tasks; Today and Plants screens; Done, Skip, Snooze; the journal fills from the task log.
3. **Notifications.** Push subscription from the installed app; the 06:00 digest grouped by site; tab badge counts.
4. **Health.** Diagnose a problem photo against the plant's context; treatments logged in the journal; pest scouting reminders tuned from what you log.
5. **Polish.** French and English UI, species library editing, CSV export, settings.

What you do yourself, because keys never pass through this chat: create an API key in the Claude Console, add it to the Vercel project as `ANTHROPIC_API_KEY`, create the Supabase project and add its keys the same way, then install the app on your phone from the browser.

## Open decisions

Four of six choices were settled on 23 Oct 2026; two remain open with the defaults the design assumes in brackets.

- [x] Phone: Android.
- [x] Notification channel: Web Push, email as fallback.
- [x] Storage: Supabase.
- [ ] Identify model: Sonnet 5.5 for all three calls, or Haiku 5.5 for identify only. [Sonnet 5.5 everywhere]
- [ ] UI language from day one: English, French, or both with a toggle. [English first, French in Phase 5]
- [x] Who builds: Claude scaffolds and deploys to Mohamed's Vercel account; Mohamed adds the keys.

Live doc with the two diagrams: https://claude.ai/artifact/NPZRDm1zB1iZvwt8AztKDu
