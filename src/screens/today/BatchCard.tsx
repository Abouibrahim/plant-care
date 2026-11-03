// A zone batch on Today: the tasks of one zone that make one job falling due together, in one card.
// Two layouts share the actions:
// - a round of periodic waterings (Phase 11): "15 plants · row 2 · 216 L in all", with each amount's
//   plants ("40 L · OL-01 OL-03");
// - a window job (Phase 12): the single card's title, due line and instruction for several plants,
//   "Harvest the olives · row 2 · 10 plants · Open since 1 Oct · until 31 Dec", with their tags.
// Done and Skip close the plants still ticked in Choose; a plant unticked stays pending, and Today
// keeps the ticks so a reload of the list does not tick it again. A window batch also has "Done with
// a note", which goes on each plant's row with its scope ("row 3 · 10 plants: 180 kg"). Each plant in
// Choose opens its page on the Calendar tab, where a single card offers a snooze or a note of its own.
import { useId, useState, type FormEvent } from "react";
import { Link } from "react-router-dom";
import { Check, ChevronRight, ListChecks, MapPin, NotebookPen, X } from "lucide-react";
import { t } from "../../i18n";
import { DUE_NOW, summarize, type Batch, type BatchPlant } from "../../lib/batches";
import { batchDonePrimary, dueLabel, roundDueLabel, scopedNote, scopedNoteRoom, sharedInstruction, shortDate, weekdayDate, type BatchAction } from "../../lib/today";
import { Burst, DueIcon, type TaskAction } from "../../components/TaskCard";
import { TypeTile } from "../../components/TypeIcon";
import { TASK_MAX_NOTE_CHARS, type TaskWithPlant } from "../../types";

interface Props {
  batch: Batch<TaskWithPlant>;
  today: string;
  /** Tasks being saved, by id: when all of the batch's are, the card ticks (or slides) and folds away. */
  leaving: Record<string, TaskAction["kind"]>;
  /** Task ids of the plants unticked in Choose. */
  left: ReadonlySet<string>;
  /** Unticks (`out`) or ticks again the given tasks: one plant's, or the whole batch's. */
  onLeaveOut: (ids: string[], out: boolean) => void;
  onAct: (ids: string[], action: BatchAction) => void;
}

/** Tags shown per amount (or for a window job) while Choose is closed; the rest read "+N". */
const TAGS_SHOWN = 8;

function PlantTag({ plant, out }: { plant: BatchPlant; out: boolean }) {
  return (
    <span className={`tag ${out ? "out" : ""}`}>
      {plant.tag}
      {plant.quantity > 1 && ` ×${plant.quantity}`}
      {out && <span className="visually-hidden"> {t.today.leftOut}</span>}
    </span>
  );
}

function Tags({ plants, isOut }: { plants: BatchPlant[]; isOut: (plant: BatchPlant) => boolean }) {
  return (
    <span className="batch-tags">
      {plants.slice(0, TAGS_SHOWN).map((plant) => (
        <PlantTag key={plant.plant_id} plant={plant} out={isOut(plant)} />
      ))}
      {plants.length > TAGS_SHOWN && <span className="muted small">{t.today.moreTags(plants.length - TAGS_SHOWN)}</span>}
    </span>
  );
}

