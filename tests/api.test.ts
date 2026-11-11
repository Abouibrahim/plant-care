// The app's calls to the functions (src/lib/api.ts): a reply sent behind the keep-alive, the profile
// looked up after its reply was lost, and (Phase 14) the rows of Ask, Check and Diagnose found in the
// tables after a lost reply, with fetch mocked, the Supabase session mocked and the tables in memory.
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { ProfileRequest } from "../src/types";

const signOut = vi.fn(async () => ({ error: null }));

vi.mock("../src/lib/supabase", async () => {
  const { makeDb, sharedState } = await import("./mockdb");
  return {
    supabase: { ...makeDb(sharedState), auth: { getSession: async () => ({ data: { session: { access_token: "token" } } }), signOut } },
    PHOTOS_BUCKET: "photos",
    supabaseConfigured: true,
  };
});

const { api, callApi } = await import("../src/lib/api");
const { ApiError, LostReplyError } = await import("../src/lib/errors");
const { resetState, sharedState } = await import("./mockdb");

type Reply = { status: number; body: string } | Error;

/** fetch answering from a queue; each call's parsed body is kept. */
function mockFetch(replies: Reply[]) {
  const sent: Array<Record<string, unknown>> = [];
  const fetchMock = vi.fn(async (_url: string, init: RequestInit) => {
    sent.push(JSON.parse(init.body as string) as Record<string, unknown>);
    const next = replies.shift();
    if (!next) throw new Error("no reply queued");
    if (next instanceof Error) throw next;
    return new Response(next.body, { status: next.status });
  });
  vi.stubGlobal("fetch", fetchMock);
  return { fetchMock, sent };
}

const lost = () => new TypeError("Failed to fetch");
const notYet = (): Reply => ({ status: 404, body: JSON.stringify({ error: "No profile for this species yet" }) });
const species = { id: "s1", scientific_name: "Pyrus communis" };
const found = (): Reply => ({
  status: 200,
  body: JSON.stringify({ species, created: false, model: null, input_tokens: 0, output_tokens: 0 }),
});
const pear: ProfileRequest = { scientific_name: "Pyrus communis", cultivar: "", site: "backyard" };

beforeEach(() => {
  vi.useFakeTimers();
  signOut.mockClear();
  resetState(sharedState);
});

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

describe("callApi", () => {
  it("parses a body that follows the keep-alive's spaces", async () => {
    mockFetch([{ status: 200, body: "    " + JSON.stringify({ candidates: [] }) }]);
    await expect(callApi("identify", {})).resolves.toEqual({ candidates: [] });
  });

  it("reads an error sent after the 200 as its status", async () => {
    mockFetch([{ status: 200, body: "  " + JSON.stringify({ error: "InternalServerError: overloaded", status: 502 }) }]);
    const err = await callApi("profile", {}).catch((e: unknown) => e);
    expect(err).toBeInstanceOf(ApiError);
    expect(err).toMatchObject({ status: 502, message: "InternalServerError: overloaded" });
    expect(signOut).not.toHaveBeenCalled();
  });

  it("treats a 200 with only spaces as a lost reply", async () => {
    mockFetch([{ status: 200, body: "     " }]);
    await expect(callApi("profile", {})).rejects.toMatchObject({ status: 0 });
  });

  it("treats a body cut off on the way as a lost reply", async () => {
    const cut = new Response(
      new ReadableStream({
        start(controller) {
          controller.enqueue(new TextEncoder().encode("   "));
          controller.error(new TypeError("network error"));
        },
      }),
      { status: 200 },
    );
    vi.stubGlobal("fetch", vi.fn(async () => cut));
    await expect(callApi("profile", {})).rejects.toMatchObject({ status: 0 });
  });

  it("still signs out on a 401", async () => {
    mockFetch([{ status: 401, body: JSON.stringify({ error: "Unauthorized" }) }]);
    await expect(callApi("profile", {})).rejects.toMatchObject({ status: 401 });
    expect(signOut).toHaveBeenCalledOnce();
  });
});

