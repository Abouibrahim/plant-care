import { t } from "../i18n";
import { SITE_ICONS, TASK_ICONS } from "../lib/icons";
import type { Site, TaskType } from "../types";

/** A rounded tile in the task type's colour with its icon; `t-<type>` sets the colour pair. */
export function TypeTile({ type, size = 44 }: { type: TaskType; size?: number }) {
  const Icon = TASK_ICONS[type];
  return (
    <span className={`type-tile t-${type}`} style={{ width: size, height: size }} aria-hidden>
      <Icon size={Math.round(size * 0.5)} strokeWidth={2} />
    </span>
  );
}

/** The type as a small coloured pill with its icon, for lists that show the type in words. */
export function TypePill({ type }: { type: TaskType }) {
  const Icon = TASK_ICONS[type];
  return (
    <span className={`pill type-pill t-${type}`}>
      <Icon size={14} strokeWidth={2.25} aria-hidden />
      {t.enums.task_type[type]}
    </span>
  );
}

/** The site's name with its icon (tractor for the farm, house for the backyard). */
export function SiteLabel({ site, size = 16 }: { site: Site; size?: number }) {
  const Icon = SITE_ICONS[site];
  return (
    <span className="site-label">
      <Icon size={size} strokeWidth={2} aria-hidden />
      {t.site[site]}
    </span>
  );
}
