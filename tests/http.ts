// A stand-in for Vercel's response object, shared by the tests of the keep-alive and of the routes.
import { EventEmitter } from "node:events";
import type { VercelResponse } from "../api/_http.js";

/** The members of Node's ServerResponse and Vercel's helpers that keepAlive, reply and the routes touch. */
export class FakeResponse extends EventEmitter {
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

export function fake(): { res: VercelResponse; raw: FakeResponse } {
  const raw = new FakeResponse();
  return { res: raw as unknown as VercelResponse, raw };
}
