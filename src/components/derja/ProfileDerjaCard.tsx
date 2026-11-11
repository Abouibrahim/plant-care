import { Banner } from "../Banner";
import { Spinner } from "../Spinner";
import { t } from "../../i18n";
import type { WordSource } from "../../lib/derja";
import type { DerjaView } from "../../lib/useDerja";
import { DerjaWords } from "./DerjaWords";

interface Props {
  /** The terms that stand in this card's texts: one tab of a plant's page, or the whole species page. */
  rows: WordSource[];
  derja: DerjaView;
  /** The screen is busy (a save, a regeneration, an open editor): no fetch may start. */
  disabled?: boolean;
}

function shortDay(iso: string): string {
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? iso : d.toLocaleDateString(undefined, { day: "numeric", month: "short" });
}

/**
 * The "Derja words" card of a profile (Phase 17): the terms of the page with their words, and the
 * button that asks Claude for the species' list. While the species' list is unknown (the read is
 * under way or failed) there is no button: a failed read must never look like "not fetched yet"
 * and invite a second paid call.
 */
export function ProfileDerjaCard({ rows, derja, disabled = false }: Props) {
  const s = t.diagnose;
  if (derja.status === "off") return null;

  let note: string | null = null;
  if (derja.status === "loading") note = t.common.loading;
  else if (derja.status === "failed") note = s.derjaUnreadAll;
  else if (rows.length === 0) note = derja.species ? s.derjaNoneHere : s.derjaNotFetched;

  const footer =
    derja.status === "ready" ? (
      <div className="stack" style={{ marginTop: 10 }}>
        {derja.fetchError && <Banner kind="error">{derja.fetchError}</Banner>}
        <button type="button" className="block" onClick={() => void derja.fetchWords()} disabled={disabled || derja.fetching}>
          {derja.fetching ? <Spinner label={s.derjaFetching} /> : derja.species ? s.derjaRefresh : s.derjaGet}
        </button>
        {derja.species && !derja.fetching && <p className="small muted">{s.derjaFetchedOn(shortDay(derja.species.at))}</p>}
      </div>
    ) : null;

  return <DerjaWords rows={rows} onSaved={derja.saved} note={note} footer={footer} />;
}
