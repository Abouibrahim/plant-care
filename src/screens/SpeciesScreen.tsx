// Species profile review: read every section, confirm the AI-written profile,
// edit single fields (kept on regeneration) or regenerate the whole profile from Claude.
import { Fragment, useEffect, useState } from "react";
import { Link, useNavigate, useParams, useSearchParams } from "react-router-dom";
import { Banner } from "../components/Banner";
import { Spinner } from "../components/Spinner";
import { CalendarSection, GuildUsesSection, HealthSection, NeedsSection } from "../components/profile";
import { t } from "../i18n";
import { api, ApiError } from "../lib/api";
import { confirmSpecies, deleteSpeciesIfUnused, getSpecies, speciesPlantCounts } from "../lib/db";
import { isRefusal, type Species } from "../types";
import { GUILD_TARGETS, IDENTITY_TARGETS, NEEDS_TARGETS, type EditTarget } from "./species/fields";
import { SectionCard } from "./species/SectionCard";

type LoadState =
  | { status: "loading" }
  | { status: "error"; message: string }
  | { status: "missing" }
  | { status: "ready"; species: Species };

type Action = "confirm" | "regenerate" | "delete";

function describeError(err: unknown): string {
  if (err instanceof ApiError) {
    if (err.status === 401) return t.errors.unauthorized;
    if (err.status === 0) return t.errors.network;
  }
  return err instanceof Error && err.message ? err.message : t.errors.generic;
}

function enumLabel(labels: Readonly<Record<string, string>>, value: string): string {
  return labels[value] ?? value;
}

function IdentityBlock({ species: s }: { species: Species }) {
  const F = t.species.fields;
  const rows: Array<{ label: string; value: string; className?: string }> = [
    { label: F.en, value: s.common_names.en },
    { label: F.fr, value: s.common_names.fr },
    { label: F.ar, value: s.common_names.ar, className: "arabic" },
    { label: F.ar_latin, value: s.common_names.ar_latin },
    { label: F.scientific_name, value: s.scientific_name, className: "italic" },
    { label: F.cultivar, value: s.cultivar },
  ];
  return (
    <dl className="kv">
      {rows.map((r) => (
        <Fragment key={r.label}>
          <dt>{r.label}</dt>
          <dd className={r.value ? r.className : "muted"}>{r.value || t.common.notSet}</dd>
        </Fragment>
      ))}
    </dl>
  );
}

function Header({ species: s }: { species: Species }) {
  const date = s.generated_at ? new Date(s.generated_at).toLocaleDateString() : "";
  return (
    <header className="stack" style={{ gap: 4, marginBottom: 12 }}>
      <h1 style={{ margin: 0 }}>{s.common_names.en || s.scientific_name}</h1>
      {s.common_names.fr && <div>{s.common_names.fr}</div>}
      {(s.common_names.ar || s.common_names.ar_latin) && (
        <div className="row wrap" style={{ gap: 8 }}>
          {s.common_names.ar && <span className="arabic">{s.common_names.ar}</span>}
          {s.common_names.ar_latin && <span className="muted">{s.common_names.ar_latin}</span>}
        </div>
      )}
      <div>
        <span className="italic">{s.scientific_name}</span>
        {s.cultivar && <span> &lsquo;{s.cultivar}&rsquo;</span>}
      </div>
      <div className="row wrap" style={{ gap: 0 }}>
        <span className="pill">{enumLabel(t.enums.plant_type, s.plant_type)}</span>
        <span className="pill">{enumLabel(t.enums.lifecycle, s.lifecycle)}</span>
        {s.foliage !== "not_applicable" && <span className="pill">{enumLabel(t.enums.foliage, s.foliage)}</span>}
        <span className="pill">{enumLabel(t.enums.layer, s.layer)}</span>
        {s.confirmed && <span className="pill ok">{t.species.confirmed}</span>}
      </div>
      <div className="small muted">{t.species.writtenBy(s.generated_by ?? t.common.unknown, date)}</div>
    </header>
  );
}

