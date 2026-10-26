// The species screen's "Before planting" card: the latest planting check with Open and Check again,
// or the button for a first one. Without the planting_checks table it offers the check only; a
// failed read says so with Retry rather than claim the species was never checked.
import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { ClipboardCheck } from "lucide-react";
import { t } from "../../i18n";
import { storedCheck, VERDICT_PILL } from "../../lib/check";
import { ChecksUnavailable, listChecks } from "../../lib/db";
import type { PlantingCheck, PlantingCheckRow, Usage } from "../../types";

interface Latest {
  row: PlantingCheckRow;
  result: PlantingCheck & Usage;
}

export function BeforePlantingCard({ speciesId }: { speciesId: string }) {
  const [latest, setLatest] = useState<Latest | null | undefined>(undefined);
  const [failed, setFailed] = useState(false);
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    let active = true;
    listChecks(speciesId)
      .then((rows) => {
        if (!active) return;
        for (const row of rows) {
          const result = storedCheck(row.result);
          if (result) {
            setLatest({ row, result });
            return;
          }
        }
        setLatest(null);
      })
      .catch((err: unknown) => {
        if (!active) return;
        if (err instanceof ChecksUnavailable) setLatest(null);
        else setFailed(true);
      });
    return () => {
      active = false;
    };
  }, [speciesId, attempt]);

  function retry() {
    setFailed(false);
    setAttempt((n) => n + 1);
  }

  if (failed) {
    return (
      <section className="card stack">
        <h2 style={{ margin: 0 }}>{t.check.sectionTitle}</h2>
        <div className="row between wrap">
          <span className="small muted grow">{t.check.cardFailed}</span>
          <button type="button" className="small" onClick={retry}>
            {t.common.retry}
          </button>
        </div>
      </section>
    );
  }
  if (latest === undefined) return null;
  const where = latest?.row.site ? `${t.site[latest.row.site]}${latest.row.zone ? ` · ${latest.row.zone}` : ""}` : t.check.bothSites;

  return (
    <section className="card stack">
      <h2 style={{ margin: 0 }}>{t.check.sectionTitle}</h2>
      {latest ? (
        <>
          <div className="row wrap" style={{ gap: 8, alignItems: "center" }}>
            <span className={VERDICT_PILL[latest.result.verdict]}>
              <ClipboardCheck size={14} aria-hidden />
              {t.check.verdicts[latest.result.verdict]}
            </span>
            <span className="small muted">
              {where} · {t.check.checkedOn(new Date(latest.row.checked_at).toLocaleDateString())}
            </span>
          </div>
          {latest.result.summary && <p className="small clamp-3" style={{ margin: 0 }}>{latest.result.summary}</p>}
          <div className="row">
            <Link to={`/check?species=${speciesId}&check=${latest.row.id}`} className="btn small grow">
              {t.check.openCheck}
            </Link>
            <Link to={`/check?species=${speciesId}`} className="btn small grow">
              {t.check.again}
            </Link>
          </div>
        </>
      ) : (
        <>
          <p className="small muted" style={{ margin: 0 }}>
            {t.check.none}
          </p>
          <Link to={`/check?species=${speciesId}`} className="btn block">
            <ClipboardCheck size={18} aria-hidden />
            {t.check.open}
          </Link>
        </>
      )}
    </section>
  );
}
