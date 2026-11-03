// A kind of work on Today (Phase 13): the heading of one kind at one site, with its tile, its name,
// its tasks and an "Overdue" flag when one is late, which folds the kind away for the day on a tap;
// beside it the button that shares the kind's list; then its cards. Folded cards stay mounted, only
// hidden, so an open Choose or a half-typed note survives a heading brushed by mistake. When every
// task of the kind is on its way out, the kind folds away with its last card.
import { useId, type ReactNode } from "react";
import { Check, ChevronDown, Share2, TriangleAlert } from "lucide-react";
import { t } from "../../i18n";
import { DueIcon } from "../../components/TaskCard";
import { TypeTile } from "../../components/TypeIcon";
import type { TaskType } from "../../types";

/** What a share button shows for a moment after its list was copied, or could be neither shared nor copied. */
export type ShareFlash = "copied" | "failed";

const FLASH_ICONS = { copied: Check, failed: TriangleAlert };

interface Props {
  type: TaskType;
  /** Its tasks, counted in rows as the site heading counts them. */
  tasks: number;
  /** One of them is late. */
  late: boolean;
  folded: boolean;
  /** Every one of its tasks is being saved. */
  leaving: boolean;
  /** Its share button's moment after a copy or a failure: the banners may be a screen above. */
  flash: ShareFlash | null;
  onToggle: () => void;
  onShare: () => void;
  children: ReactNode;
}

export function ActivitySection({ type, tasks, late, folded, leaving, flash, onToggle, onShare, children }: Props) {
  const bodyId = useId();
  const name = t.enums.task_type[type];
  const ShareIcon = flash ? FLASH_ICONS[flash] : Share2;
  return (
    <section className={`activity t-${type} ${leaving ? "leaving" : ""}`}>
      <div className="activity-clip">
        <div className="activity-head">
          <h3>
            <button
              type="button"
              className="activity-toggle"
              aria-expanded={!folded}
              aria-controls={bodyId}
              aria-label={t.today.activityLabel(name, tasks, late)}
              onClick={onToggle}
            >
              <TypeTile type={type} size={32} />
              {/* The words wrap within their own box, so on a long French heading or a large font the flag goes under the name and the chevron stays put. */}
              <span className="activity-text">
                <span className="activity-name">{name}</span>
                <span className="chip-count">{tasks}</span>
                {late && (
                  <span className="activity-late">
                    <DueIcon state="overdue" />
                    {t.today.overdue}
                  </span>
                )}
              </span>
              <ChevronDown size={20} className="activity-chevron" aria-hidden />
            </button>
          </h3>
          <button type="button" className={`icon-btn activity-share ${flash ?? ""}`} aria-label={t.today.shareList(name)} onClick={onShare}>
            <ShareIcon size={20} aria-hidden />
          </button>
        </div>
        <div className="activity-body" id={bodyId} hidden={folded}>
          {children}
        </div>
      </div>
    </section>
  );
}
