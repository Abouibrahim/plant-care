// Request and response types for the functions under `api/`, declared over Node's `http` module.
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