describe("api.profile after a lost reply", () => {
  it("looks the stored profile up instead of writing it again", async () => {
    const { fetchMock, sent } = mockFetch([lost(), notYet(), notYet(), found()]);
    const onReconnecting = vi.fn();
    const result = api.profile(pear, { onReconnecting });
    await vi.advanceTimersByTimeAsync(20_000);
    await expect(result).resolves.toMatchObject({ species, created: false });
    expect(onReconnecting).toHaveBeenCalledOnce();
    expect(fetchMock).toHaveBeenCalledTimes(4);
    expect(sent[0].lookup_only).toBeUndefined();
    expect(sent.slice(1).every((b) => b.lookup_only === true && b.scientific_name === "Pyrus communis")).toBe(true);
  });

  it("keeps asking while the connection is still down", async () => {
    const { fetchMock } = mockFetch([lost(), lost(), lost(), found()]);
    const result = api.profile(pear);
    await vi.advanceTimersByTimeAsync(20_000);
    await expect(result).resolves.toMatchObject({ species });
    expect(fetchMock).toHaveBeenCalledTimes(4);
  });

  it("says the reply was lost once the function must have stopped", async () => {
    const { fetchMock } = mockFetch([lost(), ...Array.from({ length: 40 }, notYet)]);
    const result = api.profile(pear);
    const settled = result.catch((e: unknown) => e);
    await vi.advanceTimersByTimeAsync(300_000);
    const err = await settled;
    expect(err).toBeInstanceOf(LostReplyError);
    expect(err).toMatchObject({ status: 0 });
    // One lookup at once, then one every 10 s up to the function's 300 s, the last one after it.
    expect(fetchMock).toHaveBeenCalledTimes(32);
  });

  it("stops asking when the answer is no longer wanted", async () => {
    const { fetchMock } = mockFetch([lost(), notYet(), notYet(), notYet(), found()]);
    const stop = new AbortController();
    const settled = api.profile(pear, { signal: stop.signal }).catch((e: unknown) => e);
    await vi.advanceTimersByTimeAsync(10_000);
    stop.abort();
    await vi.advanceTimersByTimeAsync(60_000);
    expect(await settled).toMatchObject({ status: 0 });
    expect(fetchMock).toHaveBeenCalledTimes(3);
  });

  it("shows any other answer from the lookup", async () => {
    mockFetch([lost(), { status: 403, body: JSON.stringify({ error: "This account is not the owner of this app" }) }]);
    await expect(api.profile(pear)).rejects.toMatchObject({ status: 403 });
  });

  it("does not look up a regeneration or an answered error", async () => {
    const regen = mockFetch([lost()]);
    await expect(api.profile({ regenerate_species_id: "s1" })).rejects.toMatchObject({ status: 0 });
    expect(regen.fetchMock).toHaveBeenCalledOnce();

    const answered = mockFetch([{ status: 502, body: JSON.stringify({ error: "Claude output was cut" }) }]);
    await expect(api.profile(pear)).rejects.toMatchObject({ status: 502 });
    expect(answered.fetchMock).toHaveBeenCalledOnce();
  });
});

const PLANT = "11111111-1111-4111-8111-111111111111";
const ROW = "22222222-2222-4222-8222-222222222222";
const THREAD = "33333333-3333-4333-8333-333333333333";
const AT = "2026-11-08T09:00:00.000Z";
const usage = { model: "claude-fable-5-1", input_tokens: 10, output_tokens: 20, thinking_tokens: 5, cache_read_input_tokens: 0, cache_creation_input_tokens: 0 };

