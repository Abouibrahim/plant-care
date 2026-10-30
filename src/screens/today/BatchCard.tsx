// A zone batch on Today (Phase 11): the waterings of one zone that fall due together, in one card,
// "15 plants · row 2 · 216 L in all", with each amount's plants ("40 L · OL-01 OL-03"). Done and Skip
// close the plants still ticked in Choose; a plant unticked stays pending, and Today keeps the ticks
// so a reload of the list does not tick it again. Each plant in Choose opens its page on the
// Calendar tab, where a single card offers a snooze or a note.
import { useId, useState, type FormEvent } from "react";
import { Link } from "react-router-dom";
import { CalendarCheck, CalendarDays, Check, ChevronRight, ListChecks, MapPin, TriangleAlert, X } from "lucide-react";
import { t } from "../../i18n";
import { DUE_NOW, summarize, type Batch, type BatchPlant } from "../../lib/batches";
import { shortDate, weekdayDate } from "../../lib/today";
import { Burst, type TaskAction } from "../../components/TaskCard";
import { TypeTile } from "../../components/TypeIcon";
import { TASK_MAX_NOTE_CHARS, type TaskWithPlant } from "../../types";

/** What a batch's buttons do: Done, or Skip with a reason; never a snooze or a note. */
export type BatchAction = { kind: "done" } | { kind: "skip"; reason: string };

interface Props {
  batch: Batch<TaskWithPlant>;
  today: string;
  /** Tasks being saved, by id: when all of the batch's are, the card ticks (or slides) and folds away. */
  leaving: Record<string, TaskAction["kind"]>;
  /** Task ids of the plants unticked in Choose. */
  left: ReadonlySet<string>;
  onToggle: (plant: BatchPlant) => void;
  onAct: (ids: string[], action: BatchAction) => void;
}

/** Tags shown per amount while Choose is closed; the rest read "+N". */
const TAGS_SHOWN = 8;

const DUE_ICONS = { overdue: TriangleAlert, today: CalendarCheck, upcoming: CalendarDays };

function PlantTag({ plant, out }: { plant: BatchPlant; out: boolean }) {
  return (
    <span className={`tag ${out ? "out" : ""}`}>
      {plant.tag}
      {plant.quantity > 1 && ` ×${plant.quantity}`}
      {out && <span className="visually-hidden"> {t.today.leftOut}</span>}
    </span>
  );
}

