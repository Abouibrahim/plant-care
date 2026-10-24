// The active string table. The choice is stored under plantcare.lang; without one, the phone's
// language decides (French when it starts with "fr"), English otherwise. `t` is a module constant
// imported everywhere, so a change takes effect after a reload: Settings reloads the app on saving.
// The functions under api/ import `en` directly and never read this file.
import { en, type Strings } from "./en";
import { fr } from "./fr";

export type Lang = "en" | "fr";
export const LANGS: Lang[] = ["en", "fr"];
export const LANG_KEY = "plantcare.lang";

function isLang(value: unknown): value is Lang {
  return value === "en" || value === "fr";
}

function detectLang(): Lang {
  try {
    const stored = localStorage.getItem(LANG_KEY);
    if (isLang(stored)) return stored;
  } catch {
    // storage blocked or unavailable: the phone's language decides
  }
  const phone = typeof navigator !== "undefined" ? navigator.language : "";
  return /^fr\b/i.test(phone) ? "fr" : "en";
}

/** The language this load runs in. */
export const lang: Lang = detectLang();

export const t: Strings = lang === "fr" ? fr : en;

/** Stores the choice for the next load; false when storage is blocked. The caller reloads the app. */
export function storeLang(next: Lang): boolean {
  try {
    localStorage.setItem(LANG_KEY, next);
    return true;
  } catch {
    return false;
  }
}

if (typeof document !== "undefined") document.documentElement.lang = lang;

export type { Strings } from "./en";
