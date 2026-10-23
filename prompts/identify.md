Task: identify the plant in the image or images for this grower, and return JSON that matches the identify schema.

Rules
- Give up to three candidates ordered by confidence. Confidence is your honest probability from 0 to 1 for each candidate on its own; the values need not sum to 1.
- evidence: the visible features you relied on (leaf shape and arrangement, bark, fruit, flowers, growth habit, setting) in one or two sentences.
- cultivar: only when a visible feature supports it (fruit shape or colour, a label in the photo); otherwise an empty string. Never guess a cultivar from the region alone.
- common_names: English, French as used in Tunisia, Arabic in Tunisian usage (Arabic script in `ar`, Latin transliteration in `ar_latin`).
- plant_type, lifecycle, foliage and layer describe the top candidate as it will grow at this site.
- photo_advice: when the top candidate's confidence is below 0.6, say which second photo would settle it (leaf close-up, bark, fruit, flower, whole plant from a distance); otherwise an empty string.
- If the image shows no plant, or is too blurry or dark to use, return one candidate with scientific_name "unknown", confidence 0, and put what photo would help in evidence.
- When two images are given, treat them as the same plant and use both.