describe("a lost reply looked for in the tables (Phase 14)", () => {
  it("gives the row /api/ask wrote as the answer once it appears, without a second call", async () => {
    const { fetchMock } = mockFetch([lost()]);
    const settled = api.ask({ plant_id: PLANT, question: "Why?", id: ROW, thread_id: THREAD, asked_at: AT }).then(
      (r) => r,
      (e: unknown) => e,
    );
    await vi.advanceTimersByTimeAsync(5_000);
    sharedState.questions.push({ id: ROW, plant_id: PLANT, thread_id: THREAD, asked_at: AT, question: "Why?", answer: { answer: "Water less.", profile_note: "", follow_ups: [], ...usage } });
    await vi.advanceTimersByTimeAsync(10_000);
    expect(await settled).toMatchObject({ answer: "Water less." });
    expect(fetchMock).toHaveBeenCalledOnce();
  });

  it("gives the check and the diagnosis back the same way", async () => {
    mockFetch([lost()]);
    const check = api.check({ species_id: PLANT, id: ROW, checked_at: AT }).then(
      (r) => r,
      (e: unknown) => e,
    );
    sharedState.planting_checks.push({ id: ROW, species_id: PLANT, checked_at: AT, site: null, zone: "", note: "", result: { verdict: "plant", summary: "Fine.", ...usage } });
    await vi.advanceTimersByTimeAsync(1_000);
    expect(await check).toMatchObject({ verdict: "plant" });

    mockFetch([lost()]);
    const path = `${PLANT}/1762590600000.jpg`;
    const diagnosis = api
      .diagnose({ plant_id: PLANT, images: [{ media_type: "image/jpeg", data: "abc" }], photo: { id: ROW, storage_path: path, taken_at: AT } })
      .then(
        (r) => r,
        (e: unknown) => e,
      );
    sharedState.photos.push({
      id: ROW,
      plant_id: PLANT,
      taken_at: AT,
      storage_path: path,
      kind: "problem",
      ai_result: { summary: "Chlorosis.", likely_causes: [], checks_to_do: [], organic_treatment: "", prevention: "", urgency: "watch", rephotograph_in_days: 7, note: "", ...usage },
      note: "",
    });
    await vi.advanceTimersByTimeAsync(1_000);
    expect(await diagnosis).toMatchObject({ summary: "Chlorosis.", rephotograph_in_days: 7 });
  });

  it("does not look without a row id, and says when nothing came in time", async () => {
    const plain = mockFetch([lost()]);
    await expect(api.ask({ plant_id: PLANT, question: "Why?" })).rejects.toMatchObject({ status: 0 });
    expect(plain.fetchMock).toHaveBeenCalledOnce();

    mockFetch([lost()]);
    const settled = api.ask({ plant_id: PLANT, question: "Why?", id: ROW, thread_id: THREAD, asked_at: AT }).catch((e: unknown) => e);
    await vi.advanceTimersByTimeAsync(300_000);
    const err = await settled;
    expect(err).toBeInstanceOf(LostReplyError);
    expect(err).toMatchObject({ status: 0 });
  });

  it("stops at once when the panel is left, with the loss itself as the error", async () => {
    mockFetch([lost()]);
    const stop = new AbortController();
    const settled = api.check({ species_id: PLANT, id: ROW, checked_at: AT }, { signal: stop.signal }).catch((e: unknown) => e);
    await vi.advanceTimersByTimeAsync(2_000);
    stop.abort();
    await vi.advanceTimersByTimeAsync(20_000);
    const err = await settled;
    expect(err).toBeInstanceOf(ApiError);
    expect(err).not.toBeInstanceOf(LostReplyError);
  });
});

describe("a lost derja word list (Phase 17)", () => {
  const SPECIES = "5b1e9a20-1c2d-4e3f-8a9b-0c1d2e3f4a5b";
  const ASKED = "2026-11-12T08:00:00.000Z";
  const terms = [{ term: "Olive fly", derja: "ذبانة الزيتون" }];

  it("is found in its settings row by the time the app asked", async () => {
    const { fetchMock } = mockFetch([lost()]);
    const settled = api.derja({ species_id: SPECIES, asked_at: ASKED }).then(
      (r) => r,
      (e: unknown) => e,
    );
    await vi.advanceTimersByTimeAsync(5_000);
    sharedState.settings.push({ key: `derja:species:${SPECIES}`, value: { terms, at: "2026-11-12T08:00:20.000Z", asked_at: ASKED } });
    await vi.advanceTimersByTimeAsync(10_000);
    expect(await settled).toMatchObject({ terms, asked_at: ASKED, input_tokens: 0, output_tokens: 0 });
    expect(fetchMock).toHaveBeenCalledOnce();
  });

  it("does not take an older list for the answer of a refresh", async () => {
    mockFetch([lost()]);
    sharedState.settings.push({ key: `derja:species:${SPECIES}`, value: { terms, at: "2026-11-01T08:00:20.000Z", asked_at: "2026-11-01T08:00:00.000Z" } });
    const settled = api.derja({ species_id: SPECIES, asked_at: ASKED }).catch((e: unknown) => e);
    await vi.advanceTimersByTimeAsync(300_000);
    expect(await settled).toBeInstanceOf(LostReplyError);
  });
});