function SpeciesView({ id }: { id: string }) {
  const [params] = useSearchParams();
  const plantId = params.get("plant");
  const [state, setState] = useState<LoadState>({ status: "loading" });
  const [editing, setEditing] = useState<string | null>(null);
  const [busy, setBusy] = useState<Action | null>(null);
  const [actionError, setActionError] = useState<{ action: Action; message: string } | null>(null);
  const [usage, setUsage] = useState<{ input: number; output: number } | null>(null);
  const [plantCount, setPlantCount] = useState<number | null>(null);
  const navigate = useNavigate();

  useEffect(() => {
    let active = true;
    getSpecies(id)
      .then((s) => {
        if (active) setState(s ? { status: "ready", species: s } : { status: "missing" });
      })
      .catch((err: unknown) => {
        if (active) setState({ status: "error", message: describeError(err) });
      });
    speciesPlantCounts()
      .then((counts) => {
        if (active) setPlantCount(counts.get(id) ?? 0);
      })
      .catch(() => undefined);
    return () => {
      active = false;
    };
  }, [id]);

  function setSpecies(next: Species) {
    setState({ status: "ready", species: next });
  }

  function startEdit(target: EditTarget) {
    setEditing(target.id);
  }

  function saved(next: Species) {
    setSpecies(next);
    setEditing(null);
  }

  async function confirm() {
    if (busy) return;
    setBusy("confirm");
    setActionError(null);
    try {
      setSpecies(await confirmSpecies(id));
    } catch (err) {
      setActionError({ action: "confirm", message: describeError(err) });
    } finally {
      setBusy(null);
    }
  }

  async function regenerate() {
    if (busy || editing !== null) return;
    if (!window.confirm(t.species.regenerateConfirm)) return;
    setBusy("regenerate");
    setActionError(null);
    setUsage(null);
    try {
      const res = await api.profile({ regenerate_species_id: id });
      if (isRefusal(res)) {
        setActionError({ action: "regenerate", message: `${t.capture.refusal}: ${res.refusal}` });
      } else {
        setSpecies(res.species);
        setUsage({ input: res.input_tokens, output: res.output_tokens });
      }
    } catch (err) {
      setActionError({ action: "regenerate", message: describeError(err) });
    } finally {
      setBusy(null);
    }
  }

  async function remove() {
    if (busy || editing !== null) return;
    if (!window.confirm(t.species.deleteConfirm)) return;
    setBusy("delete");
    setActionError(null);
    try {
      const deleted = await deleteSpeciesIfUnused(id);
      if (deleted) {
        navigate("/species", { replace: true });
        return;
      }
      setActionError({ action: "delete", message: t.species.deleteInUse });
    } catch (err) {
      setActionError({ action: "delete", message: describeError(err) });
    } finally {
      setBusy(null);
    }
  }

  const doneLink = plantId ? (
    <Link to={`/plants/${plantId}`} className="btn block">
      {t.common.done}
    </Link>
  ) : null;

  if (state.status === "loading") {
    return (
      <div className="screen center">
        <Spinner label={t.common.loading} />
      </div>
    );
  }
  if (state.status === "error") {
    return (
      <div className="screen">
        <Banner kind="error">{state.message}</Banner>
        {doneLink}
      </div>
    );
  }
  if (state.status === "missing") {
    return (
      <div className="screen">
        <Banner kind="warn">{t.species.notFound}</Banner>
        {doneLink ?? (
          <Link to="/species" className="btn block">
            {t.common.back}
          </Link>
        )}
      </div>
    );
  }

  const s = state.species;
  const cardProps = {
    species: s,
    editing,
    onEdit: startEdit,
    onSaved: saved,
    onCancel: () => setEditing(null),
    // No field edits while Claude rewrites the profile: the answer would overwrite them.
    disabled: busy !== null,
  };

  return (
    <div className="screen">
      {!plantId && (
        <Link to="/species" className="btn link small" style={{ marginLeft: -6 }}>
          {t.common.back}
        </Link>
      )}
      <Header species={s} />

      {!s.confirmed && (
        <Banner kind="warn">
          <div className="stack">
            <span>{t.species.aiBanner}</span>
            <button type="button" className="primary block" disabled={busy !== null} onClick={confirm}>
              {busy === "confirm" ? t.species.confirming : t.species.confirm}
            </button>
          </div>
        </Banner>
      )}
      {actionError?.action === "confirm" && <Banner kind="error">{actionError.message}</Banner>}
      {doneLink && <div style={{ marginBottom: 12 }}>{doneLink}</div>}

      <SectionCard title={t.species.sections.identity} targets={IDENTITY_TARGETS} {...cardProps}>
        <IdentityBlock species={s} />
      </SectionCard>

      <SectionCard title={t.plant.tabs.needs} targets={NEEDS_TARGETS} {...cardProps}>
        <NeedsSection species={s} />
      </SectionCard>

      {/* CalendarSection and HealthSection render their own headings; no editing in Phase 1. */}
      <SectionCard targets={[]} hint={t.species.regenerateOnly} {...cardProps}>
        <CalendarSection species={s} />
      </SectionCard>

      <SectionCard targets={[]} hint={t.species.regenerateOnly} {...cardProps}>
        <HealthSection species={s} />
      </SectionCard>

      <SectionCard title={t.plant.tabs.guild} targets={GUILD_TARGETS} {...cardProps}>
        <GuildUsesSection species={s} />
      </SectionCard>

      <div className="card stack">
        <button type="button" className="block" disabled={busy !== null || editing !== null} onClick={regenerate}>
          {busy === "regenerate" ? t.species.regenerating : t.species.regenerate}
        </button>
        <span className="small muted">{t.species.regenerateNote}</span>
        {busy === "regenerate" && <Spinner label={t.species.regenerating} />}
        {actionError?.action === "regenerate" && <Banner kind="error">{actionError.message}</Banner>}
        {usage && <span className="small muted">{t.capture.usage(usage.input, usage.output)}</span>}
      </div>

      {plantCount === 0 && (
        <div className="card stack">
          <button type="button" className="danger block" disabled={busy !== null || editing !== null} onClick={remove}>
            {t.species.delete}
          </button>
          <span className="small muted">{t.species.deleteNote}</span>
          {actionError?.action === "delete" && <Banner kind="error">{actionError.message}</Banner>}
        </div>
      )}

      {doneLink}
    </div>
  );
}

export function SpeciesScreen() {
  const { id = "" } = useParams();
  // Keyed on the id so every piece of state resets when the route changes to another species.
  return <SpeciesView key={id} id={id} />;
}
