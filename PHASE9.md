# Phase 9 — Farm map and tree tags

Done when the Plants screen shows the plants on a map from their saved positions, each pin coloured by what is due and a tap leading to the plant; when a plant without a position can be given one from the phone's location or by placing it on the map; and when a sheet of QR tags can be printed so that pointing the phone's camera at a tree opens its page, on the deployed Vercel URL.

Reference: item 3 of the feature review of 2026-10-25 (TreeSmith pins trees by GPS, SMIP Orchard puts a QR code on each tree). The app already reads a GPS point from each photo's EXIF, but the point was never shown, and a photo without one left the plant without a position.

## Plan

- **Map in the Plants screen.** A List / Map switch beside the search; the site chips and the search apply to both. The pins come from `plants.lat` and `plants.lng`, so no SQL is needed.
- **Pin colours.** A pin takes the most pressing state among the plant's pending tasks, with the same colours as Today: late, due today, open window, or nothing due. A group shows its count (×12). Tag names appear once zoomed in close.
- **Tapping a pin** opens a card at the foot of the map with the plant's photo, tag, species and what is due, and an Open button.
- **"Where am I"** on the map shows the phone's own position among the trees.
- **Plants without a position** are counted under the map; a tap lists them.
- **Satellite or street.** Satellite imagery when a map key is set, otherwise the OpenStreetMap street map. A switch on the map changes the layer, and the phone remembers the choice. The key is a ★ step; until it is set, the street map works on its own.
  - Since 0.9.1, TomTom: Vantor imagery to zoom 19, single trees visible around Menzel Bouzelfa, free TomTom key.
  - With an ArcGIS key alone: Esri World Imagery (0.34 m, June 2025).
- **Tiles are not stored for offline use.** The providers' terms forbid it. If the connection drops after the plants have loaded, the pins stay on a blank background; opened with no connection at all, the Plants screen has no plants to show.
- **Setting a position.** A full-screen map with a fixed crosshair: pan the map until the crosshair sits on the tree, then Save. "Use my location" listens to the phone's GPS for up to 20 seconds, keeps the most precise reading (stopping early at 5 m), and moves the map there with its accuracy circle. Under trees a phone is often 5 to 15 m off, so the satellite view is the real correction. The other plants of the site show as small dots to place against.
- **Where to set it from:**
  - the plant's page ("Position");
  - the record form's GPS line, which Capture and Edit record both use.
- **Show on map.** The plant's site line links to the map, centred on it.
- **Tree tags.** A print page lays out tags on A4, 4 × 5 at 40 × 50 mm. Each tag has a QR code (error correction Q, for dirt and scratches), the plant's tag in large letters, the species, the site and zone, and an 8-character code.
- **What the QR holds:** `https://<app>/t/<code>`. The code is the first 8 hex digits of the plant's id, so no new column is needed and the code stays small (version 5, 37 modules). The `/t/` route finds the plant and opens its page; if a code ever matched two plants, it lists both.
- **Printing tags:**
  - "Print tags" on the Plants screen prints the plants shown by the current filter and search;
  - "Tag" on the plant's page prints that one;
  - on the print page, a tap on a tag leaves it out;
  - a 50 mm bar on the sheet checks that nothing was scaled.
- **Libraries:** Leaflet 1.9.4, loaded only when a map opens (about 46 KB gzip), and lean-qr 2.7.4 (about 4 KB). The app's main bundle does not grow.
- **No Claude call, no new table, no new function.**

## Setup (Mohamed does the parts marked ★, in this order)

