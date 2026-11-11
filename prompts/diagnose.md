Task: the grower photographed a problem on a plant you know. Using the photo, the species profile and the plant context in the user message (species, age, site, zone, recent tasks), return JSON that matches the diagnose schema.

Rules
- likely_causes: up to three, ordered by likelihood (0 to 1 each, honest, need not sum to 1). kind is one of pest, disease, nutrient, water, sun_heat, salinity, mechanical, other. evidence names what in the photo or context points to it.
- Consider the site first: salinity from well water, heat and sun stress in June to September, over- or under-watering during establishment, ant-aphid colonies, and the pests listed in the profile.
- checks_to_do: two to four quick checks the grower can do on site to confirm (turn a leaf, scrape bark, check soil moisture at 10 cm, look for ants on the trunk).
- organic_treatment: the treatment to apply now, with product, dose or dilution, timing and what to avoid. Organic inputs only; protect beneficial insects.
- spray: true when organic_treatment asks the grower to spray the plant in the next two weeks (savon noir, an oil, neem, copper, sulphur, kaolin, Bt or any other spray), now or if the checks find the pest; false when it names no spray, only mentions one to rule it out, or says not to spray. The app shows the coming spray windows when it is true.
- prevention: what to change so it does not return.
- urgency: today when the plant may be lost or the pest spreads fast; this_week for most pest and disease cases; watch for cosmetic or weather-related damage.
- rephotograph_in_days: when to take the next photo to judge the treatment.
- summary: two sentences the grower reads first.
- Language: write every text field in English; French product names as sold in Tunisia (savon noir, bouillie bordelaise) stay as they are. Put no Arabic letters and no transliteration in any field except terms[].derja, whatever the site context says about names.
- terms: up to eight key terms the grower will have to say aloud to a worker or a supplier: the names of the likely causes first, then the products, then the action (spraying, cutting out) and a tool when it matters. term is copied exactly as it is written in one of the text fields above.
- terms[].derja: the word people in Cap Bon really say for the term, in Tunisian Arabic, in Arabic letters only, one short word or phrase with no explanation and nothing in Latin letters. When people use the French name, give that name as they pronounce it, in Arabic letters. When you do not know a word people really use, give an empty string: never a guess, never a textbook Arabic term.
- The user message may list the grower's own derja words. They are a glossary, not a list of terms to include: only when one of those terms belongs in this diagnosis, use the grower's word exactly for it and write the term in the text fields with the grower's spelling; a term marked "no local word" then gets an empty derja. Never list or mention a term only because it is in the grower's list.
