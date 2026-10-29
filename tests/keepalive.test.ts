// The keep-alive of a long Claude call (api/_http.ts) against a stand-in for Vercel's response object.
import { EventEmitter } from "node:events";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { KEEPALIVE_AFTER_MS, KEEPALIVE_EVERY_MS, keepAlive, reply, type VercelResponse } from "../api/_http.js";
import { sendError } from "../api/_supabase.js";

/** The members of Node's ServerResponse and Vercel's helpers that keepAlive and reply touch. */
class FakeResponse extends EventEmitter {
  statusCode = 200;
  headersSent = false;
  writableEnded = false;
  destroyed = false;
  headers: Record<string, string> = {};
  chunks: string[] = [];

  setHeader(name: string, value: string) {
    if (this.headersSent) throw new Error("ERR_HTTP_HEADERS_SENT");
    this.headers[name.toLowerCase()] = value;
    return this;
  }
  write(chunk: string) {
    this.headersSent = true;
    this.chunks.push(chunk);
    return true;
  }
  end(chunk?: string) {
    this.headersSent = true;
    if (chunk) this.chunks.push(chunk);
    this.writableEnded = true;
    return this;
  }
  status(code: number) {
    this.statusCode = code;
    return this;
  }
  json(body: unknown) {
    this.setHeader("Content-Type", "application/json; charset=utf-8");
    return this.end(JSON.stringify(body));
  }
  get body() {
    return this.chunks.join("");
  }
}

function fake(): { res: VercelResponse; raw: FakeResponse } {
  const raw = new FakeResponse();
  return { res: raw as unknown as VercelResponse, raw };
}

beforeEach(() => {
  vi.useFakeTimers();
});

afterEach(() => {
  vi.useRealTimers();
});

describe("keepAlive", () => {
  it("leaves a quick reply alone, with its own status", () => {
    const { res, raw } = fake();
    keepAlive(res);
    vi.advanceTimersByTime(KEEPALIVE_AFTER_MS - 1);
    sendError(res, 404, "No profile for this species yet");
    expect(raw.statusCode).toBe(404);
    expect(JSON.parse(raw.body)).toEqual({ error: "No profile for this species yet" });
    vi.advanceTimersByTime(10 * KEEPALIVE_EVERY_MS);
    expect(raw.chunks).toHaveLength(1);
  });

  it("sends the 200 early, then a space at each beat, and the JSON last", () => {
    const { res, raw } = fake();
    keepAlive(res);
    vi.advanceTimersByTime(KEEPALIVE_AFTER_MS);
    expect(raw.headersSent).toBe(true);
    expect(raw.statusCode).toBe(200);
    expect(raw.headers["content-type"]).toBe("application/json; charset=utf-8");
    expect(raw.headers["cache-control"]).toContain("no-transform");
    expect(raw.chunks).toEqual([" "]);

    vi.advanceTimersByTime(4 * KEEPALIVE_EVERY_MS);
    expect(raw.chunks).toEqual([" ", " ", " ", " ", " "]);

    reply(res, 200, { species: { id: "s1" }, created: true });
    expect(raw.writableEnded).toBe(true);
    // Leading whitespace is valid JSON: the app parses the body as before.
    expect(JSON.parse(raw.body)).toEqual({ species: { id: "s1" }, created: true });
    vi.advanceTimersByTime(10 * KEEPALIVE_EVERY_MS);
    expect(raw.chunks).toHaveLength(6);
  });

  it("puts an error after the 200 in the body, with its status", () => {
    const { res, raw } = fake();
    keepAlive(res);
    vi.advanceTimersByTime(KEEPALIVE_AFTER_MS + KEEPALIVE_EVERY_MS);
    sendError(res, 502, "InternalServerError: overloaded");
    expect(raw.statusCode).toBe(200);
    expect(JSON.parse(raw.body)).toEqual({ error: "InternalServerError: overloaded", status: 502 });
  });

  it("stops when the client goes away", () => {
    const { res, raw } = fake();
    keepAlive(res);
    vi.advanceTimersByTime(KEEPALIVE_AFTER_MS);
    raw.destroyed = true;
    raw.emit("close");
    vi.advanceTimersByTime(10 * KEEPALIVE_EVERY_MS);
    expect(raw.chunks).toEqual([" "]);
  });

  it("starts once per response", () => {
    const { res, raw } = fake();
    keepAlive(res);
    keepAlive(res);
    vi.advanceTimersByTime(KEEPALIVE_AFTER_MS + KEEPALIVE_EVERY_MS);
    expect(raw.chunks).toEqual([" ", " "]);
  });
});
