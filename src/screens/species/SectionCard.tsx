// One card of the species review screen: heading row, Edit button(s), "edited by you" pills,
// and either the section content or the inline editor for the target being edited.
import type { ReactNode } from "react";
import { t } from "../../i18n";
import type { Species } from "../../types";
import { FieldEditor } from "./FieldEditor";
import { isEdited, type EditTarget } from "./fields";

interface Props {
  /** Card heading; omit when the child section renders its own h2. */
  title?: string;
  species: Species;
  /** Edit targets of this card; empty when the section is read-only in this phase. */
  targets: EditTarget[];
  /** Id of the target being edited anywhere on the screen, or null. */
  editing: string | null;
  onEdit(target: EditTarget): void;
  onSaved(next: Species): void;
  onCancel(): void;
  /** Muted footnote under the content. */
  hint?: string;
  /** True while the screen runs an action (confirm, regenerate) that must not race an edit. */
  disabled?: boolean;
  children: ReactNode;
}

export function SectionCard({ title, species, targets, editing, onEdit, onSaved, onCancel, hint, disabled = false, children }: Props) {
  const active = targets.find((x) => x.id === editing) ?? null;
  // One editor at a time: other cards' Edit buttons wait until it is saved or cancelled.
  const locked = disabled || (editing !== null && active === null);
  const single = targets.length === 1 ? targets[0] : null;

  return (
    <section className="card">
      {(title || single) && (
        <div className="row between" style={{ alignItems: "flex-start", marginBottom: 8 }}>
          <h2 style={{ margin: 0 }} className="grow">
            {title}
          </h2>
          {single && (
            <span className="row" style={{ gap: 6, flexShrink: 0 }}>
              {isEdited(species, single) && <span className="pill accent">{t.species.edited}</span>}
              {!active && (
                <button type="button" className="small" disabled={locked} onClick={() => onEdit(single)}>
                  {t.species.editField}
                </button>
              )}
            </span>
          )}
        </div>
      )}

      {targets.length > 1 && !active && (
        <div className="row wrap" style={{ gap: 8, marginBottom: 10 }}>
          <span className="small muted">{t.species.editField}</span>
          {targets.map((x) => (
            <span key={x.id} className="row" style={{ gap: 4 }}>
              <button type="button" className="small" disabled={locked} onClick={() => onEdit(x)}>
                {x.label}
              </button>
              {isEdited(species, x) && <span className="pill accent">{t.species.edited}</span>}
            </span>
          ))}
        </div>
      )}

      {active ? <FieldEditor key={active.id} species={species} target={active} onSaved={onSaved} onCancel={onCancel} /> : children}

      {hint && !active && (
        <p className="small muted" style={{ margin: "10px 0 0" }}>
          {hint}
        </p>
      )}
    </section>
  );
}
