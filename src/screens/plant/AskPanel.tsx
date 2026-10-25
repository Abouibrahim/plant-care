// Ask Claude about one plant, as a full-screen panel over the Plant screen: a conversation whose
// answers /api/ask reads against the plant's own context. Each answered exchange is saved to the
// questions table and shows in the journal; reopened with a thread id, the panel loads that
// conversation and lets it go on. A refusal is shown but not saved.
import { useEffect, useRef, useState, type FormEvent, type KeyboardEvent } from "react";
import { Link } from "react-router-dom";
import { Send, X } from "lucide-react";
import { Banner } from "../../components/Banner";
import { Spinner } from "../../components/Spinner";
import { t } from "../../i18n";
import { api, ApiError } from "../../lib/api";
import { historyOf, storedAnswer } from "../../lib/ask";
import { insertQuestion, listThread, QuestionsUnavailable } from "../../lib/db";
import { useBackClose } from "../../lib/useBackClose";
import { ASK_MAX_QUESTION_CHARS, isRefusal, type Answer, type PlantWithSpecies, type Question, type Usage } from "../../types";

type SaveState = "saving" | "saved" | "failed" | "unavailable";

interface Turn {
  /** The questions row id, made when the answer arrived; also the React key. */
  id: string;
  question: string;
  askedAt: string;
  /** null when Claude declined. */
  answer: (Answer & Usage) | null;
  refusal: string | null;
  usage: Usage;
  /** null for a refusal, which is not saved. */
  save: SaveState | null;
}

interface Props {
  plant: PlantWithSpecies;
  /** A saved conversation to reopen; omitted, a new one starts. */
  threadId?: string | null;
  /** After an answer was saved: the screen reloads the journal. */
  onChanged: () => void;
  onClose: () => void;
}

function describeError(err: unknown): string {
  if (err instanceof ApiError) {
    if (err.status === 401) return t.errors.unauthorized;
    if (err.status === 0) return t.errors.network;
    return err.message || t.errors.generic;
  }
  if (err instanceof Error && err.message) return err.message;
  return t.errors.generic;
}

function usageOf(u: Usage): Usage {
  return {
    model: u.model,
    input_tokens: u.input_tokens,
    output_tokens: u.output_tokens,
    thinking_tokens: u.thinking_tokens,
    cache_read_input_tokens: u.cache_read_input_tokens,
    cache_creation_input_tokens: u.cache_creation_input_tokens,
  };
}

/** A saved exchange as a turn; null when the row holds no readable answer. */
function rowTurn(row: Question): Turn | null {
  const answer = storedAnswer(row.answer);
  if (!answer) return null;
  return { id: row.id, question: row.question, askedAt: row.asked_at, answer, refusal: null, usage: usageOf(answer), save: "saved" };
}

