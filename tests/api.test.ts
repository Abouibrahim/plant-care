// The app's calls to the functions (src/lib/api.ts): a reply sent behind the keep-alive, and the
// profile looked up after its reply was lost, with fetch and the Supabase session mocked.
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { ProfileRequest } from "../src/types";

const signOut = vi.fn(async () => ({ error: null }));

vi.mock("../src/lib/supabase", () => ({
  supabase: {
    auth: {
      getSession: async () => ({ data: { session: { access_token: "token" } } }),
      signOut,
    },
  },
  PHOTOS_BUCKET: "photos",
  supabaseConfigured: true,
}));

const { api, ApiError, callApi } = await import("../src/lib/api");

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

  it("gives the original error once the function must have stopped", async () => {
    const { fetchMock } = mockFetch([lost(), ...Array.from({ length: 40 }, notYet)]);
    const result = api.profile(pear);
    const settled = result.catch((e: unknown) => e);
    await vi.advanceTimersByTimeAsync(300_000);
    const err = await settled;
    expect(err).toBeInstanceOf(ApiError);
    expect(err).toMatchObject({ status: 0, message: "Failed to fetch" });
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
