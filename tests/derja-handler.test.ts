// POST /api/derja end to end (0.17.1): the handler over the in-memory tables, with Claude and the
// token check stood in for. The outcomes the Phase 17 design promised tests for: the list stored
// and the app-wide words extended, a refusal that stores nothing, a failed write that does not fail
// the paid call, and a species deleted during the call, which gets no row.
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { VercelRequest } from "../api/_http.js";
import type { Usage } from "../src/types";
import { fake } from "./http";
import { resetState, sharedState, type QueryInfo } from "./mockdb";

const hooks = vi.hoisted(() => ({ onQuery: undefined as ((q: QueryInfo) => void) | undefined }));

vi.mock("../api/_supabase.js", async (importOriginal) => {
  const real = await importOriginal<typeof import("../api/_supabase.js")>();
  const { makeClient, sharedState } = await import("./mockdb");
  return {
    ...real,
    verifyUser: vi.fn(async () => ({ id: "owner" })),
    serviceClient: () => makeClient(sharedState, { onQuery: (q) => hooks.onQuery?.(q) }),
  };
});

vi.mock("../api/_claude.js", async (importOriginal) => {
  const real = await importOriginal<typeof import("../api/_claude.js")>();
  return { ...real, callJson: vi.fn() };
});

const { callJson } = await import("../api/_claude.js");
const { default: handler } = await import("../api/derja.js");

const ID = "5b1e9a20-1c2d-4e3f-8a9b-0c1d2e3f4a5b";
const ASKED = "2026-11-12T08:00:00.000Z";
const USAGE: Usage = { model: "claude-fable-5-1", input_tokens: 4100, output_tokens: 2600, thinking_tokens: 900, cache_read_input_tokens: 0, cache_creation_input_tokens: 700 };
const TERMS = [
  { term: "Kaolin", derja: "كاولان" },
  { term: "pruning", derja: "زبيرة" },
];

const olive = {
  id: ID,
  scientific_name: "Olea europaea",
  cultivar: "",
  common_names: { en: "Olive", fr: "Olivier", ar: "زيتون", ar_latin: "zitoun" },
  plant_type: "tree",
  lifecycle: "perennial",
  foliage: "evergreen",
  layer: "canopy",
  site_fit: { rating: "good", note: "Fits." },
  water: { need: "low", drought_tolerance: "high", summary: "Rare waterings.", stress_signs: "Curl.", overwatering_signs: "Yellowing." },
  sun: { exposure: "full_sun", heat_tolerance: "high", summer_shade_needed: false, note: "None." },
  salinity_tolerance: { level: "moderate", note: "Leach." },
  climate_note: "Mild.",
  care_calendar: [{ type: "prune", months: [2], age: "any", title: "Prune the olive", instruction: "Open the centre.", every_days: null, litres: null, lead_days: 7 }],
  pests: [{ name_en: "Olive fly", name_fr: "Mouche de l'olive", months: [9], symptoms: "Stung fruit.", organic_treatment: "Kaolin spray.", prevention: "Hang yellow traps." }],
  companions: { good: ["Fava bean"], bad: [], root_warnings: [] },
  uses: { edible_parts: "Fruit.", preparation: "Brine.", storage: "Jars.", harvest_cues: "Violet." },
  toxicity: { humans: "none", chickens: "none", goats: "none", dogs_cats: "none", note: "Safe." },
};

/** Claude answers with these terms, the ledger told as callJson tells it; `during` runs while Claude works. */
function answers(terms: unknown, during?: () => void) {
  vi.mocked(callJson).mockImplementation((async (opts: { onUsage?: (u: Usage, o: "answered") => unknown }) => {
    during?.();
    const recorded = Promise.resolve(opts.onUsage?.(USAGE, "answered")).then(() => undefined);
    return { ok: true, data: { terms }, usage: USAGE, recorded };
  }) as never);
}

function refuses(refusal: string) {
  vi.mocked(callJson).mockImplementation((async (opts: { onUsage?: (u: Usage, o: "refused") => unknown }) => {
    await opts.onUsage?.(USAGE, "refused");
    return { ok: false, refusal, usage: USAGE };
  }) as never);
}

async function post(body: unknown) {
  const { res, raw } = fake();
  const req = { method: "POST", headers: { authorization: "Bearer token" }, query: {}, cookies: {}, body } as unknown as VercelRequest;
  await handler(req, res);
  return { status: raw.statusCode, body: JSON.parse(raw.body.trim()) as Record<string, unknown> };
}

const setting = (key: string) => sharedState.settings.find((r) => r.key === key)?.value;
const ledgerRow = () => sharedState.settings.find((r) => String(r.key).startsWith("usage:"))?.value as { by_route?: { derja?: { calls: number } } } | undefined;

beforeEach(() => {
  resetState(sharedState);
  hooks.onQuery = undefined;
  vi.mocked(callJson).mockReset();
  sharedState.species.push({ ...olive });
});

describe("POST /api/derja", () => {
  it("stores the species' list and Claude's first words, then answers with the list and the usage", async () => {
    answers(TERMS);
    const { status, body } = await post({ species_id: ID, asked_at: ASKED });
    expect(status).toBe(200);
    expect(body.terms).toEqual(TERMS);
    expect(body.asked_at).toBe(ASKED);
    expect(body.output_tokens).toBe(2600);
    expect(setting(`derja:species:${ID}`)).toMatchObject({ terms: TERMS, asked_at: ASKED });
    expect((setting("derja:words") as Array<{ term: string }>).map((w) => w.term)).toEqual(["kaolin", "pruning"]);
    expect(ledgerRow()?.by_route?.derja?.calls).toBe(1);
  });

  it("stores nothing on a refusal, and answers it with the usage", async () => {
    refuses("Claude declined this request.");
    const { status, body } = await post({ species_id: ID, asked_at: ASKED });
    expect(status).toBe(200);
    expect(body).toMatchObject({ refusal: "Claude declined this request.", output_tokens: 2600 });
    expect(body.terms).toBeUndefined();
    expect(setting(`derja:species:${ID}`)).toBeUndefined();
    expect(setting("derja:words")).toBeUndefined();
    expect(ledgerRow()?.by_route?.derja?.calls).toBe(1);
  });

  it("still answers with the paid list when its writes fail", async () => {
    answers(TERMS);
    hooks.onQuery = (q) => {
      if (q.table === "settings" && q.op !== "select") throw new Error("connection reset");
    };
    const { status, body } = await post({ species_id: ID, asked_at: ASKED });
    expect(status).toBe(200);
    expect(body.terms).toEqual(TERMS);
    expect(setting(`derja:species:${ID}`)).toBeUndefined();
  });

  it("writes no row for a species deleted while Claude was answering", async () => {
    answers(TERMS, () => {
      sharedState.species.length = 0;
    });
    const { status, body } = await post({ species_id: ID, asked_at: ASKED });
    expect(status).toBe(404);
    expect(body.error).toBe("Species not found");
    expect(setting(`derja:species:${ID}`)).toBeUndefined();
    expect(setting("derja:words")).toBeUndefined();
    expect(ledgerRow()?.by_route?.derja?.calls).toBe(1);
  });
});
