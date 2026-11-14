/// <reference types="node" />
import { describe, expect, it } from "@jest/globals";
import * as fs from "fs";
import * as path from "path";

// Guards for the legal and consent text. These fail when someone shows the house view somewhere new without the
// disclaimer, or collects a PAN without the consent line.

const SRC = path.join(__dirname, "..");

function sourceFiles(dir: string): string[] {
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap((e) => {
    const full = path.join(dir, e.name);
    if (e.isDirectory()) return e.name === "__tests__" ? [] : sourceFiles(full);
    return /\.tsx?$/.test(e.name) ? [full] : [];
  });
}
const files = sourceFiles(SRC).map((f) => ({ file: path.relative(SRC, f), text: fs.readFileSync(f, "utf8") }));
const read = (rel: string) => fs.readFileSync(path.join(SRC, rel), "utf8");

describe("house view disclaimer", () => {
  it("has one wording, and it says the right things", () => {
    const verdict = read("features/insights/verdict.ts");
    const full = /export const HOUSE_VIEW_DISCLAIMER = "([^"]+)"/.exec(verdict)?.[1] ?? "";
    const short = /export const HOUSE_VIEW_DISCLAIMER_SHORT = "([^"]+)"/.exec(verdict)?.[1] ?? "";
    expect(full).toMatch(/opinion/i);
    expect(full).toMatch(/not SEBI-registered investment advice/);
    expect(short).toMatch(/not investment advice/);
  });

  it("every screen that shows a verdict label also shows the disclaimer", () => {
    const showing = files.filter((f) => f.file.endsWith(".tsx") && /verdictMeta\(/.test(f.text) && /\b(verdict|v)\.label\b/.test(f.text));
    expect(showing.map((f) => f.file).sort()).toEqual(["features/insights/components/InsightSection.tsx", "features/insights/components/LatestInsights.tsx", "features/insights/components/ResearchNote.tsx"]);
    for (const f of showing) {
      expect({ file: f.file, hasDisclaimer: /\{HOUSE_VIEW_DISCLAIMER(_SHORT)?\}/.test(f.text) }).toEqual({ file: f.file, hasDisclaimer: true });
    }
  });

  it("verdict labels never use buy / sell / subscribe / avoid", () => {
    const verdict = read("features/insights/verdict.ts");
    const labels = [...verdict.matchAll(/label: "([^"]+)"/g)].map((m) => m[1]);
    expect(labels.length).toBe(3);
    for (const l of labels) expect(l).not.toMatch(/\b(buy|sell|subscribe|avoid|apply)\b/i);
  });
});

describe("PAN consent", () => {
  it("the consent line covers storage, the registrar and removal", () => {
    const text = /export const PAN_CONSENT_TEXT =\s*"([^"]+)"/.exec(read("features/applications/pan.ts"))?.[1] ?? "";
    expect(text).toMatch(/encrypted/);
    expect(text).toMatch(/registrar/);
    expect(text).toMatch(/Remove it any time/);
  });

  it("every screen that saves a PAN shows the consent line", () => {
    const saving = files.filter((f) => f.file.endsWith(".tsx") && /useAddPan\(/.test(f.text));
    expect(saving.length).toBeGreaterThanOrEqual(2);
    for (const f of saving) expect({ file: f.file, hasConsent: /\{PAN_CONSENT_TEXT\}/.test(f.text) }).toEqual({ file: f.file, hasConsent: true });
  });
});

describe("privacy policy and welcome screen", () => {
  const privacy = read("app/(tabs)/(home,watchlist,profile,business)/legal/privacy.tsx");

  it("discloses each kind of data the app really collects", () => {
    for (const topic of [/usage events/i, /searches/i, /PAN numbers/i, /registrar/i, /Business enquiries/i, /Error reports/i, /Push token/i, /18 months/, /90 days/]) {
      expect(privacy).toMatch(topic);
    }
  });

  it("does not promise things the app does not do", () => {
    expect(privacy).not.toMatch(/purchase records/i);
    expect(privacy).not.toMatch(/when you first open the app we create an anonymous account/i);
    expect(privacy).not.toMatch(/label: "Email support", url: env\.links\.support/);
  });

  it("the welcome screen says usage is recorded before the user continues", () => {
    const welcome = read("app/welcome.tsx");
    expect(welcome).toMatch(/recording how you use the app/);
    expect(welcome).toMatch(/privacy policy/);
  });
});
