// One card of the species screen for a list block of the profile (care_calendar or pests): heading
// with the "edited by you" pill and an Add button, the entries each with an Edit button, and the
// editor in place of the entry being edited (or on top for a new one). Every save writes the whole
// list through updateSpeciesField, so the block lands in user_edits and a regeneration keeps it.
import { Fragment, useState, type ReactNode } from "react";
import { Banner } from "../../components/Banner";
import { t } from "../../i18n";
import { updateSpeciesField } from "../../lib/db";
import type { Species, SpeciesProfile } from "../../types";

type ListKey = "care_calendar" | "pests";
type ItemOf<K extends ListKey> = SpeciesProfile[K][number];

/** What runs after a successful save, with the three lines the card shows for it. */
export interface FollowUp {
  run(): Promise<void>;
  running: string;
  done: string;
  failed: string;
}

export interface EditorProps<T> {
  item: T | null;
  saving: boolean;
  error: string | null;
  onSave(next: T): void;
  onDelete?: () => void;
  onCancel(): void;
}

interface Props<K extends ListKey> {
  listKey: K;
  title: string;
  addLabel: string;
  deleteConfirm: string;
  emptyText: string;
  species: Species;
  /** Display order, as indices into the stored list. */
  order(items: ItemOf<K>[]): number[];
  renderItem(item: ItemOf<K>, actions: ReactNode): ReactNode;
  renderEditor(props: EditorProps<ItemOf<K>>): ReactNode;
  /** Id of the editor open anywhere on the screen (this card's is its listKey), or null. */
  editing: string | null;
  onEdit(id: string): void;
  onSaved(next: Species): void;
  onCancel(): void;
  /** True while the screen runs an action (confirm, regenerate) that must not race an edit. */
  disabled?: boolean;
  followUp?: FollowUp;
}

export function ListCard<K extends ListKey>(p: Props<K>) {
  const [active, setActive] = useState<number | "new" | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [status, setStatus] = useState<string | null>(null);

  const items = p.species[p.listKey] as ItemOf<K>[];
  const open = p.editing === p.listKey ? active : null;
  // One editor at a time on the screen: this card waits while another card's editor is open.
  const locked = p.disabled === true || (p.editing !== null && p.editing !== p.listKey) || saving;
  const edited = p.listKey in (p.species.user_edits ?? {});

  function begin(which: number | "new") {
    setActive(which);
    setError(null);
    p.onEdit(p.listKey);
  }

  function cancel() {
    setActive(null);
    setError(null);
    p.onCancel();
  }

  async function persist(next: ItemOf<K>[]) {
    setSaving(true);
    setError(null);
    setStatus(null);
    let saved: Species;
    try {
      saved = await updateSpeciesField(p.species, p.listKey, next as unknown as SpeciesProfile[K]);
    } catch (err) {
      setError(err instanceof Error && err.message ? err.message : t.errors.generic);
      setSaving(false);
      return;
    }
    setSaving(false);
    setActive(null);
    p.onSaved(saved);
    if (p.followUp) {
      setStatus(p.followUp.running);
      try {
        await p.followUp.run();
        setStatus(p.followUp.done);
      } catch {
        setStatus(p.followUp.failed);
      }
    }
  }

  function save(next: ItemOf<K>) {
    const list = [...items];
    if (open === "new") list.push(next);
    else if (typeof open === "number") list[open] = next;
    else return;
    void persist(list);
  }

  function remove(index: number) {
    if (!window.confirm(p.deleteConfirm)) return;
    void persist(items.filter((_, i) => i !== index));
  }

  const editorProps = (index: number | null): EditorProps<ItemOf<K>> => ({
    item: index === null ? null : items[index],
    saving,
    error,
    onSave: save,
    onDelete: index === null ? undefined : () => remove(index),
    onCancel: cancel,
  });

  return (
    <section className="card">
      <div className="row between" style={{ alignItems: "flex-start", marginBottom: 8 }}>
        <h2 style={{ margin: 0 }} className="grow">
          {p.title}
        </h2>
        <span className="row" style={{ gap: 6, flexShrink: 0 }}>
          {edited && <span className="pill accent">{t.species.edited}</span>}
          {open === null && (
            <button type="button" className="small" disabled={locked} onClick={() => begin("new")}>
              {p.addLabel}
            </button>
          )}
        </span>
      </div>

      {open === "new" && <div className="card">{p.renderEditor(editorProps(null))}</div>}

      {items.length === 0 && open !== "new" && <p className="muted">{p.emptyText}</p>}

      {p.order(items).map((index) => {
        if (open === index) {
          return (
            <div key={index} className="card">
              {p.renderEditor(editorProps(index))}
            </div>
          );
        }
        const actions =
          open === null ? (
            <button type="button" className="small" disabled={locked} onClick={() => begin(index)}>
              {t.species.editField}
            </button>
          ) : null;
        return <Fragment key={index}>{p.renderItem(items[index], actions)}</Fragment>;
      })}

      {error && open === null && <Banner kind="error">{error}</Banner>}

      <p className="small muted" style={{ margin: "10px 0 0" }}>
        {status ?? (edited ? t.species.listEdited : t.species.listEditable)}
      </p>
    </section>
  );
}
