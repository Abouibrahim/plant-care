// POST /api/profile
//   { scientific_name, cultivar?, common_names?, site? }   a confirmed candidate
//   { name, site? }                                        a name typed by the user
//   { regenerate_species_id }                              rewrite, keeping user_edits
// Returns { species, created, ...usage }. Claude is called only when no species row matches.
import type { VercelRequest, VercelResponse } from "./_http.js";
import { callJson, readPrompt, readSchema, ZERO_USAGE } from "./_claude.js";
import { handleError, sendError, serviceClient, verifyUser } from "./_supabase.js";
import type { ProfileRequest, Species, SpeciesProfile } from "../src/types.js";

/** ilike without wildcards is a case-insensitive equality once the LIKE metacharacters are escaped. */
function likeLiteral(s: string): string {
  return s.replace(/[\\%_]/g, (c) => "\\" + c);
}

/** Quotes a value for PostgREST's or() filter syntax, where commas and dots are separators. */
function quoted(s: string): string {
  return '"' + s.replace(/"/g, '\\"') + '"';
}

/**
 * The species key is the bare binomial: whitespace collapsed, quoted cultivar names and the
 * hybrid sign dropped, author citation removed ("Olea europaea L." -> "Olea europaea").
 * Lower-case ranks (subsp., var.) stay; a hybrid formula ("Prunus dulcis × Prunus persica")
 * keeps both parents so it never collapses into one of them.
 */
export function normalizeScientificName(raw: string): string {
  let s = raw
    .replace(/['‘’"][^'‘’"]*['‘’"]/g, " ") // 'Pendula', "Black Mission"
    .replace(/\s+/g, " ")
    .trim();
  const formula = /^(\S+ \S+) [×xX] ([A-Z]\S* \S+)/u.exec(s);
  if (formula) return `${formula[1]} × ${formula[2]}`;
  s = s.replace(/^×\s*/u, "").replace(/\s×\s*/gu, " ").replace(/\s[xX]\s/g, " ");
  const tokens = s.split(" ").filter((t) => t.length > 0);
  if (tokens.length > 2 && /^[A-Z(]/.test(tokens[2])) return tokens.slice(0, 2).join(" ");
  return tokens.join(" ");
}

async function findByScientificName(scientific: string, cultivar: string): Promise<Species | null> {
  const { data, error } = await serviceClient()
    .from("species")
    .select("*")
    .ilike("scientific_name", likeLiteral(scientific))
    .ilike("cultivar", likeLiteral(cultivar))
    .limit(1)
    .maybeSingle();
  if (error) throw error;
  return (data as Species | null) ?? null;
}

async function findAnyCultivar(scientific: string): Promise<Species | null> {
  const { data, error } = await serviceClient()
    .from("species")
    .select("*")
    .ilike("scientific_name", likeLiteral(scientific))
    .order("confirmed", { ascending: false })
    .order("created_at", { ascending: true })
    .limit(1)
    .maybeSingle();
  if (error) throw error;
  return (data as Species | null) ?? null;
}

/**
 * Exact (name, cultivar) first; then the species-level row; then any row of the species.
 * One profile per species keeps the second olive free, whatever cultivar identify guessed.
 */
async function findSpecies(scientific: string, cultivar: string): Promise<Species | null> {
  const exact = await findByScientificName(scientific, cultivar);
  if (exact) return exact;
  if (cultivar) {
    const speciesLevel = await findByScientificName(scientific, "");
    if (speciesLevel) return speciesLevel;
  }
  return findAnyCultivar(scientific);
}

async function findByAnyName(name: string): Promise<Species | null> {
  const lit = quoted(likeLiteral(name));
  const { data, error } = await serviceClient()
    .from("species")
    .select("*")
    .or(
      [
        `scientific_name.ilike.${lit}`,
        `common_names->>en.ilike.${lit}`,
        `common_names->>fr.ilike.${lit}`,
        `common_names->>ar.ilike.${lit}`,
        `common_names->>ar_latin.ilike.${lit}`,
      ].join(","),
    )
    .order("confirmed", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error) throw error;
  return (data as Species | null) ?? null;
}

function writeProfile(text: string) {
  return callJson<SpeciesProfile>({
    rules: readPrompt("profile.md"),
    schema: readSchema("profile.schema.json"),
    content: [{ type: "text", text }],
    maxTokens: 6000,
    effort: "medium",
  });
}

function describe(body: ProfileRequest): string {
  const parts: string[] = [];
  const cultivar = body.cultivar?.trim() ?? "";
  if (body.scientific_name) {
    parts.push(`Species: ${body.scientific_name.trim()}${cultivar ? `, cultivar '${cultivar}'` : ""}.`);
  } else if (body.name) {
    parts.push(
      `The grower typed the plant name "${body.name.trim()}" (a common or scientific name). ` +
        "Resolve it to the species and write its profile; set scientific_name to the accepted binomial.",
    );
  }
  if (body.common_names) {
    const n = body.common_names;
    parts.push(`Names from identification: ${n.en} / ${n.fr} / ${n.ar} (${n.ar_latin}).`);
  }
  if (body.site) parts.push(`The first plant of this species is ${body.site === "farm" ? "at the farm" : "in the backyard"}.`);
  return parts.join("\n");
}

export default async function handler(req: VercelRequest, res: VercelResponse): Promise<void> {
  try {
    // The bearer check comes first: any request without a valid token is a 401, whatever the method.
    const user = await verifyUser(req);
    if (!user) {
      sendError(res, 401, "Unauthorized");
      return;
    }
    if (req.method !== "POST") {
      sendError(res, 405, "Method not allowed");
      return;
    }
    const body = (req.body ?? {}) as ProfileRequest;
    const db = serviceClient();

    // --- regenerate, keeping the user's edits ---------------------------------
    if (body.regenerate_species_id) {
      const { data: existing, error } = await db.from("species").select("*").eq("id", body.regenerate_species_id).maybeSingle();
      if (error) throw error;
      if (!existing) {
        sendError(res, 404, "Species not found");
        return;
      }
      const row = existing as Species;
      const result = await writeProfile(
        describe({ scientific_name: row.scientific_name, cultivar: row.cultivar, common_names: row.common_names }),
      );
      if (!result.ok) {
        res.status(200).json({ refusal: result.refusal, ...result.usage });
        return;
      }
      // Re-read the edits: the user may have saved a field while Claude was writing.
      const { data: latest, error: latestErr } = await db.from("species").select("user_edits").eq("id", row.id).maybeSingle();
      if (latestErr) throw latestErr;
      const userEdits = ((latest as { user_edits?: Partial<SpeciesProfile> } | null)?.user_edits ?? row.user_edits) as Partial<SpeciesProfile>;
      const merged: SpeciesProfile = {
        ...result.data,
        ...userEdits,
        scientific_name: row.scientific_name,
        cultivar: row.cultivar,
      };
      const { data: updated, error: updErr } = await db
        .from("species")
        .update({
          ...merged,
          generated_by: result.usage.model,
          generated_at: new Date().toISOString(),
          // Freshly written text has not been reviewed: back to "AI-written, confirm".
          confirmed: false,
        })
        .eq("id", row.id)
        .select("*")
        .single();
      if (updErr) throw updErr;
      res.status(200).json({ species: updated, created: true, ...result.usage });
      return;
    }

    // --- look it up first: a matching row costs no Claude call ----------------
    const scientific = normalizeScientificName(body.scientific_name ?? "");
    const cultivar = body.cultivar?.replace(/\s+/g, " ").trim() ?? "";
    const typed = body.name?.replace(/\s+/g, " ").trim() ?? "";
    if (!scientific && !typed) {
      sendError(res, 400, "Send scientific_name or name");
      return;
    }
    if (scientific.toLowerCase() === "unknown") {
      sendError(res, 400, "Cannot profile an unknown plant; type a name first");
      return;
    }

    const existing = scientific ? await findSpecies(scientific, cultivar) : await findByAnyName(typed);
    if (existing) {
      res.status(200).json({ species: existing, created: false, ...ZERO_USAGE });
      return;
    }

    // --- write it ---------------------------------------------------------------
    const result = await writeProfile(describe({ ...body, scientific_name: scientific || undefined, cultivar }));
    if (!result.ok) {
      res.status(200).json({ refusal: result.refusal, ...result.usage });
      return;
    }
    const profile = result.data;
    if (scientific) {
      // The confirmed name stays the key even if Claude normalised it differently.
      profile.scientific_name = scientific;
      profile.cultivar = cultivar;
    } else {
      profile.scientific_name = normalizeScientificName(profile.scientific_name);
      profile.cultivar = profile.cultivar.replace(/\s+/g, " ").trim();
    }

    // A parallel request may have inserted the same species meanwhile.
    const race = await findSpecies(profile.scientific_name, profile.cultivar);
    if (race) {
      res.status(200).json({ species: race, created: false, ...result.usage });
      return;
    }

    const { data: inserted, error: insErr } = await db
      .from("species")
      .insert({
        ...profile,
        generated_by: result.usage.model,
        generated_at: new Date().toISOString(),
        confirmed: false,
        user_edits: {},
      })
      .select("*")
      .single();
    if (insErr) {
      if (insErr.code === "23505") {
        const again = await findByScientificName(profile.scientific_name, profile.cultivar);
        if (again) {
          res.status(200).json({ species: again, created: false, ...result.usage });
          return;
        }
      }
      throw insErr;
    }
    res.status(200).json({ species: inserted, created: true, ...result.usage });
  } catch (err) {
    handleError(res, err);
  }
}
