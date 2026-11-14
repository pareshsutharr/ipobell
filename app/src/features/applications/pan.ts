// PAN (Permanent Account Number) helpers — pure, unit-tested.

export const PAN_REGEX = /^[A-Z]{5}[0-9]{4}[A-Z]$/;

/** Uppercase and strip whitespace so "abcde 1234 f" → "ABCDE1234F". */
export function normalizePan(input: string): string {
  return (input ?? "").toUpperCase().replace(/\s+/g, "");
}

export function isValidPan(input: string): boolean {
  return PAN_REGEX.test(normalizePan(input));
}

/** "••••1234" from a last-4 string or a full PAN. */
export function maskPan(panOrLast4: string | null | undefined): string {
  const s = normalizePan(panOrLast4 ?? "");
  if (!s) return "••••";
  return `••••${s.slice(-4)}`;
}

/** Progressive hint while typing: which character class is expected next. */
export function panInputHint(input: string): string | null {
  const s = normalizePan(input);
  if (s.length === 0) return null;
  if (s.length >= 10) return isValidPan(s) ? null : "PAN must be 5 letters, 4 digits, 1 letter";
  const i = s.length;
  const expected = i < 5 || i === 9 ? "letter" : "digit";
  const got = s[i - 1];
  const prevOk = i < 5 ? /^[A-Z]+$/.test(s) : i <= 9 ? /^[A-Z]{5}[0-9]*$/.test(s) : true;
  if (!prevOk) return "PAN must be 5 letters, 4 digits, 1 letter";
  void got;
  return `${10 - i} more (${expected}s next)`;
}
