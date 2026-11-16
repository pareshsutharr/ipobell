// Lets the user choose a statements file and reads its bytes. The two native modules are loaded only here and
// only when asked, so an installed app built before they were added keeps working (it offers typing instead).
import { fileKind, MAX_FILE_BYTES, type FileKind } from "@/features/business/sheetRead";

export interface PickedFile {
  name: string;
  kind: FileKind;
  bytes: Uint8Array;
}

export class PickError extends Error {}

/** null = the user closed the picker without choosing. */
export async function pickStatementsFile(): Promise<PickedFile | null> {
  let picker: typeof import("expo-document-picker");
  let fs: typeof import("expo-file-system");
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    picker = require("expo-document-picker") as typeof import("expo-document-picker");
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    fs = require("expo-file-system") as typeof import("expo-file-system");
  } catch {
    throw new PickError("Choosing a file needs the latest version of the app. Please update, or type the figures in.");
  }

  // Any type is offered: phones label Excel and CSV files inconsistently. The file name decides what is accepted.
  const result = await picker.getDocumentAsync({ type: "*/*", copyToCacheDirectory: true, multiple: false });
  if (result.canceled || !result.assets?.length) return null;
  const asset = result.assets[0];
  const kind = fileKind(asset.name ?? "");
  if (!kind) throw new PickError("Please choose an Excel (.xlsx, .xls), CSV or PDF file.");
  if (typeof asset.size === "number" && asset.size > MAX_FILE_BYTES) throw new PickError("This file is larger than 10 MB.");

  let bytes: Uint8Array;
  try {
    bytes = new Uint8Array(await new fs.File(asset.uri).arrayBuffer());
  } catch {
    throw new PickError("The file could not be read. Please try again or type the figures in.");
  }
  if (bytes.byteLength === 0) throw new PickError("The file is empty.");
  if (bytes.byteLength > MAX_FILE_BYTES) throw new PickError("This file is larger than 10 MB.");
  return { name: asset.name, kind, bytes };
}
