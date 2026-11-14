/**
 * Copy text to the clipboard without hard-depending on the native module at import time.
 * Older development builds compiled before expo-clipboard was added would otherwise crash
 * the whole screen on load; here they just report "copy unavailable".
 */
export async function copyToClipboard(text: string): Promise<boolean> {
  try {
    const Clipboard = await import("expo-clipboard");
    await Clipboard.setStringAsync(text);
    return true;
  } catch {
    return false;
  }
}
