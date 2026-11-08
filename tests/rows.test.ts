// The rows the routes write themselves once Claude has answered (Phase 14, review 2.1): the fields
// the app sends for them, validated, and the writes against the in-memory tables.
import { describe, expect, it } from "vitest";
import { parseAskRequest, questionRow } from "../api/ask.js";
import { checkRow, parseCheckRequest } from "../api/check.js";
import { parseDiagnoseRequest, photoRow } from "../api/diagnose.js";
import { isInstant, storeRow } from "../api/_rows.js";
import type { Answer, PlantingCheck, ProblemAiResult, Usage } from "../src/types";
import { makeClient, makeState } from "./mockdb";

const PLANT = "11111111-1111-4111-8111-111111111111";
const ROW = "22222222-2222-4222-8222-222222222222";
const THREAD = "33333333-3333-4333-8333-333333333333";
const SPECIES = "44444444-4444-4444-8444-444444444444";
const AT = "2026-11-08T09:30:00.000Z";
const image = { media_type: "image/jpeg" as const, data: "abc" };

const usage: Usage = { model: "claude-fable-5-1", input_tokens: 10, output_tokens: 20, thinking_tokens: 5, cache_read_input_tokens: 0, cache_creation_input_tokens: 0 };

describe("the row fields", () => {
  it("take the question's row when all three are given, refuse a partial or malformed set, and allow none", () => {
    const base = { plant_id: PLANT, question: "Why yellow?" };
    expect(parseAskRequest(base)).toMatchObject({ row: null });
    expect(parseAskRequest({ ...base, id: ROW, thread_id: THREAD, asked_at: AT })).toMatchObject({ row: { id: ROW, thread_id: THREAD, asked_at: AT } });
    expect(parseAskRequest({ ...base, id: ROW })).toMatch(/go together/);
    expect(parseAskRequest({ ...base, id: "x", thread_id: THREAD, asked_at: AT })).toMatch(/id must be a UUID/);
    expect(parseAskRequest({ ...base, id: ROW, thread_id: "y", asked_at: AT })).toMatch(/thread_id/);
    expect(parseAskRequest({ ...base, id: ROW, thread_id: THREAD, asked_at: "yesterday" })).toMatch(/asked_at/);
  });

  it("take the check's row when both are given, and refuse a half", () => {
    expect(parseCheckRequest({ species_id: SPECIES })).toMatchObject({ row: null });
    expect(parseCheckRequest({ species_id: SPECIES, id: ROW, checked_at: AT })).toMatchObject({ row: { id: ROW, checked_at: AT } });
    expect(parseCheckRequest({ species_id: SPECIES, id: ROW })).toMatch(/checked_at/);
    expect(parseCheckRequest({ species_id: SPECIES, checked_at: AT })).toMatch(/id must be a UUID/);
  });

  it("take the diagnosis's planned photo only under the plant's own folder", () => {
    const base = { plant_id: PLANT, images: [image] };
    expect(parseDiagnoseRequest(base)).toMatchObject({ photo: null, note: "" });
    expect(parseDiagnoseRequest({ ...base, note: "  spots \n on leaves " })).toMatchObject({ note: "spots on leaves" });
    const photo = { id: ROW, storage_path: `${PLANT}/1762590600000.jpg`, taken_at: AT };
    expect(parseDiagnoseRequest({ ...base, photo })).toMatchObject({ photo });
    expect(parseDiagnoseRequest({ ...base, photo: { ...photo, storage_path: `${SPECIES}/1762590600000.jpg` } })).toMatch(/storage_path/);
    expect(parseDiagnoseRequest({ ...base, photo: { ...photo, storage_path: `${PLANT}/x.jpg` } })).toMatch(/storage_path/);
    expect(parseDiagnoseRequest({ ...base, photo: { ...photo, id: "nope" } })).toMatch(/photo.id/);
    expect(parseDiagnoseRequest({ ...base, photo: { ...photo, taken_at: "2099-01-01T00:00:00Z" } })).toMatch(/taken_at/);
    expect(parseDiagnoseRequest({ plant_id: PLANT, images: [] })).toMatch(/1 or 2 images/);
  });

  it("read an instant that is not far in the future", () => {
    const now = new Date("2026-11-08T10:00:00Z");
    expect(isInstant("2026-11-01T10:00:00Z", now)).toBe(true);
    expect(isInstant("2026-11-09T09:00:00Z", now)).toBe(true);
    // A camera's clock a few days ahead still gives an instant the row can carry; a year ahead does not.
    expect(isInstant("2026-11-12T10:00:01Z", now)).toBe(true);
    expect(isInstant("2027-11-10T10:00:01Z", now)).toBe(false);
    expect(isInstant("not a time", now)).toBe(false);
    expect(isInstant(12, now)).toBe(false);
  });
});

describe("the rows the routes write", () => {
  const answer: Answer & Usage = { answer: "Water less.", profile_note: "", follow_ups: ["When?"], ...usage };
  const check: PlantingCheck & Usage = {
    factors: [],
    verdict: "plant",
    best_site: "farm",
    summary: "Fine.",
    placement: "",
    planting_time: "",
    buying_tips: "",
    first_year: "",
    alternatives: [],
    ...usage,
  };
  const diagnosis: ProblemAiResult = {
    summary: "Chlorosis.",
    likely_causes: [],
    checks_to_do: [],
    organic_treatment: "",
    prevention: "",
    urgency: "watch",
    rephotograph_in_days: 7,
    note: "spots",
    ...usage,
  };

  it("shape the rows as the app would write them, and none from an older build", () => {
    const ask = parseAskRequest({ plant_id: PLANT, question: " Why  yellow? ", id: ROW, thread_id: THREAD, asked_at: AT });
    if (typeof ask === "string") throw new Error(ask);
    expect(questionRow(ask, answer)).toEqual({ id: ROW, plant_id: PLANT, thread_id: THREAD, asked_at: AT, question: "Why yellow?", answer });
    expect(questionRow({ ...ask, row: null }, answer)).toBeNull();

    const chk = parseCheckRequest({ species_id: SPECIES, site: "farm", zone: " row 2 ", note: "shade", id: ROW, checked_at: AT });
    if (typeof chk === "string") throw new Error(chk);
    expect(checkRow(chk, check)).toEqual({ id: ROW, species_id: SPECIES, checked_at: AT, site: "farm", zone: "row 2", note: "shade", result: check });

    const path = `${PLANT}/1762590600000.jpg`;
    const dia = parseDiagnoseRequest({ plant_id: PLANT, images: [image], note: "spots", photo: { id: ROW, storage_path: path, taken_at: AT } });
    if (typeof dia === "string") throw new Error(dia);
    expect(photoRow(dia, diagnosis)).toEqual({ id: ROW, plant_id: PLANT, taken_at: AT, storage_path: path, kind: "problem", ai_result: diagnosis, note: "spots" });
  });

  it("write the row once, read a row already there as written, and never fail the call", async () => {
    const state = makeState();
    const db = makeClient(state);
    const row = { id: ROW, plant_id: PLANT, thread_id: THREAD, asked_at: AT, question: "Why?", answer };
    expect(await storeRow(db, "questions", row)).toBe(true);
    // The app saved first (or the route is asked twice): the unique id reads as saved.
    expect(await storeRow(db, "questions", { ...row, question: "Changed?" })).toBe(true);
    expect(state.questions).toHaveLength(1);
    expect(state.questions[0].question).toBe("Why?");

    const failing = makeClient(state, {
      onQuery: () => {
        throw new Error("relation questions does not exist");
      },
    });
    expect(await storeRow(failing, "questions", row)).toBe(false);
  });
});
