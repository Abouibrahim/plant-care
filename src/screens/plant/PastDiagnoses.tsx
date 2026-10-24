import { t } from "../../i18n";
import { problemResult, topCause, URGENCY_PILL } from "../../lib/diagnosis";
import type { Photo } from "../../types";

/** The plant's problem photos that carry a diagnosis, newest first; each opens its card. */
export function PastDiagnoses({ photos, onOpen }: { photos: Photo[]; onOpen: (photo: Photo) => void }) {
  const entries = photos
    .filter((p) => p.kind === "problem")
    .map((photo) => ({ photo, result: problemResult(photo.ai_result) }))
    .filter((e): e is { photo: Photo; result: NonNullable<ReturnType<typeof problemResult>> } => e.result !== null);

  return (
    <section className="section">
      <h2>{t.diagnose.pastTitle}</h2>
      {entries.length === 0 && <p className="muted">{t.diagnose.pastEmpty}</p>}
      {entries.map(({ photo, result }) => {
        const top = topCause(result);
        return (
          <button type="button" key={photo.id} className="card tappable" style={{ textAlign: "left", width: "100%", fontWeight: 400 }} onClick={() => onOpen(photo)}>
            <div className="row between" style={{ alignItems: "flex-start" }}>
              <div className="grow">
                <div className="small muted">{new Date(photo.taken_at).toLocaleDateString()}</div>
                {top && (
                  <div>
                    <strong>{top.cause}</strong> <span className="pill">{t.diagnose.kinds[top.kind]}</span>
                  </div>
                )}
                <div className="small clamp-2">{result.summary}</div>
              </div>
              <span className={URGENCY_PILL[result.urgency]} style={{ flexShrink: 0 }}>
                {t.diagnose.urgency[result.urgency]}
              </span>
            </div>
          </button>
        );
      })}
    </section>
  );
}
