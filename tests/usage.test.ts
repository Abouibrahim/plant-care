// The usage ledger (Phase 14, review 5.3): the arithmetic in src/lib/usage.ts and the row
// api/_usage.ts writes for each Claude call, against the in-memory settings table.
import { describe, expect, it } from "vitest";
import { recordUsage } from "../api/_usage.js";
import { addCall, emptyLedger, estimateCost, formatDollars, monthOf, parseLedger, previousMonth, PRICES_PER_MILLION } from "../src/lib/usage";
import { usageKey, type Usage, type UsageLedger } from "../src/types";
import { makeClient, makeState } from "./mockdb";

const call = (partial: Partial<Usage> = {}): Usage => ({
  model: "claude-fable-5-1",
  input_tokens: 3000,
  output_tokens: 1200,
  thinking_tokens: 400,
  cache_read_input_tokens: 600,
  cache_creation_input_tokens: 0,
  ...partial,
});

describe("the ledger's arithmetic", () => {
  it("adds a call to the month and to its route, counting the failed ones and those a fallback model answered (not one that failed under it)", () => {
    const one = addCall(emptyLedger(), "ask", call());
    const two = addCall(one, "identify", call({ input_tokens: 4000, output_tokens: 300, thinking_tokens: 0, cache_read_input_tokens: 0, cache_creation_input_tokens: 600 }));
    const three = addCall(two, "profile", call({ model: "claude-opus-4-8", input_tokens: 2500, output_tokens: 6000, thinking_tokens: 2000, cache_read_input_tokens: 0 }), "failed");
    const four = addCall(three, "diagnose", call({ model: "claude-opus-4-8" }));
    expect(four).toEqual({
      calls: 4,
      failed: 1,
      fallback: 1,
      input: 12500,
      output: 8700,
      thinking: 2800,
      cache_read: 1200,
      cache_write: 600,
      by_route: {
        ask: { calls: 1, failed: 0, fallback: 0, input: 3000, output: 1200, thinking: 400, cache_read: 600, cache_write: 0 },
        identify: { calls: 1, failed: 0, fallback: 0, input: 4000, output: 300, thinking: 0, cache_read: 0, cache_write: 600 },
        profile: { calls: 1, failed: 1, fallback: 0, input: 2500, output: 6000, thinking: 2000, cache_read: 0, cache_write: 0 },
        diagnose: { calls: 1, failed: 0, fallback: 1, input: 3000, output: 1200, thinking: 400, cache_read: 600, cache_write: 0 },
      },
    });
  });

  it("reads a stored ledger back, dropping what it cannot read", () => {
    expect(parseLedger(null)).toEqual(emptyLedger());
    expect(parseLedger({ calls: 2, input: "x", by_route: { ask: { calls: 1 }, bogus: { calls: 9 } } })).toEqual({
      calls: 2,
      failed: 0,
      fallback: 0,
      input: 0,
      output: 0,
      thinking: 0,
      cache_read: 0,
      cache_write: 0,
      by_route: { ask: { calls: 1, failed: 0, fallback: 0, input: 0, output: 0, thinking: 0, cache_read: 0, cache_write: 0 } },
    });
  });

  it("prices the tokens at the list rates, thinking inside the output", () => {
    const totals = { calls: 1, failed: 0, fallback: 0, input: 1_000_000, output: 100_000, thinking: 50_000, cache_read: 2_000_000, cache_write: 400_000 };
    expect(estimateCost(totals)).toBeCloseTo(PRICES_PER_MILLION.input + PRICES_PER_MILLION.output / 10 + 2 * PRICES_PER_MILLION.cache_read + 0.4 * PRICES_PER_MILLION.cache_write, 6);
    expect(formatDollars(2.1049)).toBe("$2.10");
    expect(formatDollars(0)).toBe("$0.00");
  });

  it("names the month and the one before", () => {
    expect(monthOf("2026-11-08")).toBe("2026-11");
    expect(previousMonth("2026-11")).toBe("2026-10");
    expect(previousMonth("2026-01")).toBe("2025-12");
    expect(usageKey("2026-11")).toBe("usage:2026-11");
  });
});

describe("recordUsage", () => {
  it("counts a derja word list as its own kind (Phase 17)", async () => {
    const state = makeState();
    expect(await recordUsage(makeClient(state), "derja", { model: "m", input_tokens: 10, output_tokens: 5, thinking_tokens: 0, cache_read_input_tokens: 0, cache_creation_input_tokens: 0 })).toBe(true);
    expect(parseLedger(state.settings[0].value).by_route.derja?.calls).toBe(1);
  });
  it("starts the month's row on the first call and adds the next ones to it, in Tunis time", async () => {
    const state = makeState();
    const db = makeClient(state);
    // 23:30 UTC on 30 November is 00:30 on 1 December in Tunis: the December row.
    expect(await recordUsage(db, "ask", call(), "answered", new Date("2026-11-30T23:30:00Z"))).toBe(true);
    expect(await recordUsage(db, "profile", call({ input_tokens: 2500, output_tokens: 2500 }), "answered", new Date("2026-12-10T08:00:00Z"))).toBe(true);
    expect(await recordUsage(db, "ask", call(), "answered", new Date("2026-11-15T08:00:00Z"))).toBe(true);
    const rows = state.settings.map((r) => [r.key, r.value as UsageLedger] as const).sort((a, b) => String(a[0]).localeCompare(String(b[0])));
    expect(rows.map(([key]) => key)).toEqual(["usage:2026-11", "usage:2026-12"]);
    expect(rows[1][1]).toMatchObject({ calls: 2, input: 5500, output: 3700 });
    expect(rows[1][1].by_route.profile).toMatchObject({ calls: 1, input: 2500 });
    expect(rows[0][1]).toMatchObject({ calls: 1, input: 3000 });
  });

  it("loses nothing when two calls end together", async () => {
    const state = makeState();
    const db = makeClient(state);
    const now = new Date("2026-11-10T08:00:00Z");
    // Both read the month's row (none yet) before either writes: one insert wins, the other adds to it.
    await Promise.all([recordUsage(db, "ask", call(), "answered", now), recordUsage(db, "check", call(), "answered", now)]);
    expect(state.settings).toHaveLength(1);
    expect(state.settings[0].value).toMatchObject({ calls: 2, input: 6000 });
    // And again on an existing row: the guarded update of the second write finds the row changed and tries once more.
    await Promise.all([recordUsage(db, "ask", call(), "answered", now), recordUsage(db, "diagnose", call(), "failed", now)]);
    expect(state.settings[0].value).toMatchObject({ calls: 4, failed: 1, input: 12000 });
  });

  it("never fails the call it records", async () => {
    const state = makeState();
    const failing = makeClient(state, {
      onQuery: () => {
        throw new Error("boom");
      },
    });
    expect(await recordUsage(failing, "check", call())).toBe(false);
    expect(state.settings).toHaveLength(0);
  });
});
