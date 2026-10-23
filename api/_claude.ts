// Anthropic client and the one JSON call shape every route uses:
// cached site context + call rules in `system`, images then text in the user turn,
// structured output against the matching prompts/*.schema.json, all inside the
// function's wall-clock budget so Vercel never kills a call half-way.
import Anthropic from "@anthropic-ai/sdk";
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import type { Usage } from "../src/types.js";

export const MODEL = "claude-sonnet-5-5";

/** Wall-clock budget of one invocation; vercel.json sets maxDuration 300 s. Lower both together. */
export const FUNCTION_BUDGET_MS = 280_000;
/** No attempt starts with less than this left. */
const MIN_ATTEMPT_MS = 20_000;
/** A retry (transient error or doubled max_tokens) needs at least this much time left. */
const RETRY_NEEDS_MS = 60_000;

function promptPath(name: string): string {
  const here = path.dirname(fileURLToPath(import.meta.url));
  const beside = path.join(here, "..", "prompts", name);
  if (existsSync(beside)) return beside;
  return path.join(process.cwd(), "prompts", name);
}

const promptCache = new Map<string, string>();

export function readPrompt(name: string): string {
  let text = promptCache.get(name);
  if (text === undefined) {
    text = readFileSync(promptPath(name), "utf8");
    promptCache.set(name, text);
  }
  return text;
}

export function readSchema(name: string): Record<string, unknown> {
  return JSON.parse(readPrompt(name)) as Record<string, unknown>;
}

let client: Anthropic | undefined;
function getClient(): Anthropic {
  if (!client) {
    const apiKey = process.env.ANTHROPIC_API_KEY;
    if (!apiKey) throw new Error("Server is not configured: ANTHROPIC_API_KEY is missing");
    // Retries are owned by callJson so they stay inside the function budget.
    client = new Anthropic({ apiKey, maxRetries: 0 });
  }
  return client;
}

export type Effort = "low" | "medium" | "high";

export type CallResult<T> = { ok: true; data: T; usage: Usage } | { ok: false; refusal: string; usage: Usage };

export const ZERO_USAGE: Usage = {
  model: null,
  input_tokens: 0,
  output_tokens: 0,
  thinking_tokens: 0,
  cache_read_input_tokens: 0,
  cache_creation_input_tokens: 0,
};

function usageOf(msg: Anthropic.Message): Usage {
  return {
    model: msg.model,
    input_tokens: msg.usage.input_tokens,
    output_tokens: msg.usage.output_tokens,
    thinking_tokens: msg.usage.output_tokens_details?.thinking_tokens ?? 0,
    cache_read_input_tokens: msg.usage.cache_read_input_tokens ?? 0,
    cache_creation_input_tokens: msg.usage.cache_creation_input_tokens ?? 0,
  };
}

function addUsage(a: Usage, b: Usage): Usage {
  return {
    model: b.model,
    input_tokens: a.input_tokens + b.input_tokens,
    output_tokens: a.output_tokens + b.output_tokens,
    thinking_tokens: a.thinking_tokens + b.thinking_tokens,
    cache_read_input_tokens: a.cache_read_input_tokens + b.cache_read_input_tokens,
    cache_creation_input_tokens: a.cache_creation_input_tokens + b.cache_creation_input_tokens,
  };
}

function textOf(msg: Anthropic.Message): string {
  return msg.content
    .filter((b): b is Anthropic.TextBlock => b.type === "text")
    .map((b) => b.text)
    .join("")
    .trim();
}

function isTransient(err: unknown): boolean {
  return (
    err instanceof Anthropic.RateLimitError ||
    err instanceof Anthropic.InternalServerError ||
    err instanceof Anthropic.APIConnectionError
  );
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/** Milliseconds from a retry-after header on an API error, or null. */
function retryAfterMs(err: unknown): number | null {
  const headers = (err as { headers?: { get?: (name: string) => string | null } }).headers;
  const raw = headers?.get?.("retry-after");
  const seconds = raw ? Number(raw) : NaN;
  return Number.isFinite(seconds) && seconds > 0 ? seconds * 1000 : null;
}

/**
 * One structured-output call. Retries once with double max_tokens when the output is cut and
 * once on a transient API error, but only while the function budget allows it; returns the
 * refusal text when Claude declines; otherwise parses the first text block.
 */
export async function callJson<T>(opts: {
  rules: string;
  schema: Record<string, unknown>;
  content: Anthropic.ContentBlockParam[];
  maxTokens: number;
  effort?: Effort;
}): Promise<CallResult<T>> {
  const anthropic = getClient();
  const deadline = Date.now() + FUNCTION_BUDGET_MS;
  let maxTokens = opts.maxTokens;
  let spent: Usage = { ...ZERO_USAGE, model: MODEL };
  let transientRetried = false;

  for (;;) {
    const remaining = deadline - Date.now();
    if (remaining < MIN_ATTEMPT_MS) throw new Error("Not enough time left for the Claude call; try again");
    const started = Date.now();

    let msg: Anthropic.Message;
    try {
      msg = await anthropic.messages.create(
        {
          model: MODEL,
          max_tokens: maxTokens,
          system: [
            { type: "text", text: readPrompt("system-context.md"), cache_control: { type: "ephemeral" } },
            { type: "text", text: opts.rules },
          ],
          messages: [{ role: "user", content: opts.content }],
          output_config: {
            format: { type: "json_schema", schema: opts.schema },
            effort: opts.effort ?? "medium",
          },
        },
        { timeout: remaining, maxRetries: 0 },
      );
    } catch (err) {
      if (!transientRetried && isTransient(err)) {
        // Honour retry-after on 429; the wait plus a full attempt must still fit the budget.
        const wait = retryAfterMs(err) ?? 1500;
        if (deadline - Date.now() - wait > RETRY_NEEDS_MS) {
          transientRetried = true;
          await sleep(wait);
          continue;
        }
      }
      throw err;
    }
    spent = addUsage(spent, usageOf(msg));

    if (msg.stop_reason === "max_tokens") {
      // Twice the output needs about twice the time: retry only when that still fits.
      const elapsed = Date.now() - started;
      if (maxTokens === opts.maxTokens && deadline - Date.now() > Math.max(RETRY_NEEDS_MS, 2 * elapsed)) {
        maxTokens *= 2;
        continue;
      }
      throw new Error(`Claude output was cut at ${maxTokens} tokens; try again`);
    }
    if (msg.stop_reason === "refusal") {
      const explanation = msg.stop_details?.type === "refusal" ? msg.stop_details.explanation : null;
      return { ok: false, refusal: textOf(msg) || explanation || "Claude declined this request.", usage: spent };
    }
    const text = textOf(msg);
    if (!text) throw new Error(`Claude returned no text (stop_reason ${msg.stop_reason})`);
    return { ok: true, data: JSON.parse(text) as T, usage: spent };
  }
}

/** Builds the user content: each image preceded by a short label, then the text. */
export function imagesThenText(
  images: Array<{ media_type: "image/jpeg" | "image/png" | "image/webp"; data: string }>,
  text: string,
): Anthropic.ContentBlockParam[] {
  const blocks: Anthropic.ContentBlockParam[] = [];
  images.forEach((img, i) => {
    blocks.push({ type: "text", text: `Image ${i + 1}:` });
    blocks.push({ type: "image", source: { type: "base64", media_type: img.media_type, data: img.data } });
  });
  blocks.push({ type: "text", text });
  return blocks;
}