- [ ] ★ After the deploy, tap "Reload" on the update banner (or close and reopen the installed app) so the phone runs the 0.9.1 shell.
- [ ] ★ Optional, for the satellite view (since 0.9.1, a TomTom key):
  1. Sign up at https://my.tomtom.com. It is free and asks for no card. Do not add prepaid credit: without it, use beyond the free 200,000 tiles a month is blocked, never billed.
  2. In MyTomTom → API keys, open the starter key (or create one). Give it the Map Display API, and set its allowed domains to `plant-care-phi-fawn.vercel.app` and `localhost`.
  3. In Vercel → plant-care → Settings → Environment Variables, add `VITE_TOMTOM_API_KEY` for Production. Redeploy (the key is built into the app). Add it to `.env.local` too for local work.
  4. Nothing to renew: the key does not expire. TomTom ends the free agreement after 90 days without use, which using the map prevents.

  The key travels inside the app's code, which is how map tile keys work. The domain lock keeps other sites from using it; at worst a leaked key uses up the month's free tiles. If the map falls back to the street map ("The satellite view did not load") right after you set the domains, write them as `https://plant-care-phi-fawn.vercel.app` instead, or clear the list.

  An ArcGIS Location Platform key still works instead (`VITE_ARCGIS_API_KEY`, Basemaps privilege, referrers set to the app's address): it is used when the TomTom key is blank.
- [x] Nothing else: no SQL.

## Build

- [x] `src/lib/map.ts`: pin state per plant, tag codes and links, map centre and bounds, tile sources and attribution (pure, tested); `src/lib/location.ts`: the best-of GPS reading.
- [x] The map (Leaflet in a lazy chunk): the Plants map view, the pin card, "Where am I", the satellite / street switch.
- [x] The position sheet, from the plant's page and the record form; "Show on map" from the plant's page.
- [x] The tags page and its print layout; the `/t/:code` route; "Print tags" and "Tag" entries.
- [x] Strings in `en.ts` and `fr.ts`; Settings phase card; version 0.9.0; README, CLAUDE.md, `.env.example` and `docs/DECISIONS.md`.
- [x] 0.9.1: satellite tiles from TomTom, with Esri kept for an ArcGIS key alone.

## Acceptance tests (run on the phone, installed app on 0.9.1)

1. Plants → Map: the plants with a position show as pins over the street map (or satellite after the ★ key). The farm and backyard chips frame each site. A late watering shows a red pin, a plant with nothing due a plain one. Under the map: "N plants have no position yet".
2. Tap a pin: a card shows the plant, its photo and what is due; Open goes to its page. Back returns to the map.
3. At the farm, "Where am I" shows a dot with its accuracy circle near where you stand.
4. On a plant with no position → Position → Use my location: within 20 seconds the map centres on you with the accuracy (for example ±6 m). Pan until the crosshair sits on the tree's canopy (satellite) → Save. The plant now has a pin, and Plants → Map shows it.
5. Capture a new plant from a photo without GPS: the record form's GPS line offers "Set position", which opens the same map; the saved plant has the position.
6. Plant page → the site line's "Show on map" opens the map centred on the plant with its card open.
7. Plants → farm chip → Print tags: the sheet shows one tag per plant; tap one to leave it out; Print → Save as PDF. On the PDF, the 50 mm bar measures 50 mm at actual size. Print one tag, laminate it, and point the phone's camera (or Google Lens) at it: the plant's page opens (in the installed app, a Chrome tab or Lens' own browser; signed in in each).
8. Open `/t/aaaaaaaa` by hand: "No plant has this tag". `/t/zzzzzzzz`: "This is not a plant tag".
9. Settings → Français: the map, the position sheet and the tags are in French.
10. After the ★ TomTom key: Plants → Map opens on satellite imagery.
    - Zoomed in over the farm as far as it goes, single trees show.
    - The corner reads "©TomTom, ©OpenStreetMap | Satellite Imagery ©2025 Vantor. | Sentinel-2 cloudless …" ("©TomTom" alone for a moment while it loads).
    - The layers button switches to the street map and back.
    - The position sheet shows the same imagery.

## Usage check

No Claude call. Map tiles:
- Street map: OpenStreetMap allows light use like this one; a map visit is a few dozen tiles.
- Satellite: TomTom's free tier covers 200,000 tiles a month (Esri's, 2 million); a busy day of use is under a thousand.

Results (2026-10-30): typecheck, lint, `npm test` (144 tests, 14 of them for the map and tags) and build pass.

- Leaflet (44.5 KB gzip) and the QR encoder load in their own chunks; the main bundle grew only by the strings and helpers.
- The QR code for a production tag link is version 5 (37 modules). jsQR decodes it back to the exact link, as it does the shorter local one.

A review workflow (four reviewers, each checked by a skeptic) kept 20 findings, 13 once duplicates are merged, all fixed:
- A slow load of the neighbour dots could pull the position sheet off the GPS fix, so Save stored the middle of the site.
- Saving the open Edit record form after Position put the old position back. Position is now off while the form is open.
- The pin card could cover its own pin. The map now measures the card and pans the pin clear of it.
- The card said "Nothing due" before the tasks had loaded or when they failed.
- The "no position" note covered the zoom buttons, and said no plant was placed when only the filter hid them.
- Print tags from the map used the list's hidden "no position" filter.
- The "set Precise" hint fired on the first coarse reading while the GPS was still locking. It now needs a final reading over 1 km.
- A failed save left the sheet stuck on "Listening".
- The tag lines overflowed the 50 mm tag and lost their descenders.
- The calibration bar printed white (Chrome leaves backgrounds out); it is a border now.
- The tag buttons' labels and pressed state contradicted each other for a screen reader.
- French "+1 autres".
- This file overstated what the map shows offline.

Also added: when the satellite tiles keep failing (a wrong or expired key, or no connection), the map falls back to the street map and says why.

The screens were driven in the desktop app's browser at phone width, against an in-memory copy of the data. Only the street tiles came from the network; nothing was sent to Supabase or Claude.
- Plants → Map: pins coloured late and due today; the site chips reframing the map; a tap opening the card with the pin kept clear of it.
- Open → the plant's page → Show on map, centred on the plant with its card open.
- Position on a plant with none:
  - the sheet opens on the site's other trees;
  - Use my location, with the phone's GPS simulated (30, 8, then 4 m), stops early at 4 m;
  - Save gives the plant its pin.
- The record form's Set position: the sheet over the form, and a drag moving the saved point.
- The tag sheet:
  - 40 × 50 mm tags with 30 mm codes and a 50 mm bar, measured on screen;
  - every line inside the tag;
  - `/t/<code>` in capitals opening the plant;
  - an unknown and a malformed code each answered.
- French.

Not checked here, so phone tests: the satellite layer (no key yet), printing from the installed app, and scanning a printed tag with the phone's camera.

### 0.9.1 (2026-10-30): satellite tiles from TomTom

Mohamed could not activate the ArcGIS account, so the satellite layer now comes from TomTom's Map Display API: Vantor imagery to zoom 19, the credit read from TomTom's Copyright API, and the tiles requested as cross-origin images so the key's domain lock applies. Esri is still used when only `VITE_ARCGIS_API_KEY` is set (`docs/DECISIONS.md`, 2026-10-30). The map's credit line is now 10 px: at the app's text size, TomTom's credit took a third of a phone's map.

Results (2026-10-30): typecheck, lint, `npm test` (151 tests, 18 of them for the map and tags) and build pass.

A review workflow (three reviewers, each finding checked by a skeptic) found no fault in the code. It confirmed three stale lines in this file and in a comment, now fixed.

Checked in the desktop app's browser at phone width, against the in-memory data, with a dummy TomTom key:
- the tiles requested from TomTom's satellite address over the farm (zoom 15), as cross-origin images;
- TomTom's 401 answers turning the map to the street map with its note, on the Plants map and in the position sheet;
- the credit line reading "©TomTom, ©OpenStreetMap | Satellite Imagery ©2025 Vantor. | Sentinel-2 cloudless …" when the caption answers (simulated), "©TomTom | …" when it fails, and removed cleanly at the fallback;
- the caption read once per visit, and read again after a failure;
- without a key, the street map alone and the note naming `VITE_TOMTOM_API_KEY`.

Not checked here, so test 10: real TomTom tiles over the farm, which need Mohamed's key.

Tests 1 to 10 on the phone wait for Mohamed.