export function BatchCard({ batch, today, leaving, left, onLeaveOut, onAct }: Props) {
  const listId = useId();
  const [open, setOpen] = useState(false);
  const [mode, setMode] = useState<"idle" | "skip" | "note">("idle");
  const [reason, setReason] = useState("");
  const [note, setNote] = useState("");

  const { tasks } = batch;
  // After a partial Done or Skip the rest of the batch stays in this card (its key does not change),
  // so the words typed for the plants that went are cleared rather than offered again for the next.
  const taskIds = tasks.map((x) => x.id).join(",");
  const [shownIds, setShownIds] = useState(taskIds);
  if (shownIds !== taskIds) {
    setShownIds(taskIds);
    setNote("");
    setReason("");
  }
  /** A round of periodic waterings (Phase 11); otherwise one window job shared by the plants (Phase 12). */
  const round = batch.title === null;
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
  // A window batch shares its window, so it reads the single card's due line from its first task.
  const due = round ? roundDueLabel(batch.day, summary) : dueLabel(tasks[0], today);
  const job = round ? t.today.batchPlants(summary.plants) : (batch.title ?? "");
  const title = coming ? `${weekdayDate(batch.day)} · ${job}` : job;
  // The single card shows its instruction; a batch does when every task in it says the same.
  const instruction = sharedInstruction(tasks);
  // The green Done is for today's round; a window merely open gets a plain one, as a coming day does.
  const primary = batchDonePrimary(tasks, today);

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

  function submitNote(e: FormEvent) {
    e.preventDefault();
    // The note goes on each ticked plant's row with the batch's zone and the plants ticked in front.
    const scoped = scopedNote(batch.zone, chosenPlants, note);
    act(scoped === null ? { kind: "done" } : { kind: "done", note: scoped });
  }

  const doneLabel = (
    <>
      {/* With plants left out the count takes the icon's room, so "Done 14/15" stays on one line on a 360 px phone. */}
      {chosenPlants === summary.plants && <Check size={18} strokeWidth={2.5} aria-hidden />}
      {t.today.batchDone(chosenPlants, summary.plants)}
    </>
  );

  return (
    <div className={`task-wrap ${going ? `leaving ${going}` : ""}`}>
      <div className="task-clip">
        <div className={`card task batch ${due.state}`} role="group" aria-label={`${t.enums.task_type[batch.type]}: ${title}${batch.zone ? `, ${batch.zone}` : ""}`}>
          <div className="task-body">
            <div className="task-head">
              <span className="task-tile">
                {ticking ? (
                  <span className="type-tile ticked" style={{ width: 44, height: 44 }} aria-hidden>
                    <Check size={24} strokeWidth={3} />
                  </span>
                ) : (
                  <TypeTile type={batch.type} />
                )}
                {ticking && <Burst />}
              </span>
              <div className="grow">
                <div className={`task-type t-${batch.type}`}>{t.enums.task_type[batch.type]}</div>
                <div className="task-title">{title}</div>
                {(batch.zone || !round || summary.total !== null) && (
                  <div className="task-meta">
                    {batch.zone && (
                      <span className="site-label">
                        <MapPin size={14} aria-hidden />
                        {batch.zone}
                      </span>
                    )}
                    {round ? summary.total !== null && <span>{t.today.litresTotal(summary.total)}</span> : <span>{t.today.batchPlants(summary.plants)}</span>}
                  </div>
                )}
              </div>
            </div>
            <div className={`task-due ${due.state}`}>
              <DueIcon state={due.state} />
              {due.text}
            </div>
            {instruction && <p className="task-instruction">{instruction}</p>}
            {!open &&
              (round ? (
                <div className="batch-groups">
                  {summary.groups.map((group) => (
                    <div key={group.litres ?? "none"} className="batch-group">
                      <span className="batch-litres">{group.litres === null ? t.today.noAmount : t.today.litres(group.litres)}</span>
                      <Tags plants={group.plants} isOut={isOut} />
                    </div>
                  ))}
                </div>
              ) : (
                <div className="batch-plants">
                  <Tags plants={summary.members} isOut={isOut} />
                </div>
              ))}
          </div>

          {open && (
            <div className="batch-list" id={listId} role="group" aria-label={t.today.batchList}>
              <div className="batch-list-head">
                <p className="small muted">{t.today.chooseHint}</p>
                <button type="button" className="link small" disabled={locked} onClick={() => onLeaveOut(tasks.map((x) => x.id), !none)}>
                  {none ? t.today.tickAll : t.today.untickAll}
                </button>
              </div>
              <ul>
                {summary.members.map((plant) => {
                  const out = isOut(plant);
                  const saving = plant.task_ids.some((id) => leaving[id]);
                  return (
                    <li key={plant.plant_id} className={saving ? "going" : out ? "out" : ""}>
                      <label className="batch-row">
                        <input type="checkbox" checked={!out} disabled={locked} onChange={() => onLeaveOut(plant.task_ids, !out)} />
                        <PlantTag plant={plant} out={out} />
                        {round && (
                          <span className="batch-row-litres">
                            {plant.litres.map((l) => (l === null ? t.today.noAmount : t.today.litres(l))).join(" + ")}
                          </span>
                        )}
                        {round && plant.late && <span className="batch-item-late">{t.today.late(shortDate(plant.since))}</span>}
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
            <>
              <div className="task-actions">
                <button type="button" className={`small ${primary ? "primary" : ""}`} disabled={locked || none} onClick={() => act({ kind: "done" })}>
                  {doneLabel}
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
              {!round && (
                <button type="button" className="link small task-note-link" disabled={locked || none} onClick={() => setMode("note")}>
                  <NotebookPen size={16} aria-hidden />
                  {t.today.doneWithNote}
                </button>
              )}
            </>
          )}

          {mode === "note" && (
            <form className="task-sub skip" onSubmit={submitNote}>
              <input
                value={note}
                onChange={(e) => setNote(e.target.value)}
                placeholder={t.today.doneNote}
                aria-label={t.today.doneNote}
                maxLength={scopedNoteRoom(batch.zone, chosenPlants)}
                autoFocus
                enterKeyHint="done"
              />
              <button type="submit" className={`small ${primary ? "primary" : ""}`} disabled={locked || none}>
                {doneLabel}
              </button>
              <button type="button" className="small icon-btn" onClick={() => setMode("idle")} aria-label={t.common.cancel}>
                <X size={18} aria-hidden />
              </button>
            </form>
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
