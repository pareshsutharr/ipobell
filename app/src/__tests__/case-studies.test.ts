/// <reference types="node" />
import { describe, expect, it, jest } from "@jest/globals";
import * as fs from "fs";
import * as path from "path";

jest.mock("@/lib/supabase", () => ({ supabase: {} }));

// eslint-disable-next-line import/first -- the mock above must be registered before this import
import { casesToShow, caseStudyMeta, caseStudyParagraphs, FALLBACK_CASE_STUDY, parseCaseStudy } from "@/features/business/caseStudies";

const row = (over: Record<string, unknown> = {}) => ({ id: "11111111-1111-1111-1111-111111111111", slug: "acme-textiles", title: "Acme Textiles", exchange: "BSE SME", listing_year: 2023, city: "Surat", summary: "A textile maker that listed in 2023.", body: "Para one.\n\nPara two.", highlights: [{ label: "Issue size", value: "₹12 Cr" }], hero_image_url: "https://x.supabase.co/storage/v1/object/public/insights/case-studies/a.jpg", ipo_id: null, ...over });

describe("reading a case study from the database", () => {
  it("maps a full row", () => {
    expect(parseCaseStudy(row())).toEqual({ id: "11111111-1111-1111-1111-111111111111", slug: "acme-textiles", title: "Acme Textiles", exchange: "BSE SME", listingYear: 2023, city: "Surat", summary: "A textile maker that listed in 2023.", body: "Para one.\n\nPara two.", highlights: [{ label: "Issue size", value: "₹12 Cr" }], heroImageUrl: "https://x.supabase.co/storage/v1/object/public/insights/case-studies/a.jpg", ipoId: null });
  });

  it("drops a row that cannot make a card", () => {
    expect(parseCaseStudy(row({ title: "" }))).toBeNull();
    expect(parseCaseStudy(row({ summary: null }))).toBeNull();
    expect(parseCaseStudy(row({ slug: undefined }))).toBeNull();
    expect(parseCaseStudy({})).toBeNull();
  });

  it("is strict about what it shows", () => {
    const c = parseCaseStudy(row({ hero_image_url: "javascript:alert(1)", listing_year: "2023", highlights: [{ label: "ok", value: "yes" }, { label: "", value: "x" }, "junk", null, { label: "no value" }], exchange: "  " }));
    expect(c?.heroImageUrl).toBeNull();
    expect(c?.listingYear).toBeNull();
    expect(c?.highlights).toEqual([{ label: "ok", value: "yes" }]);
    expect(c?.exchange).toBeNull();
    expect(parseCaseStudy(row({ hero_image_url: "http://insecure.example/a.jpg" }))?.heroImageUrl).toBeNull();
    expect(parseCaseStudy(row({ highlights: "not a list" }))?.highlights).toEqual([]);
    expect(parseCaseStudy(row({ highlights: Array.from({ length: 20 }, (_, i) => ({ label: `L${i}`, value: "v" })) }))?.highlights.length).toBe(8);
  });
});

describe("display helpers", () => {
  it("meta line skips what is missing", () => {
    expect(caseStudyMeta({ exchange: "NSE Emerge", listingYear: 2018, city: "Surat" })).toBe("NSE Emerge · 2018 · Surat");
    expect(caseStudyMeta({ exchange: null, listingYear: 2018, city: null })).toBe("2018");
    expect(caseStudyMeta({ exchange: null, listingYear: null, city: null })).toBe("");
  });

  it("splits the story into paragraphs on blank lines", () => {
    expect(caseStudyParagraphs("One.\n\nTwo line\nwrapped.\r\n\r\n\r\nThree.  ")).toEqual(["One.", "Two line wrapped.", "Three."]);
    expect(caseStudyParagraphs(null)).toEqual([]);
    expect(caseStudyParagraphs("   ")).toEqual([]);
  });
});

describe("what the Get Listed tab shows", () => {
  const a = parseCaseStudy(row())!;

  it("the published list when it loaded", () => {
    expect(casesToShow([a], false)).toEqual([a]);
  });

  it("nothing when the team has published none", () => {
    expect(casesToShow([], false)).toEqual([]);
  });

  it("the built-in case study only when the list could not be loaded at all", () => {
    expect(casesToShow(undefined, true)).toEqual([FALLBACK_CASE_STUDY]);
    expect(casesToShow(undefined, false)).toEqual([]); // still loading
  });

  it("the built-in case study is word for word what the database is seeded with", () => {
    const sql = fs.readFileSync(path.join(__dirname, "../../../supabase/migrations/20261114001300_case_studies.sql"), "utf8");
    expect(sql).toContain(`'${FALLBACK_CASE_STUDY.summary}'`);
    expect(sql).toContain(`'${FALLBACK_CASE_STUDY.slug}', 'published', '${FALLBACK_CASE_STUDY.title}', '${FALLBACK_CASE_STUDY.exchange}', ${FALLBACK_CASE_STUDY.listingYear}, '${FALLBACK_CASE_STUDY.city}'`);
  });

  it("the hard-coded card is gone from the Get Listed screen", () => {
    const screen = fs.readFileSync(path.join(__dirname, "../app/(tabs)/(business)/business.tsx"), "utf8");
    expect(screen).not.toMatch(/Aaron Industries/);
    expect(screen).toMatch(/<CaseStudies \/>/);
  });
});
