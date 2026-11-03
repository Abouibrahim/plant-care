// Hands a text to the phone's share sheet (Android: WhatsApp, SMS, e-mail), or copies it where there
// is none, for the list a kind of work is handed out with (Phase 13). The navigator is passed in, so
// the tests can stand in for it.

export type ShareOutcome = "shared" | "copied" | "cancelled";

export interface ShareTarget {
  share?: (data: { text: string }) => Promise<void>;
  clipboard?: { writeText(text: string): Promise<void> };
}

/**
 * Opens the share sheet with the text alone (no title and no link, so a chat shows its first line
 * once). The share is asked for before anything is awaited, so it runs within the tap. A dismissed
 * sheet is "cancelled". With no share sheet, or when it refuses (no tap, a sheet already open), the
 * text is copied instead; throws when neither works.
 */
export async function shareText(text: string, nav: ShareTarget = navigator): Promise<ShareOutcome> {
  if (typeof nav.share === "function") {
    try {
      await nav.share({ text });
      return "shared";
    } catch (err) {
      if ((err as { name?: unknown } | null)?.name === "AbortError") return "cancelled";
      // refused: the text is copied instead
    }
  }
  if (!nav.clipboard) throw new Error("No share sheet and no clipboard");
  await nav.clipboard.writeText(text);
  return "copied";
}
