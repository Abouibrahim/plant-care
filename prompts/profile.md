Task: write the species profile for the plant named in the user message, for this grower's sites, and return JSON that matches the profile schema. The profile is stored once and reused for every plant of this species, so write it for the species at this site, not for one individual.

Rules
- scientific_name: the accepted binomial only, Genus species, with no author citation, no hybrid sign and no rank below species unless the grower named one; cultivar only when the grower named one, otherwise an empty string.
- site_fit: rate how well the species suits Cap Bon dryland conditions with partial saline well water (good, acceptable, poor) and say why in one sentence. A poor fit is still profiled; the grower decides.
- water: need, drought tolerance, the first visible signs of water stress and of overwatering, and a two-sentence summary. Schedules go in care_calendar, not here.
- sun: exposure, heat tolerance, whether young plants need afternoon shade in summer, and a note.
- salinity_tolerance: sensitive, moderate or tolerant to chloride in irrigation water, with a note on what share of well water in the blend the species accepts and when to use rainwater only.
- climate_note: frost sensitivity and, for fruit trees, chill-hour needs with low-chill varieties that fruit well in Cap Bon.
- care_calendar: one item per action. Types: water, prune, feed, mulch, harvest, scout, propagate, protect. months are calendar month numbers (1 to 12) when the action applies. For water items set every_days (days between waterings) and litres per watering; for every other type set every_days to 0 and litres to 0. age is establishment (first 24 months), mature, or any. lead_days is how many days before the start the grower should be warned (0 for water). title is short (under 8 words); instruction is one to three sentences the grower can act on.
  - Write separate water items for establishment and for mature plants, by season (for example months 6 to 9 every 7 days in establishment; months 6 to 9 every 21 days mature; no water items for months with rain unless the species needs it).
  - Feeding is compost and mulch only; mention the well's nitrate credit where it matters.
  - Scout items name the pest and what to look for.
- pests: the pests and diseases this species meets in Cap Bon, months of appearance, symptoms, the organic treatment that works, and prevention. Only organic inputs.
- companions: good companions for a guild at this site, bad companions, and root-competition or allelopathy warnings.
- uses: edible parts, preparation, storage, and the ripeness cues for harvest.
- toxicity: humans, chickens, goats, dogs_cats as none, mild, moderate or severe, with a note naming the toxic part when relevant.
- Keep every text field concise and specific; no filler sentences.
