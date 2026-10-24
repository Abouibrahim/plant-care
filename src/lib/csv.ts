// CSV files downloaded from the browser (Settings → Export). RFC 4180 quoting, CRLF line ends and a
// UTF-8 byte-order mark, which is what makes Excel read the Arabic names instead of mojibake.

const BOM = "﻿";

/** One cell: quoted when it holds a comma, a quote, a line break or outer spaces; quotes doubled. */
export function csvCell(value: string | number | boolean | null | undefined): string {
  if (value === null || value === undefined) return "";
  const text = typeof value === "string" ? value : String(value);
  return /[",\r\n]/.test(text) || text !== text.trim() ? `"${text.replace(/"/g, '""')}"` : text;
}

/** The whole file: a header row then one row per record, with the BOM in front. */
export function toCsv(header: string[], rows: Array<Array<string | number | boolean | null | undefined>>): string {
  const lines = [header, ...rows].map((row) => row.map(csvCell).join(","));
  return BOM + lines.join("\r\n") + "\r\n";
}

/**
 * Hands the text to the browser as a file download. Chrome on Android saves it to Downloads;
 * the object URL is released once the click has been dispatched.
 */
export function downloadText(filename: string, text: string, mime = "text/csv;charset=utf-8"): void {
  const blob = new Blob([text], { type: mime });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.rel = "noopener";
  a.style.display = "none";
  document.body.appendChild(a);
  a.click();
  setTimeout(() => {
    a.remove();
    URL.revokeObjectURL(url);
  }, 1000);
}
