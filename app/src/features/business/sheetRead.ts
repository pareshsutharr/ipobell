// Opens an Excel or CSV file (given as base64) and returns its cells. The file is read on the phone; nothing
// is sent anywhere by this module. The spreadsheet library is loaded only when a file is actually opened.
import type { Cell, Sheet } from "@/features/business/sheetParse";

export const MAX_FILE_BYTES = 10 * 1024 * 1024;

export type FileKind = "xlsx" | "xls" | "csv" | "pdf";

const KIND_BY_EXT: Record<string, FileKind> = { xlsx: "xlsx", xlsm: "xlsx", xls: "xls", csv: "csv", pdf: "pdf" };
export const MIME_BY_KIND: Record<FileKind, string> = {
  xlsx: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  xls: "application/vnd.ms-excel",
  csv: "text/csv",
  pdf: "application/pdf",
};
/** What the file picker is asked to show. */
export const PICKER_TYPES = [MIME_BY_KIND.xlsx, MIME_BY_KIND.xls, MIME_BY_KIND.csv, "text/comma-separated-values", MIME_BY_KIND.pdf];

/** The kind of file, from its name. null = not a kind we accept. */
export function fileKind(name: string): FileKind | null {
  const ext = name.toLowerCase().match(/\.([a-z0-9]{2,5})$/)?.[1];
  return ext ? KIND_BY_EXT[ext] ?? null : null;
}

export class SheetReadError extends Error {}

const B64 = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/";
const B64_LOOKUP: Record<string, number> = Object.fromEntries([...B64].map((ch, i) => [ch, i]));

/** base64 → bytes, without relying on atob (not present on every JavaScript engine the app runs on). */
export function base64ToBytes(b64: string): Uint8Array {
  const clean = b64.replace(/[\s=]+/g, "");
  const out = new Uint8Array(Math.floor((clean.length * 3) / 4));
  let o = 0;
  for (let i = 0; i < clean.length; i += 4) {
    const a = B64_LOOKUP[clean[i]];
    const b = B64_LOOKUP[clean[i + 1]];
    const c = B64_LOOKUP[clean[i + 2]];
    const d = B64_LOOKUP[clean[i + 3]];
    if (a === undefined || b === undefined || (clean[i + 2] !== undefined && c === undefined) || (clean[i + 3] !== undefined && d === undefined)) throw new SheetReadError("The file could not be read.");
    out[o++] = (a << 2) | (b >> 4);
    if (c !== undefined) out[o++] = ((b & 15) << 4) | (c >> 2);
    if (d !== undefined) out[o++] = ((c & 3) << 6) | d;
  }
  return out.subarray(0, o);
}

/** Cells of every sheet in an Excel or CSV file. Throws SheetReadError with a message that can be shown. */
export function readSheets(bytes: Uint8Array, kind: FileKind): Sheet[] {
  if (kind === "pdf") throw new SheetReadError("Figures cannot be read from a PDF. Please type them in.");
  if (bytes.byteLength === 0) throw new SheetReadError("The file is empty.");
  if (bytes.byteLength > MAX_FILE_BYTES) throw new SheetReadError("The file is larger than 10 MB.");
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const XLSX = require("xlsx") as typeof import("xlsx");
  let book: import("xlsx").WorkBook;
  try {
    book = XLSX.read(bytes, { type: "array", cellDates: true, cellFormula: false, cellHTML: false, cellStyles: false, sheetRows: 3000, dense: true });
  } catch {
    throw new SheetReadError("This file could not be opened. If it is protected with a password, remove the password and try again.");
  }
  const sheets: Sheet[] = [];
  for (const name of book.SheetNames.slice(0, 30)) {
    const ws = book.Sheets[name];
    if (!ws) continue;
    const rows = XLSX.utils.sheet_to_json<Cell[]>(ws, { header: 1, raw: true, defval: null, blankrows: false });
    if (rows.length) sheets.push({ name, rows });
  }
  if (!sheets.length) throw new SheetReadError("No sheets with data were found in this file.");
  return sheets;
}
