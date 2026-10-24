# UI refresh — icons, a living palette, a Today screen worth opening

Done when the installed app shows no emoji anywhere, reads as a garden app in light and dark mode (warm cream and deep forest grounds, leaf, sun and water colours, a serif display face for headings), and the Today screen makes the daily round quick and a little rewarding: a greeting over a garden scene that follows the time of day, today's progress, the week at a glance, one-tap Done with an undo, and a small celebration when the day is clear. Same tasks, same data, no new Claude call; nothing about weather (out of scope in `CLAUDE.md`).

Reference: the screenshot Mohamed sent (a farm app with a peach dawn header over an illustrated landscape, sage cards, a 7-day strip, a centre action button in the tab bar) and the working agreements in `CLAUDE.md` (plain and fast, large tap targets, dark mode by `prefers-color-scheme`, every string in `src/i18n/en.ts` and `fr.ts`).

## Setup

- [x] Nothing to create. Two small packages: `lucide-react` (ISC icons, tree-shaken to the ~40 used) and `@fontsource/fraunces` (one weight, latin subset, 18 KB, self-hosted so the service worker precaches it and it works offline).

## Build

- [x] **Palette and type.** New tokens in `src/styles.css`: warm cream ground and white-cream cards in light mode, near-black forest ground with sage accents in dark mode; leaf green for primary actions, sun gold and apricot for highlights, and one colour per task type (water sky blue, prune plum, feed amber, mulch soil brown, harvest gold, scout berry, propagate leaf, protect teal), each with a soft tint for tiles and pills. Pill-shaped buttons and chips, rounder cards with a soft shadow, visible focus rings. Fraunces 600 for `h1`/`h2`; body text stays on the system font (Arabic names keep the phone's Arabic font). `theme-color` per scheme in `index.html`, manifest colours in `vite.config.ts`.
- [x] **Icons in place of emojis.** `src/lib/icons.ts` maps each task type and site to its icon; `src/components/TypeIcon.tsx` draws the coloured tile. Tab bar: Today (sun), Plants (sprout), a raised round camera button in the centre (replaces the floating button that covered the last card), Species (book), Settings (gear); the active tab gets a sage pill behind its icon, the due badge stays. Icons on the actions that carry them: Back, Refresh, Done / Snooze / Skip, Take a photo / Choose from gallery, Edit, Add photo, Profile, Diagnose, search, site chips, Settings card headings.
- [x] **Today.** A hero with the date, a greeting by time of day (morning, afternoon, evening, night) and the week summary over an inline SVG garden scene (sky, sun or moon, hills, olive trees, crop rows) whose colours follow the hour. Under it a sage "Today's round" card: a ring for tasks done today against today's total, a line that changes as the round progresses, and a check-in streak (days in a row Today was opened on this phone). A 7-day strip (today + 6) with each day's task count and the icon of its main task type; tapping a day filters the list to it, tapping again shows the week. Site chips (All / Farm / Backyard with counts) remembered on the phone. Task cards: coloured type tile, type label, tag and zone, the due line with its state, the instruction; Done marks the card at once (check, small burst, a short vibration), the card folds away and a toast offers Undo for five seconds (done and skip; snooze shows the new day). The last task of the day starts a short fall of leaves. Motion is skipped under `prefers-reduced-motion`.
- [x] **Other screens.** Plants and Species lists, the Plant screen (round back button over the photo, tabs as a scrolling pill row), Capture, Settings and Login pick up the palette, the icons and the display face. The Species screen and the profile sections are left alone apart from the shared styles, because the Phase 5 calendar and pest editors are being written there.
- [x] All new strings in `en.ts` and `fr.ts`; `docs/DECISIONS.md` lists the choices; `npm run typecheck`, `npm run lint` and `npm run build` pass before each commit.

## Acceptance tests (phone, installed app)

1. No emoji in the tab bar, on the camera button or anywhere else; every icon is a line icon in the palette's colours, light and dark.
2. Light mode: cream ground, cards lighter than the ground, green primary buttons, headings in the serif face. Dark mode (phone in dark theme): forest-black ground, sage primary buttons with dark text, readable pills and badges.
3. Today in the morning shows "Good morning" over a dawn scene; open it again around 18:00 → "Good evening" and a dusk scene; after 20:00 a night scene with the moon and stars.
4. Today's round reads "0 of N done"; tap Done on a task → the card ticks, folds away, the phone buzzes briefly, the ring moves to "1 of N", a toast reads "Done: <title>" with Undo. Tap Undo → the task comes back and the ring goes back. Skip with a reason → toast with Undo. Snooze 3 days → toast "Moved to <day>", the task appears under that day in the strip.
5. Do the last task due today → a short fall of leaves, the card reads "All caught up".
6. The week strip shows today first with its count; tap a later day → only that day's tasks; tap it again → the whole week. Site chips filter by Farm or Backyard and the choice is kept after closing the app.
7. Open the app on two days running → the round card shows a 2-day streak.
8. Plant screen: round back button over the photo, scrolling tabs, the four action buttons with icons; its Calendar tab uses the same task cards. Settings cards have their icons; French still reads correctly everywhere.

## Usage check

No Claude call is added or changed.

Results: checked in the desktop browser at phone size (375 × 812) against an in-memory copy of the data layer, light and dark, English and French, on 2026-10-25: no emoji left in `src` (the only hit is the ★ in a code comment); dawn and night scenes; Done ticks the card with the burst, the row leaves, the ring and the tab badge move, the toast's Undo brings the task back and the ring with it; the last task of the day shows "All caught up" and the falling leaves; the strip filters by day; Snooze 3 days moves the task to its new day; Skip with a reason leaves with an Undo toast; the Plant screen's Calendar tab uses the new cards; the sign-in screen shows the scene. Phone checks pending.
