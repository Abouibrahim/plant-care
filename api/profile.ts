// POST /api/profile
//   { scientific_name, cultivar?, common_names?, site? }   a confirmed candidate
//   { name, site? }                                        a name typed by the user
//   { regenerate_species_id }                              rewrite, keeping user_edits
// Returns { species, created, ...usage }. Claude is called only when no species row matches.
import type { VercelRequest, VercelResponse } from "@vercel/node";
import { callJson, readPrompt, readSchema } from "./_claude";
import { handleError, sendError, serviceClient, verifyUser } from "./_supabase";
import type { ProfileRequest, Species, SpeciesProfile, Usage } from "../src/types";

const NO_USAGE: Usage = { model: null, input_tokens: 0, output_tokens: 0, cache_read_input_tokens: 0, cache_creation_input_tokens: 0 };

/** ilike without wildcards is a case-insensitive equality once the LIKE metacharacters are escaped. */
function likeLiteral(s: string): string {
  return s.replace(/[\\%_]/g, (c) => "\\" + c);
}

/** Quotes a value for PostgREST's or() filter syntax, where commas and dots are separators. */
function quoted(s: string): string {
  return '"' + s.replace(/"/g, '\\"') + '"';
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
  if (req.method !== "POST") {
    sendError(res, 405, "Method not allowed");
    return;
  }
  try {
    const user = await verifyUser(req);
    if (!user) {
      sendError(res, 401, "Unauthorized");
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
      const merged: SpeciesProfile = {
        ...result.data,
        ...row.user_edits,
        scientific_name: row.scientific_name,
        cultivar: row.cultivar,
      };
      const { data: updated, error: updErr } = await db
        .from("species")
        .update({ ...merged, generated_by: result.usage.model, generated_at: new Date().toISOString() })
        .eq("id", row.id)
        .select("*")
        .single();
      if (updErr) throw updErr;
      res.status(200).json({ species: updated, created: true, ...result.usage });
      return;
    }

    // --- look it up first: a matching row costs no Claude call ----------------
    const scientific = body.scientific_name?.trim() ?? "";
    const cultivar = body.cultivar?.trim() ?? "";
    const typed = body.name?.trim() ?? "";
    if (!scientific && !typed) {
      sendError(res, 400, "Send scientific_name or name");
      return;
    }
    if (scientific.toLowerCase() === "unknown") {
      sendError(res, 400, "Cannot profile an unknown plant; type a name first");
      return;
    }

    const existing = scientific ? await findByScientificName(scientific, cultivar) : await findByAnyName(typed);
    if (existing) {
      res.status(200).json({ species: existing, created: false, ...NO_USAGE });
      return;
    }

    // --- write it ---------------------------------------------------------------
    const result = await writeProfile(describe(body));
    if (!result.ok) {
      res.status(200).json({ refusal: result.refusal, ...result.usage });
      return;
    }
    const profile = result.data;
    if (scientific) {
      // The confirmed name stays the key even if Claude normalised it differently.
      profile.scientific_name = scientific;
      profile.cultivar = cultivar;
    }

    // A parallel request may have inserted the same species meanwhile.
    const race = await findByScientificName(profile.scientific_name, profile.cultivar);
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
