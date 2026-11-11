import { useState, type FormEvent } from "react";
import { Banner } from "../../components/Banner";
import { Spinner } from "../../components/Spinner";
import { t } from "../../i18n";
import { removeCorrection, saveCorrection } from "../../lib/db";
import { cleanWord, type WordSource } from "../../lib/derja";
import { describeError } from "../../lib/errors";
import type { Correction } from "../../types";
import { DerjaWord } from "./DerjaText";

interface Props {
  rows: WordSource[];
  /** After a correction was saved or removed: the list as stored. */
  onSaved: (list: Correction[]) => void;
}

/**
 * The key terms of a diagnosis with the word to say in Tunisian (Phase 16): the grower's prompter
 * before speaking to a worker or a supplier, and the place where a word is corrected, cleared,
 * added, or given back to Claude's.
 */
export function DerjaWords({ rows, onSaved }: Props) {
  const [editing, setEditing] = useState<string | null>(null);
  const [draft, setDraft] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const s = t.diagnose;

  if (rows.length === 0) return null;

  function open(row: WordSource) {
    if (busy) return;
    setEditing(row.key);
    setDraft(row.word);
    setError(null);
  }

  async function run(write: () => Promise<Correction[]>) {
    setBusy(true);
    setError(null);
    try {
      onSaved(await write());
      setEditing(null);
    } catch (err) {
      // The editor stays open with the typed word, so nothing is retyped once the signal is back.
      setError(`${s.derjaSaveFailed}: ${describeError(err)}`);
    } finally {
      setBusy(false);
    }
  }

  function save(e: FormEvent, row: WordSource) {
    e.preventDefault();
    if (busy) return;
    if (draft.trim() !== "" && cleanWord(draft) === "") {
      setError(s.derjaNotArabic);
      return;
    }
    void run(() => saveCorrection(row.key, draft));
  }

  return (
    <section className="card">
      <h3>{s.derjaTitle}</h3>
      <ul className="derja-rows">
        {rows.map((row) => (
          <li key={row.key}>
            {editing === row.key ? (
              <form className="derja-edit" onSubmit={(e) => save(e, row)}>
                <span className="small muted">{row.label}</span>
                <input
                  className="arabic"
                  dir="rtl"
                  lang="aeb"
                  value={draft}
                  onChange={(e) => setDraft(e.target.value)}
                  aria-label={s.derjaField(row.label)}
                  autoComplete="off"
                  autoCorrect="off"
                  autoCapitalize="none"
                  spellCheck={false}
                  enterKeyHint="done"
                  maxLength={60}
                  autoFocus
                />
                {error && <Banner kind="error">{error}</Banner>}
                <div className="row">
                  <button type="submit" className="primary small" disabled={busy}>
                    {busy ? <Spinner /> : t.common.save}
                  </button>
                  <button type="button" className="small" onClick={() => setEditing(null)} disabled={busy}>
                    {t.common.cancel}
                  </button>
                  {(row.state === "yours" || row.state === "none") && row.listed && (
                    <button type="button" className="link small" onClick={() => void run(() => removeCorrection(row.key))} disabled={busy}>
                      {s.derjaUseClaude}
                    </button>
                  )}
                </div>
              </form>
            ) : (
              <button type="button" className="derja-row" onClick={() => open(row)} disabled={busy}>
                <span className="grow">{row.label}</span>
                {row.word ? <DerjaWord word={row.word} /> : <span className="muted small">{row.state === "none" ? s.derjaNone : s.derjaAdd}</span>}
                {row.state === "yours" && <span className="muted small">{s.derjaYours}</span>}
              </button>
            )}
          </li>
        ))}
      </ul>
    </section>
  );
}
