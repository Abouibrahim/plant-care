// The server's derja helpers (Phase 17): the corrections read that tells a failure from none, the
// glossary block, the app-wide list's guarded write and the bounded upsert of a settings row.
import { describe, expect, it } from "vitest";
import { correctionsBlock, extendWords, loadCorrectionsOrNull, upsertSetting } from "../api/_derja.js";
import { makeClient, makeState } from "./mockdb";

const now = new Date("2026-11-12T08:00:00Z");
const at = now.toISOString();
const pruning = { term: "pruning", derja: "زبيرة" };
const mulch = { term: "mulch", derja: "تبن" };
const words = (state: ReturnType<typeof makeState>) => state.settings.find((r) => r.key === "derja:words")?.value;
const failing = (state: ReturnType<typeof makeState>) =>
  makeClient(state, {
    onQuery: () => {
      throw new Error("boom");
    },
  });

describe("extendWords", () => {
  it("creates the list, then keeps the first word and adds the new term", async () => {
    const state = makeState();
    const db = makeClient(state);
    expect(await extendWords(db, [pruning], [], now)).toBe(true);
    expect(words(state)).toEqual([{ term: "pruning", word: "زبيرة", at }]);
    expect(await extendWords(db, [{ term: "Pruning", derja: "تقليم" }, mulch], [], now)).toBe(true);
    expect(words(state)).toEqual([
      { term: "pruning", word: "زبيرة", at },
      { term: "mulch", word: "تبن", at },
    ]);
  });
  it("keeps both sets when two calls end together", async () => {
    const state = makeState();
    const db = makeClient(state);
    const done = await Promise.all([extendWords(db, [pruning], [], now), extendWords(db, [mulch], [], now)]);
    expect(done).toEqual([true, true]);
    expect(state.settings.filter((r) => r.key === "derja:words")).toHaveLength(1);
    expect((words(state) as Array<{ term: string }>).map((w) => w.term).sort()).toEqual(["mulch", "pruning"]);
  });
  it("adds nothing for a term the grower corrected, and nothing at all when his words could not be read", async () => {
    const state = makeState();
    const db = makeClient(state);
    expect(await extendWords(db, [pruning, mulch], [{ term: "mulch", word: "قش", at }], now)).toBe(true);
    expect(words(state)).toEqual([{ term: "pruning", word: "زبيرة", at }]);
    expect(await extendWords(db, [mulch], null, now)).toBe(false);
    expect(words(state)).toEqual([{ term: "pruning", word: "زبيرة", at }]);
  });
  it("writes nothing when nothing is new", async () => {
    const state = makeState();
    let writes = 0;
    const db = makeClient(state, {
      onQuery: (q) => {
        if (q.op !== "select") writes += 1;
      },
    });
    await extendWords(db, [pruning], [], now);
    writes = 0;
    expect(await extendWords(db, [pruning, { term: "copper", derja: "" }], [], now)).toBe(true);
    expect(writes).toBe(0);
  });
  it("is false, without throwing, when the table cannot be reached", async () => {
    expect(await extendWords(failing(makeState()), [pruning], [], now)).toBe(false);
  });
});

describe("upsertSetting", () => {
  it("inserts, then replaces the value of the same key", async () => {
    const state = makeState();
    const db = makeClient(state);
    expect(await upsertSetting(db, "derja:species:s1", { a: 1 })).toBe(true);
    expect(await upsertSetting(db, "derja:species:s1", { a: 2 })).toBe(true);
    expect(state.settings).toHaveLength(1);
    expect(state.settings[0].value).toEqual({ a: 2 });
  });
  it("is false, without throwing, on a failure", async () => {
    expect(await upsertSetting(failing(makeState()), "k", 1)).toBe(false);
  });
});

describe("loadCorrectionsOrNull", () => {
  const c = { term: "aphid", word: "ڨمل", at };
  it("is the list, an empty list without a row, and null when the read fails", async () => {
    const state = makeState();
    expect(await loadCorrectionsOrNull(makeClient(state))).toEqual([]);
    state.settings.push({ key: "derja", value: [c] });
    expect(await loadCorrectionsOrNull(makeClient(state))).toEqual([c]);
    expect(await loadCorrectionsOrNull(failing(state))).toBeNull();
  });
});

describe("correctionsBlock", () => {
  const c = { term: "aphid", word: "ڨمل", at };
  it("names the call it is for", () => {
    expect(correctionsBlock([c], "profile")!.split("\n")[0]).toBe("The grower's own derja words, a glossary for the terms that belong in this profile; use these exactly:");
    expect(correctionsBlock([c])!.split("\n")[0]).toBe("The grower's own derja words, a glossary for the terms that belong in this diagnosis; use these exactly:");
    expect(correctionsBlock([])).toBeNull();
  });
});

describe("extendWords at the cap (review of the branch)", () => {
  it("still writes: the new term comes in and the oldest goes", async () => {
    const state = makeState();
    const full = Array.from({ length: 600 }, (_, i) => ({ term: `t${i}x`, word: "كلمة", at: `2026-01-01T00:${String(Math.floor(i / 60)).padStart(2, "0")}:${String(i % 60).padStart(2, "0")}Z` }));
    state.settings.push({ key: "derja:words", value: full });
    expect(await extendWords(makeClient(state), [mulch], [], now)).toBe(true);
    const stored = words(state) as Array<{ term: string }>;
    expect(stored).toHaveLength(600);
    expect(stored.some((w) => w.term === "mulch")).toBe(true);
    expect(stored.some((w) => w.term === "t0x")).toBe(false);
  });
});
