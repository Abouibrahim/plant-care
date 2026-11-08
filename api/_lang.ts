// The language the server writes in (review 4.2): the settings row `lang`, written by Settings →
// Language, picks the French or the English table for the digest, the weather push, the rain
// note and the notes the expansion writes on the tasks it closes. Missing, unreadable or unknown,
// the server stays English, as it was before Phase 14.
import type { SupabaseClient } from "@supabase/supabase-js";
import { en, type Strings } from "../src/i18n/en.js";
import { fr } from "../src/i18n/fr.js";
import { LANG_SETTING_KEY } from "../src/types.js";

export type ServerLang = "en" | "fr";

export function stringsFor(lang: ServerLang): Strings {
  return lang === "fr" ? fr : en;
}

/** The locale the dates of a table's messages are written in ("1 nov." / "1 Nov"). */
export function localeOf(strings: Strings): string {
  return strings === fr ? "fr-FR" : "en-GB";
}

/** The stored choice, or English when there is none or the read fails. */
export async function readLang(db: SupabaseClient): Promise<ServerLang> {
  try {
    const { data, error } = await db.from("settings").select("value").eq("key", LANG_SETTING_KEY).maybeSingle();
    if (error) return "en";
    return (data as { value?: unknown } | null)?.value === "fr" ? "fr" : "en";
  } catch {
    return "en";
  }
}

export async function readStrings(db: SupabaseClient): Promise<Strings> {
  return stringsFor(await readLang(db));
}
