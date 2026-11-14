import { describe, expect, it } from "@jest/globals";

import { isValidPan, maskPan, normalizePan, panInputHint } from "@/features/applications/pan";

describe("PAN helpers", () => {
  it("normalizes case and whitespace", () => {
    expect(normalizePan(" abcde 1234 f ")).toBe("ABCDE1234F");
    expect(normalizePan("")).toBe("");
  });

  it("validates the PAN format", () => {
    expect(isValidPan("ABCDE1234F")).toBe(true);
    expect(isValidPan("abcde1234f")).toBe(true);
    expect(isValidPan("ABCD1234F")).toBe(false);
    expect(isValidPan("ABCDE12345")).toBe(false);
    expect(isValidPan("1BCDE1234F")).toBe(false);
    expect(isValidPan("")).toBe(false);
  });

  it("masks to the last four characters", () => {
    expect(maskPan("ABCDE1234F")).toBe("••••234F");
    expect(maskPan("234F")).toBe("••••234F");
    expect(maskPan(null)).toBe("••••");
  });

  it("gives progressive hints while typing", () => {
    expect(panInputHint("")).toBeNull();
    expect(panInputHint("ABC")).toBe("7 more (letters next)");
    expect(panInputHint("ABCDE12")).toBe("3 more (digits next)");
    expect(panInputHint("ABCDE1234")).toBe("1 more (letters next)");
    expect(panInputHint("ABCDE1234F")).toBeNull();
    expect(panInputHint("AB1")).toBe("PAN must be 5 letters, 4 digits, 1 letter");
  });
});
