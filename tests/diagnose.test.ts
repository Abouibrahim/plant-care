// The derja words in the diagnose call (Phase 16): the schema's terms, the grower's own words in
// the user message, and the settings row they are read from.
import { readFileSync } from "node:fs";
import type { SupabaseClient } from "@supabase/supabase-js";
import { describe, expect, it } from "vitest";
import { closingLines, correctionsBlock, loadCorrections, photoRow } from "../api/diagnose.js";
import type { ProblemAiResult } from "../src/types";

const mould = { term: "sooty mould", word: "الفحمة", at: "2026-11-05T00:00:00Z" };
const aphid = { term: "aphid", word: "", at: "2026-11-03T00:00:00Z" };

describe("the diagnose schema", () => {
  const schema = JSON.parse(readFileSync("prompts/diagnose.schema.json", "utf8")) as {
    required: string[];
    properties: Record<string, { items?: unknown }>;
  };
  it("requires terms of { term, derja }, nothing else", () => {
    expect(schema.required).toContain("terms");
    expect(schema.properties.terms.items).toEqual({
      type: "object",
      properties: { term: { type: "string" }, derja: { type: "string" } },
      required: ["term", "derja"],
      additionalProperties: false,
    });
  });
});

describe("the diagnose prompt", () => {
  const prompt = readFileSync("prompts/diagnose.md", "utf8");
  it("keeps Arabic to the derja field and carries no Arabic itself", () => {
    expect(prompt).toMatch(/terms/);
    expect(prompt).toMatch(/no Arabic letters/i);
    expect(/\p{Script=Arabic}/u.test(prompt)).toBe(false);
  });
});

describe("correctionsBlock", () => {
  it("is null without corrections", () => {
    expect(correctionsBlock([])).toBeNull();
  });
  it("lists them in the order given, an empty word as no local word", () => {
    const lines = correctionsBlock([mould, aphid])!.split("\n");
    expect(lines).toEqual(["The grower's own derja words, a glossary for the terms that belong in this diagnosis; use these exactly:", "- sooty mould: الفحمة", "- aphid: no local word (if you list this term, give it an empty derja)"]);
  });
});

describe("closingLines", () => {
  it("puts the grower's words between the note and the final instruction", () => {
    const parts = closingLines("spots", [mould]);
    expect(parts).toEqual(['Grower\'s note: "spots"', correctionsBlock([mould]), "Diagnose what the photo shows on this plant."]);
  });
  it("leaves the block out without corrections", () => {
    expect(closingLines("", [])).toEqual(["The grower left no note.", "Diagnose what the photo shows on this plant."]);
  });
});

function fakeDb(answer: { data: unknown; error: unknown } | Error): SupabaseClient {
  const maybeSingle = async () => {
    if (answer instanceof Error) throw answer;
    return answer;
  };
  // The read is bounded since Phase 17, so the chain carries abortSignal too.
  const query = { maybeSingle, abortSignal: () => query };
  return { from: () => ({ select: () => ({ eq: () => query }) }) } as unknown as SupabaseClient;
}

describe("loadCorrections (route)", () => {
  it("reads the derja row", async () => {
    expect(await loadCorrections(fakeDb({ data: { value: [aphid, mould] }, error: null }))).toEqual([mould, aphid]);
  });
  it("is empty without a row, on an error, on a thrown fault and on an unexpected value", async () => {
    expect(await loadCorrections(fakeDb({ data: null, error: null }))).toEqual([]);
    expect(await loadCorrections(fakeDb({ data: null, error: { message: "boom" } }))).toEqual([]);
    expect(await loadCorrections(fakeDb(new Error("network")))).toEqual([]);
    expect(await loadCorrections(fakeDb({ data: { value: { a: 1 } }, error: null }))).toEqual([]);
  });
});

describe("the photos row", () => {
  it("carries the terms with the diagnosis", () => {
    const terms = [{ term: "Black scale", derja: "النمرة" }];
    const result = { summary: "s", terms } as unknown as ProblemAiResult;
    const input = { plant_id: "p", images: [], note: "", photo: { id: "i", storage_path: "p/1.jpg", taken_at: "2026-11-11T00:00:00Z" } };
    expect((photoRow(input, result)?.ai_result as ProblemAiResult).terms).toEqual(terms);
  });
});

describe("the grower's words are a glossary, not a list to include", () => {
  it("says so in the prompt and in the block", () => {
    const prompt = readFileSync("prompts/diagnose.md", "utf8");
    expect(prompt).toMatch(/only when one of those terms belongs in this diagnosis/i);
    expect(prompt).toMatch(/never list .* only because it is in the grower's list/i);
    expect(correctionsBlock([aphid])).toContain("- aphid: no local word (if you list this term, give it an empty derja)");
    expect(correctionsBlock([aphid])!.split("\n")[0]).toBe("The grower's own derja words, a glossary for the terms that belong in this diagnosis; use these exactly:");
  });
});
