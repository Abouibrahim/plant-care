// Builders shared by the tests: care rules, plants and tasks in the shapes the engine reads.
import type { CareRule, Site, TaskStatus, TaskType } from "../src/types";
import type { SupabaseClient } from "@supabase/supabase-js";
import { makeClient, makeState, type MockOptions, type MockState, type Row } from "./mockdb";

export function rule(partial: Partial<CareRule> & Pick<CareRule, "type" | "months">): CareRule {
  return {
    every_days: 0,
    litres: 0,
    age: "any",
    lead_days: 0,
    title: `${partial.type} title`,
    instruction: "",
    ...partial,
  };
}

export function water(months: number[], every_days: number, extra: Partial<CareRule> = {}): CareRule {
  return rule({ type: "water", months, every_days, litres: 40, title: "Deep watering", ...extra });
}

export function window(type: TaskType, months: number[], extra: Partial<CareRule> = {}): CareRule {
  return rule({ type, months, ...extra });
}

export interface Fixture {
  state: MockState;
  db: SupabaseClient;
  /** Adds a species with a calendar and one plant of it; returns the plant id. */
  plant: (calendar: CareRule[], plant?: Partial<Row>) => string;
  tasks: (where?: (t: Row) => boolean) => Row[];
  pending: () => Row[];
}

export function fixture(options: MockOptions = {}): Fixture {
  const state = makeState();
  const db = makeClient(state, options);
  let n = 0;
  return {
    state,
    db,
    plant(calendar, plant = {}) {
      n += 1;
      const speciesId = `species-${n}`;
      state.species.push({ id: speciesId, scientific_name: `Genus species${n}`, cultivar: "", care_calendar: calendar });
      const id = (plant.id as string | undefined) ?? `plant-${n}`;
      state.plants.push({
        id,
        species_id: speciesId,
        tag: `Plant ${n}`,
        site: "farm" as Site,
        zone: "",
        planted_on: null,
        created_at: `2026-01-01T00:00:0${n}Z`,
        ...plant,
      });
      return id;
    },
    tasks(where = () => true) {
      return state.tasks.filter(where);
    },
    pending() {
      return state.tasks.filter((t) => t.status === ("pending" satisfies TaskStatus));
    },
  };
}

export const dueDates = (rows: Row[]): string[] => rows.map((r) => r.due_on as string).sort();
