// What the species review screen lets the user edit, section by section.
// Each target is one or more top-level profile keys; each field is a path into one of them.
import { t } from "../../i18n";
import type { Species, SpeciesProfile } from "../../types";

export type ProfileKey = keyof SpeciesProfile;

interface FieldBase {
  key: ProfileKey;
  /** Property inside the top-level object; absent when the key itself is the value. */
  sub?: string;
  label: string;
  /** Save stays disabled while a required text field is empty. */
  required?: boolean;
  /** Right-to-left text (Arabic). */
  rtl?: boolean;
}

export type FieldDef = FieldBase &
  (
    | { kind: "text" }
    | { kind: "textarea" }
    | { kind: "boolean" }
    /** string[] edited as one item per line */
    | { kind: "list" }
    | { kind: "enum"; labels: Readonly<Record<string, string>> }
  );

export interface EditTarget {
  id: string;
  label: string;
  fields: FieldDef[];
}

/** Top-level keys a target touches, in order of first appearance. */
export function targetKeys(target: EditTarget): ProfileKey[] {
  const keys: ProfileKey[] = [];
  for (const f of target.fields) if (!keys.includes(f.key)) keys.push(f.key);
  return keys;
}

export function isEdited(species: Species, target: EditTarget): boolean {
  const edits = species.user_edits ?? {};
  return targetKeys(target).some((k) => k in edits);
}

/** The value a field shows in its control: strings and booleans as is, lists as lines. */
export type RawValue = string | boolean;

export function fieldId(f: FieldDef): string {
  return f.sub ? `${f.key}.${f.sub}` : f.key;
}

export function readField(profile: SpeciesProfile, f: FieldDef): unknown {
  const top: unknown = profile[f.key];
  if (!f.sub) return top;
  return top && typeof top === "object" ? (top as Record<string, unknown>)[f.sub] : undefined;
}

export function toRaw(f: FieldDef, value: unknown): RawValue {
  switch (f.kind) {
    case "boolean":
      return value === true;
    case "list":
      return Array.isArray(value) ? value.map(String).join("\n") : "";
    default:
      return typeof value === "string" ? value : "";
  }
}

export function fromRaw(f: FieldDef, raw: RawValue): unknown {
  switch (f.kind) {
    case "boolean":
      return raw === true;
    case "list":
      return String(raw)
        .split("\n")
        .map((s) => s.trim())
        .filter((s) => s.length > 0);
    case "enum":
      return String(raw);
    default:
      return String(raw).trim();
  }
}

const F = t.species.fields;
const E = t.enums;

const identity: EditTarget = {
  id: "identity",
  label: t.species.sections.identity,
  fields: [
    { key: "common_names", sub: "en", label: F.en, kind: "text", required: true },
    { key: "common_names", sub: "fr", label: F.fr, kind: "text" },
    { key: "common_names", sub: "ar", label: F.ar, kind: "text", rtl: true },
    { key: "common_names", sub: "ar_latin", label: F.ar_latin, kind: "text" },
    { key: "scientific_name", label: F.scientific_name, kind: "text", required: true },
    { key: "cultivar", label: F.cultivar, kind: "text" },
    { key: "plant_type", label: t.species.growthForm.plant_type, kind: "enum", labels: E.plant_type },
    { key: "lifecycle", label: t.species.growthForm.lifecycle, kind: "enum", labels: E.lifecycle },
    { key: "foliage", label: t.species.growthForm.foliage, kind: "enum", labels: E.foliage },
    { key: "layer", label: t.species.growthForm.layer, kind: "enum", labels: E.layer },
  ],
};

const siteFit: EditTarget = {
  id: "site_fit",
  label: t.species.sections.siteFit,
  fields: [
    { key: "site_fit", sub: "rating", label: F.rating, kind: "enum", labels: E.site_fit },
    { key: "site_fit", sub: "note", label: F.note, kind: "textarea" },
  ],
};

const water: EditTarget = {
  id: "water",
  label: t.species.sections.water,
  fields: [
    { key: "water", sub: "need", label: F.need, kind: "enum", labels: E.level },
    { key: "water", sub: "drought_tolerance", label: F.drought_tolerance, kind: "enum", labels: E.level },
    { key: "water", sub: "summary", label: F.summary, kind: "textarea" },
    { key: "water", sub: "stress_signs", label: F.stress_signs, kind: "textarea" },
    { key: "water", sub: "overwatering_signs", label: F.overwatering_signs, kind: "textarea" },
  ],
};

const sun: EditTarget = {
  id: "sun",
  label: t.species.sections.sun,
  fields: [
    { key: "sun", sub: "exposure", label: F.exposure, kind: "enum", labels: E.exposure },
    { key: "sun", sub: "heat_tolerance", label: F.heat_tolerance, kind: "enum", labels: E.level },
    { key: "sun", sub: "summer_shade_needed", label: F.summer_shade_needed, kind: "boolean" },
    { key: "sun", sub: "note", label: F.note, kind: "textarea" },
  ],
};

const salinity: EditTarget = {
  id: "salinity_tolerance",
  label: t.species.sections.salinity,
  fields: [
    { key: "salinity_tolerance", sub: "level", label: F.level, kind: "enum", labels: E.salinity },
    { key: "salinity_tolerance", sub: "note", label: F.note, kind: "textarea" },
  ],
};

const climate: EditTarget = {
  id: "climate_note",
  label: t.species.sections.climate,
  fields: [{ key: "climate_note", label: F.climate_note, kind: "textarea" }],
};

const companions: EditTarget = {
  id: "companions",
  label: t.species.sections.companions,
  fields: [
    { key: "companions", sub: "good", label: F.good, kind: "list" },
    { key: "companions", sub: "bad", label: F.bad, kind: "list" },
    { key: "companions", sub: "root_warnings", label: F.root_warnings, kind: "list" },
  ],
};

const uses: EditTarget = {
  id: "uses",
  label: t.species.sections.uses,
  fields: [
    { key: "uses", sub: "edible_parts", label: F.edible_parts, kind: "textarea" },
    { key: "uses", sub: "preparation", label: F.preparation, kind: "textarea" },
    { key: "uses", sub: "storage", label: F.storage, kind: "textarea" },
    { key: "uses", sub: "harvest_cues", label: F.harvest_cues, kind: "textarea" },
  ],
};

const toxicity: EditTarget = {
  id: "toxicity",
  label: t.species.sections.toxicity,
  fields: [
    { key: "toxicity", sub: "humans", label: F.humans, kind: "enum", labels: E.toxicity },
    { key: "toxicity", sub: "chickens", label: F.chickens, kind: "enum", labels: E.toxicity },
    { key: "toxicity", sub: "goats", label: F.goats, kind: "enum", labels: E.toxicity },
    { key: "toxicity", sub: "dogs_cats", label: F.dogs_cats, kind: "enum", labels: E.toxicity },
    { key: "toxicity", sub: "note", label: F.note, kind: "textarea" },
  ],
};

export const IDENTITY_TARGETS: EditTarget[] = [identity];
export const NEEDS_TARGETS: EditTarget[] = [siteFit, water, sun, salinity, climate];
export const GUILD_TARGETS: EditTarget[] = [companions, uses, toxicity];
