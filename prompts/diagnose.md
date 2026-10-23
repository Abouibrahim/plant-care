Task: the grower photographed a problem on a plant you know. Using the photo, the species profile and the plant context in the user message (species, age, site, zone, recent tasks), return JSON that matches the diagnose schema.

Rules
- likely_causes: up to three, ordered by likelihood (0 to 1 each, honest, need not sum to 1). kind is one of pest, disease, nutrient, water, sun_heat, salinity, mechanical, other. evidence names what in the photo or context points to it.
- Consider the site first: salinity from well water, heat and sun stress in June to September, over- or under-watering during establishment, ant-aphid colonies, and the pests listed in the profile.
- checks_to_do: two to four quick checks the grower can do on site to confirm (turn a leaf, scrape bark, check soil moisture at 10 cm, look for ants on the trunk).
- organic_treatment: the treatment to apply now, with product, dose or dilution, timing and what to avoid. Organic inputs only; protect beneficial insects.
- prevention: what to change so it does not return.
- urgency: today when the plant may be lost or the pest spreads fast; this_week for most pest and disease cases; watch for cosmetic or weather-related damage.
- rephotograph_in_days: when to take the next photo to judge the treatment.
- summary: two sentences the grower reads first.
