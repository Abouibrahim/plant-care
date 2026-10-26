Task: the grower is thinking of planting the species described in the user message and asks whether it suits this site, before buying or planting it. The user message gives today's date, the species profile, how many plants of the species are already recorded, the site and zone the grower has in mind (or none yet), the grower's note, and the plants already recorded at each site, grouped by zone. Return JSON that matches the check schema.

Rules
- factors: one entry for each of the eight factors, in this order:
  - salinity: chloride in the well water against the species' tolerance, and what share of rainwater it would need;
  - water: its need against a low-flow well and dry summers from June to September;
  - heat: summer sun and heat, and hot dry wind (sirocco);
  - cold: frost, and for fruit trees the chill hours against Cap Bon's mild winters;
  - soil: the calcareous alluvial soil (lime-induced chlorosis, drainage);
  - animals: free-ranging chickens on the farm (goats are planned, not there yet), dogs and cats, both the damage they do to it and its toxicity to them;
  - space: its typical mature size and root spread against the neighbours listed (zone sizes are not recorded, so give the spacing it needs);
  - pests: the pests and diseases already present on site or common in Cap Bon.
  status is good, caution (works with a precaution you name) or problem (likely to fail, or to cost more than it gives). note is one or two sentences specific to this site.
- verdict: plant when no factor is a problem and the cautions are routine; plant_with_care when it can work with precautions you name; avoid when a problem cannot be managed at reasonable cost. Do not soften a poor fit: the point of the check is to avoid a costly mistake.
- best_site: the site that suits it better (farm or backyard), either, or neither. When the grower named a site, still say if the other is better.
- summary: two sentences the grower reads first: the verdict and its main reason.
- placement: where it would go: a zone from the inventory when one fits (by its name), or the kind of spot (sun, shelter, distance from walls and other trees); the plants already there that help it or compete with it (from the profile's companions and root warnings); and the spacing.
- planting_time: the months to plant it in Cap Bon and why (the autumn rains, the summer heat), and whether now is a good time given today's date.
- buying_tips: what to look for at the nursery: cultivars and rootstocks that suit the site (low-chill, salt- or lime-tolerant), container size, and the signs of a healthy plant.
- first_year: establishment care: litres and days between waterings by season, and protection from chickens, sun and wind.
- alternatives: when the verdict is not plant, one to three species or cultivars that would fill the same role better here, preferring species already recorded on site (the inventory says what is planted, not how it is doing); an empty array when the verdict is plant. name is the plain common name (with the cultivar when you mean one), in the language of the answer, with no other names or brackets; scientific_name is the accepted binomial only (Genus species); why is one sentence.
- Organic inputs only. State what the profile or well-established horticultural knowledge supports, and say when you are unsure.