export function BatchCard({ batch, today, leaving, left, onToggle, onAct }: Props) {
  const listId = useId();
  const [open, setOpen] = useState(false);
  const [mode, setMode] = useState<"idle" | "skip">("idle");
  const [reason, setReason] = useState("");

  const { tasks } = batch;
  const summary = summarize(tasks, today);
  const isOut = (plant: BatchPlant) => plant.task_ids.every((id) => left.has(id));
  const chosen = tasks.filter((x) => !left.has(x.id)).map((x) => x.id);
  const chosenPlants = summary.members.reduce((n, m) => n + (isOut(m) ? 0 : m.quantity), 0);
  const none = chosen.length === 0;

  const kinds = tasks.map((x) => leaving[x.id]);
  const going = kinds.every((k) => k !== undefined) ? kinds[0] : null;
  const locked = kinds.some((k) => k !== undefined);
  const ticking = kinds.includes("done");

  const coming = batch.day !== DUE_NOW;
  const state = summary.late > 0 ? "overdue" : coming ? "upcoming" : "today";
  const DueIcon = DUE_ICONS[state];
  const due = coming
    ? weekdayDate(batch.day)
    : summary.late === summary.plants
      ? `${t.today.overdue} · ${shortDate(summary.since)}`
      : summary.late > 0
        ? `${t.today.dueToday} · ${t.today.batchLate(summary.late)}`
        : t.today.dueToday;
  const title = coming ? `${weekdayDate(batch.day)} · ${t.today.batchPlants(summary.plants)}` : t.today.batchPlants(summary.plants);
  // The single card shows its instruction; a batch does when every watering in it says the same.
  const instruction = tasks.every((x) => x.instruction === tasks[0].instruction) ? tasks[0].instruction : "";

  function act(action: BatchAction) {
    if (locked || none) return;
    onAct(chosen, action);
    setMode("idle");
    setOpen(false);
  }

  function submitSkip(e: FormEvent) {
    e.preventDefault();
    act({ kind: "skip", reason: reason.slice(0, TASK_MAX_NOTE_CHARS) });
  }

  return (
    <div className={`task-wrap ${going ? `leaving ${going}` : ""}`}>
      <div className="task-clip">
        <div className={`card task batch ${state}`} role="group" aria-label={`${t.enums.task_type.water}: ${title}${batch.zone ? `, ${batch.zone}` : ""}`}>
          <div className="task-body">
            <div className="task-head">
              <span className="task-tile">
                {ticking ? (
                  <span className="type-tile ticked" style={{ width: 44, height: 44 }} aria-hidden>
                    <Check size={24} strokeWidth={3} />
                  </span>
                ) : (
                  <TypeTile type="water" />
                )}
                {ticking && <Burst />}
              </span>
              <div className="grow">
                <div className="task-type t-water">{t.enums.task_type.water}</div>
                <div className="task-title">{title}</div>
                {(batch.zone || summary.total !== null) && (
                  <div className="task-meta">
                    {batch.zone && (
                      <span className="site-label">
                        <MapPin size={14} aria-hidden />
                        {batch.zone}
                      </span>
                    )}
                    {summary.total !== null && <span>{t.today.litresTotal(summary.total)}</span>}
                  </div>
                )}
              </div>
            </div>
            <div className={`task-due ${state}`}>
              <DueIcon size={16} aria-hidden />
              {due}
            </div>
            {instruction && <p className="task-instruction">{instruction}</p>}
            {!open && (
              <div className="batch-groups">
                {summary.groups.map((group) => (
                  <div key={group.litres ?? "none"} className="batch-group">
                    <span className="batch-litres">{group.litres === null ? t.today.noAmount : t.today.litres(group.litres)}</span>
                    <span className="batch-tags">
                      {group.plants.slice(0, TAGS_SHOWN).map((plant) => (
                        <PlantTag key={plant.plant_id} plant={plant} out={isOut(plant)} />
                      ))}
                      {group.plants.length > TAGS_SHOWN && <span className="muted small">{t.today.moreTags(group.plants.length - TAGS_SHOWN)}</span>}
                    </span>
                  </div>
                ))}
              </div>
            )}
          </div>

          {open && (
            <div className="batch-list" id={listId} role="group" aria-label={t.today.batchList}>
              <p className="small muted">{t.today.chooseHint}</p>
              <ul>
                {summary.members.map((plant) => {
                  const out = isOut(plant);
                  const saving = plant.task_ids.some((id) => leaving[id]);
                  return (
                    <li key={plant.plant_id} className={saving ? "going" : out ? "out" : ""}>
                      <label className="batch-row">
                        <input type="checkbox" checked={!out} disabled={locked} onChange={() => onToggle(plant)} />
                        <PlantTag plant={plant} out={out} />
                        <span className="batch-row-litres">
                          {plant.litres.map((l) => (l === null ? t.today.noAmount : t.today.litres(l))).join(" + ")}
                        </span>
                        {plant.since < today && <span className="batch-item-late">{t.today.late(shortDate(plant.since))}</span>}
                      </label>
                      <Link to={`/plants/${plant.plant_id}`} state={{ tab: "calendar" }} className="btn icon-btn batch-open" aria-label={t.today.openPlant(plant.tag)}>
                        <ChevronRight size={20} aria-hidden />
                      </Link>
                    </li>
                  );
                })}
              </ul>
            </div>
          )}

          {mode === "idle" && (
            <div className="task-actions">
              <button type="button" className={`small ${coming ? "" : "primary"}`} disabled={locked || none} onClick={() => act({ kind: "done" })}>
                {/* With plants left out the count takes the icon's room, so "Done 14/15" stays on one line on a 360 px phone. */}
                {chosenPlants === summary.plants && <Check size={18} strokeWidth={2.5} aria-hidden />}
                {t.today.batchDone(chosenPlants, summary.plants)}
              </button>
              <button type="button" className="small" disabled={locked || none} onClick={() => setMode("skip")}>
                <X size={18} aria-hidden />
                {t.today.skip}
              </button>
              <button type="button" className="small" disabled={locked} aria-expanded={open} aria-controls={listId} onClick={() => setOpen((v) => !v)}>
                <ListChecks size={18} aria-hidden />
                {t.today.choose}
              </button>
            </div>
          )}

          {mode === "skip" && (
            <form className="task-sub skip" onSubmit={submitSkip}>
              <input
                value={reason}
                onChange={(e) => setReason(e.target.value)}
                placeholder={t.today.skipReason}
                aria-label={t.today.skipReason}
                maxLength={TASK_MAX_NOTE_CHARS}
                autoFocus
                enterKeyHint="done"
              />
              <button type="submit" className="small" disabled={locked || none}>
                {t.today.skipThem}
              </button>
              <button type="button" className="small icon-btn" onClick={() => setMode("idle")} aria-label={t.common.cancel}>
                <X size={18} aria-hidden />
              </button>
            </form>
          )}
        </div>
      </div>
    </div>
  );
}
