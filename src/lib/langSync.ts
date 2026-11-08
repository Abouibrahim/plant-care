// Keeps the server's language row in step with the choice stored on this phone (Phase 14, review
// 4.2): Settings writes the row when the language is chosen, but that write can be cut by the reload
// that follows, or fail offline, so the app writes it again whenever it opens with a connection and
// the row differs. Without a stored choice (the phone's language decides the screens) nothing is
// written, and the server stays English.
import { storedLang } from "../i18n";
import { loadLang, saveLang } from "./db";

let synced: Promise<void> | null = null;

/**
 * Runs once per app session (Layout calls it at mount); a later caller gets the same promise, so the
 * Language card reads the row once the write has landed rather than the value it was about to replace.
 */
export function syncLangWithServer(): Promise<void> {
  synced ??= sync();
  return synced;
}

async function sync(): Promise<void> {
  const stored = storedLang();
  if (!stored) return;
  try {
    if ((await loadLang()) !== stored) await saveLang(stored);
  } catch {
    // Offline, or the settings table missing: the next open tries again.
  }
}