export function AskPanel({ plant, threadId = null, onChanged, onClose }: Props) {
  const [turns, setTurns] = useState<Turn[]>([]);
  const [loading, setLoading] = useState(threadId !== null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [loadKey, setLoadKey] = useState(0);
  const [input, setInput] = useState("");
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [newestKey, setNewestKey] = useState<string | null>(null);
  const mountedRef = useRef(true);
  // The conversation's id: the reopened one, or a new one made on the first question.
  const threadRef = useRef<string | null>(threadId);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const newestRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const mounted = mountedRef;
    mounted.current = true;
    const previous = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      mounted.current = false;
      document.body.style.overflow = previous;
    };
  }, []);

  useEffect(() => {
    if (!threadId) return;
    let active = true;
    listThread(threadId)
      .then((rows) => {
        if (!active) return;
        setTurns(rows.map(rowTurn).filter((turn): turn is Turn => turn !== null));
        setLoadError(null);
        setLoading(false);
      })
      .catch((err: unknown) => {
        if (!active) return;
        setLoadError(`${t.ask.loadFailed}: ${describeError(err)}`);
        setLoading(false);
      });
    return () => {
      active = false;
    };
  }, [threadId, loadKey]);

  // A new answer scrolls into view, its question at the top.
  useEffect(() => {
    if (newestKey) newestRef.current?.scrollIntoView({ block: "start", behavior: "smooth" });
  }, [newestKey]);

  const speciesName = plant.species.common_names.en || plant.species.scientific_name;
  const saving = turns.some((turn) => turn.save === "saving");
  const busy = sending || saving;
  const blocked = loading || loadError !== null;
  const unavailable = turns.some((turn) => turn.save === "unavailable");
  const last = turns.length > 0 ? turns[turns.length - 1] : null;
  // The back gesture closes the sheet like the Close button, and like it waits while a call runs.
  useBackClose(onClose, busy);

  function retryLoad() {
    setLoading(true);
    setLoadError(null);
    setLoadKey((k) => k + 1);
  }

  function fill(question: string) {
    setInput(question.slice(0, ASK_MAX_QUESTION_CHARS));
    inputRef.current?.focus();
  }

  function setSave(id: string, save: SaveState) {
    if (!mountedRef.current) return;
    setTurns((prev) => prev.map((turn) => (turn.id === id ? { ...turn, save } : turn)));
  }

  /**
   * Writes one exchange under its own id and time, so Save again after a question asked since
   * keeps it in place, and a save whose reply was lost is not written twice. The journal shows
   * it once the screen reloads.
   */
  async function save(turn: Turn) {
    const thread_id = threadRef.current;
    if (!thread_id || !turn.answer) return;
    setSave(turn.id, "saving");
    try {
      await insertQuestion({
        id: turn.id,
        plant_id: plant.id,
        thread_id,
        asked_at: turn.askedAt,
        question: turn.question,
        answer: turn.answer,
      });
      setSave(turn.id, "saved");
      onChanged();
    } catch (err) {
      setSave(turn.id, err instanceof QuestionsUnavailable ? "unavailable" : "failed");
    }
  }

  async function send(e?: FormEvent) {
    e?.preventDefault();
    const question = input.replace(/\s+/g, " ").trim();
    if (!question || busy || blocked) return;
    setSending(true);
    setError(null);
    try {
      const res = await api.ask({ plant_id: plant.id, question, history: historyOf(turns) });
      const refusal = isRefusal(res) ? res.refusal : null;
      const answer = refusal === null ? storedAnswer(res) : null;
      if (refusal === null && !answer) {
        if (mountedRef.current) setError(`${t.ask.failed}: ${t.errors.noData}`);
        return;
      }
      threadRef.current ??= crypto.randomUUID();
      const turn: Turn = {
        id: crypto.randomUUID(),
        question,
        askedAt: new Date().toISOString(),
        answer,
        refusal,
        usage: usageOf(res),
        save: answer ? "saving" : null,
      };
      // Left while Claude was answering (the back gesture, the profile link): the paid answer
      // still goes to the journal.
      if (!mountedRef.current) {
        if (answer) void save(turn);
        return;
      }
      setTurns((prev) => [...prev, turn]);
      setInput("");
      setNewestKey(turn.id);
      if (answer) void save(turn);
    } catch (err) {
      if (mountedRef.current) setError(`${t.ask.failed}: ${describeError(err)}`);
    } finally {
      if (mountedRef.current) setSending(false);
    }
  }

  /** Ctrl+Enter (or Cmd+Enter) sends; Enter alone is a new line, as on the phone. */
  function onKeyDown(e: KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key === "Enter" && (e.ctrlKey || e.metaKey)) {
      e.preventDefault();
      void send();
    }
  }

  // Starters before the first question; after it, the last answer's follow-ups not yet asked here.
  const asked = new Set(turns.map((turn) => turn.question.toLowerCase()));
  const suggestions =
    turns.length === 0
      ? blocked
        ? []
        : t.ask.starters
      : (last?.answer?.follow_ups ?? []).filter((q) => !asked.has(q.replace(/\s+/g, " ").trim().toLowerCase()));

  return (
    <div className="sheet" role="dialog" aria-modal="true" aria-label={t.ask.title}>
      <div className="screen">
        <div className="screen-header">
          <button type="button" className="icon-btn" onClick={onClose} disabled={busy} aria-label={t.common.close}>
            <X size={22} aria-hidden />
          </button>
          <h1>{t.ask.title}</h1>
        </div>
        <p className="muted small">
          {plant.tag} · {speciesName}
        </p>

        {loading && <Spinner label={t.ask.loading} />}
        {loadError && (
          <Banner kind="error">
            <div>{loadError}</div>
            <button type="button" className="small" style={{ marginTop: 8 }} onClick={retryLoad}>
              {t.common.retry}
            </button>
          </Banner>
        )}

        {!blocked && turns.length === 0 && (
          <>
            <p>{t.ask.intro(speciesName)}</p>
            <p className="muted small">{t.ask.photoHint}</p>
          </>
        )}

        <div aria-live="polite">
          {turns.map((turn) => (
            <div key={turn.id} className="qa" ref={turn.id === newestKey ? newestRef : undefined}>
              <div className="qa-question">{turn.question}</div>
              {turn.answer ? (
                <div className="card">
                  <div className="answer-text">{turn.answer.answer}</div>
                  {turn.answer.profile_note && (
                    <div className="banner warn" style={{ marginTop: 12 }}>
                      <div>
                        <strong>{t.ask.profileNote}:</strong> {turn.answer.profile_note}
                      </div>
                      <Link to={`/species/${plant.species.id}`} className="small">
                        {t.plant.profileLink}
                      </Link>
                    </div>
                  )}
                  <p className="muted small" style={{ margin: "8px 0 0" }}>
                    {t.ask.askedOn(new Date(turn.askedAt).toLocaleDateString())} ·{" "}
                    {t.capture.usage(turn.usage.input_tokens, turn.usage.output_tokens)}
                  </p>
                  {turn.save === "saving" && <p className="muted small">{t.ask.saving}</p>}
                  {turn.save === "failed" && (
                    <div className="row wrap" style={{ marginTop: 6 }}>
                      <span className="small">{t.ask.saveFailed}</span>
                      <button
                        type="button"
                        className="small"
                        onClick={() => void save(turn)}
                      >
                        {t.ask.saveAgain}
                      </button>
                    </div>
                  )}
                </div>
              ) : (
                <Banner kind="error">
                  <div>{t.ask.refusal}</div>
                  <p className="small" style={{ margin: "6px 0 0" }}>
                    {turn.refusal}
                  </p>
                  <p className="small muted" style={{ margin: "6px 0 0" }}>
                    {t.capture.usage(turn.usage.input_tokens, turn.usage.output_tokens)}
                  </p>
                </Banner>
              )}
            </div>
          ))}
        </div>

        {unavailable && <Banner kind="warn">{t.ask.unavailable}</Banner>}

        {suggestions.length > 0 && !sending && (
          <div className="chips" role="group" aria-label={turns.length === 0 ? t.ask.startersLabel : t.ask.followUps}>
            {suggestions.map((q) => (
              <button type="button" key={q} className="chip suggestion" onClick={() => fill(q)}>
                {q}
              </button>
            ))}
          </div>
        )}

        <form className="stack" onSubmit={(e) => void send(e)}>
          <label className="field">
            <span>{t.ask.label}</span>
            <textarea
              ref={inputRef}
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={onKeyDown}
              placeholder={t.ask.placeholder}
              maxLength={ASK_MAX_QUESTION_CHARS}
              rows={3}
              disabled={sending || blocked}
            />
          </label>
          {sending && <Spinner label={t.ask.sending} />}
          {error && <Banner kind="error">{error}</Banner>}
          <button type="submit" className="primary block" disabled={busy || blocked || !input.trim()}>
            <Send size={18} aria-hidden />
            {t.ask.send}
          </button>
        </form>
      </div>
    </div>
  );
}
