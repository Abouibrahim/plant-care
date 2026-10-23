// Anthropic client and the one JSON call shape every route uses:
// cached site context + call rules in `system`, images then text in the user turn,
// structured output against the matching prompts/*.schema.json.
import Anthropic from "@anthropic-ai/sdk";
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import type { Usage } from "../src/types";

export const MODEL = "claude-sonnet-5-5";

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
    client = new Anthropic({ apiKey, maxRetries: 1, timeout: 110_000 });
  }
  return client;
}

export type Effort = "low" | "medium" | "high";

export type CallResult<T> = { ok: true; data: T; usage: Usage } | { ok: false; refusal: string; usage: Usage };

function usageOf(msg: Anthropic.Message): Usage {
  return {
    model: msg.model,
    input_tokens: msg.usage.input_tokens,
    output_tokens: msg.usage.output_tokens,
    cache_read_input_tokens: msg.usage.cache_read_input_tokens ?? 0,
    cache_creation_input_tokens: msg.usage.cache_creation_input_tokens ?? 0,
  };
}

function addUsage(a: Usage, b: Usage): Usage {
  return {
    model: b.model,
    input_tokens: a.input_tokens + b.input_tokens,
    output_tokens: a.output_tokens + b.output_tokens,
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

/**
 * One structured-output call. Retries once with double max_tokens when the output is cut,
 * returns the refusal text when Claude declines, and parses the first text block otherwise.
 */
export async function callJson<T>(opts: {
  rules: string;
  schema: Record<string, unknown>;
  content: Anthropic.ContentBlockParam[];
  maxTokens: number;
  effort?: Effort;
}): Promise<CallResult<T>> {
  const anthropic = getClient();
  let maxTokens = opts.maxTokens;
  let spent: Usage = { model: MODEL, input_tokens: 0, output_tokens: 0, cache_read_input_tokens: 0, cache_creation_input_tokens: 0 };

  for (let attempt = 0; attempt < 2; attempt++) {
    const msg = await anthropic.messages.create({
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
    });
    spent = addUsage(spent, usageOf(msg));

    if (msg.stop_reason === "max_tokens") {
      if (attempt === 0) {
        maxTokens *= 2;
        continue;
      }
      throw new Error(`Claude output was cut at ${maxTokens} tokens`);
    }
    if (msg.stop_reason === "refusal") {
      const explanation = msg.stop_details?.type === "refusal" ? msg.stop_details.explanation : null;
      return { ok: false, refusal: textOf(msg) || explanation || "Claude declined this request.", usage: spent };
    }
    const text = textOf(msg);
    if (!text) throw new Error(`Claude returned no text (stop_reason ${msg.stop_reason})`);
    return { ok: true, data: JSON.parse(text) as T, usage: spent };
  }
  throw new Error("unreachable");
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
