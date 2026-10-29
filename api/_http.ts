// Request and response types for the functions under `api/`, declared over Node's `http` module,
// and the keep-alive that holds a long Claude call's connection open.
// Vercel's Node runtime hands each function an `IncomingMessage` extended with `query`, `cookies` and
// the parsed `body`, and a `ServerResponse` extended with chaining `status`, `json` and `send` helpers.
// This file names only the members the routes use, so the `@vercel/node` package (types only, with
// audit findings in its dependencies) is not needed.
import type { IncomingMessage, ServerResponse } from "node:http";

export type VercelRequest = IncomingMessage & {
  /** Query-string parameters; a repeated key arrives as an array. */
  query: Partial<Record<string, string | string[]>>;
  cookies: Partial<Record<string, string>>;
  /** The parsed body (JSON for `application/json`); each route narrows it itself. */
  body: unknown;
};

export type VercelResponse = ServerResponse & {
  status(code: number): VercelResponse;
  json(body: unknown): VercelResponse;
  send(body: unknown): VercelResponse;
};

/** A reply quicker than this keeps its own status code; a longer Claude call starts the keep-alive. */
export const KEEPALIVE_AFTER_MS = 10_000;
/** Well inside the idle timeout of a mobile network (30 s on the strictest carrier NATs). */
export const KEEPALIVE_EVERY_MS = 15_000;

const keepAlives = new WeakMap<ServerResponse, ReturnType<typeof setTimeout>>();

function stopKeepAlive(res: ServerResponse): void {
  const timer = keepAlives.get(res);
  if (timer === undefined) return;
  clearTimeout(timer);
  keepAlives.delete(res);
}

/**
 * Keeps the connection of a long Claude call from going silent. A new species profile takes Claude a
 * minute or more, and a phone network drops a connection that carries nothing for that long: the
 * function finishes and stores the profile, and the phone gets "Network error". Once the call has run
 * KEEPALIVE_AFTER_MS the 200 and its headers go out, then a space every KEEPALIVE_EVERY_MS; leading
 * whitespace is valid JSON, so the body still parses. From then on `reply` puts an error in the body
 * as `{ error, status }`, which src/lib/api.ts reads as that status. Stops on `reply` or when the
 * client goes away (the function itself runs on: Vercel does not cancel it).
 */
export function keepAlive(res: ServerResponse): void {
  if (res.headersSent || keepAlives.has(res)) return;
  const beat = (first: boolean) => {
    if (res.writableEnded || res.destroyed) {
      keepAlives.delete(res);
      return;
    }
    if (first) {
      res.statusCode = 200;
      res.setHeader("Content-Type", "application/json; charset=utf-8");
      // no-transform: a proxy that compresses would hold the spaces back until the body ends.
      res.setHeader("Cache-Control", "no-store, no-transform");
      res.setHeader("X-Accel-Buffering", "no");
    }
    res.write(" ");
    keepAlives.set(res, setTimeout(() => beat(false), KEEPALIVE_EVERY_MS));
  };
  keepAlives.set(res, setTimeout(() => beat(true), KEEPALIVE_AFTER_MS));
  res.once("close", () => stopKeepAlive(res));
}

/** Sends the JSON reply, whether or not the keep-alive has already sent the 200. */
export function reply(res: VercelResponse, status: number, body: object): void {
  stopKeepAlive(res);
  if (!res.headersSent) {
    res.status(status).json(body);
    return;
  }
  if (res.writableEnded) return;
  res.end(JSON.stringify(status >= 400 ? { ...body, status } : body));
}
