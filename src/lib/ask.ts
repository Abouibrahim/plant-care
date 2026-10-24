// What the app derives from Ask Claude: an answer read back from a questions row (or checked
// as it arrives), and the earlier exchanges sent back with the next question.
import { ASK_MAX_HISTORY, type Answer, type AskTurn, type Usage } from "../types";

/** Follow-up questions shown under an answer. */
const MAX_FOLLOW_UPS = 3;

function num(v: unknown): number {
  return typeof v === "number" && Number.isFinite(v) ? v : 0;
}

/** The answer and its usage from a questions row or an /api/ask response, or null when it holds none. */
export function storedAnswer(raw: unknown): (Answer & Usage) | null {
  if (!raw || typeof raw !== "object") return null;
  const r = raw as Partial<Record<keyof (Answer & Usage), unknown>>;
  if (typeof r.answer !== "string" || !r.answer.trim()) return null;
  return {
    answer: r.answer.trim(),
    profile_note: typeof r.profile_note === "string" ? r.profile_note.trim() : "",
    follow_ups: Array.isArray(r.follow_ups)
      ? r.follow_ups
          .filter((q): q is string => typeof q === "string" && q.trim() !== "")
          .map((q) => q.trim())
          .slice(0, MAX_FOLLOW_UPS)
      : [],
    model: typeof r.model === "string" ? r.model : null,
    input_tokens: num(r.input_tokens),
    output_tokens: num(r.output_tokens),
    thinking_tokens: num(r.thinking_tokens),
    cache_read_input_tokens: num(r.cache_read_input_tokens),
    cache_creation_input_tokens: num(r.cache_creation_input_tokens),
  };
}

/** The exchanges to send back with the next question: answered ones only (no refusals), the last ASK_MAX_HISTORY. */
export function historyOf(turns: ReadonlyArray<{ question: string; answer: Answer | null }>): AskTurn[] {
  return turns
    .filter((turn): turn is { question: string; answer: Answer } => turn.answer !== null)
    .slice(-ASK_MAX_HISTORY)
    .map((turn) => ({ question: turn.question, answer: turn.answer.answer }));
}
