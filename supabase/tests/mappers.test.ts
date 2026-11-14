// Run with:  node --test supabase/tests   (Node 22.18+ / 24 strips types natively)
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  addDays,
  deriveStatus,
  detectEvents,
  fmtInr,
  gmpReadingToHistoryRow,
  istDate,
  mapDetail,
  mapDocuments,
  mapFinancials,
  mapGmpHistoryRows,
  mapListRow,
  mapSubscriptionRows,
  milestoneFor,
  num,
  type ApiListRow,
  type PrevIpoState,
} from "../functions/_shared/mappers.ts";

const listRow: ApiListRow = {
  slug: "demo-ipo",
  name: "Demo Ltd",
  display_name: "Demo",
  type: "Mainboard",
  sub_type: "Equity",
  status: "Open",
  stage: "live",
  dates_tba: false,
  is_listed: false,
  logo: "https://x/logo.webp",
  open_date: "2026-10-26",
  close_date: "2026-10-28",
  allotment_date: "2026-10-29",
  listing_date: "2026-11-02",
  price_band: "1585-1665",
  price_min: 1585,
  price_max: 1665,
  issue_price: "1665",
  issue_size: "1200",
  lot_size: 9,
  min_investment: 14985,
  gmp: { price: "35", percentage: "2.10", kostak: null, subject_to_sauda: "300,,4200", estimated_listing_price: 1700, updated_at: "2026-10-26T07:42:07.000000Z" },
  subscription_total: "0.06",
  listing_price: null,
  listing_gain_percent: null,
  cmp: null,
  current_gain_percent: null,
  web_url: "https://x/ipo/demo-ipo",
};

test("num() parses API strings safely", () => {
  assert.equal(num("1,23,456"), 123456);
  assert.equal(num("82"), 82);
  assert.equal(num(""), null);
  assert.equal(num(null), null);
  assert.equal(num("21,62,161 shares"), 2162161);
  assert.equal(num("28.96%"), 28.96);
  assert.equal(num("abc"), null);
});

test("deriveStatus()", () => {
  assert.equal(deriveStatus({ status: "Closed", is_listed: true }), "listed");
  assert.equal(deriveStatus({ status: "Closed", is_listed: false }), "closed");
  assert.equal(deriveStatus({ status: "Open" }), "open");
  assert.equal(deriveStatus({ status: "Upcoming", dates_tba: true }), "upcoming");
  assert.equal(deriveStatus({ status: "weird" }), "upcoming");
});

test("istDate / addDays", () => {
  assert.equal(istDate("2026-10-26T20:00:00Z"), "2026-10-27"); // 01:30 IST next day
  assert.equal(istDate("2026-10-26T07:42:07Z"), "2026-10-26");
  assert.equal(addDays("2026-10-31", 1), "2026-11-01");
  assert.equal(addDays("2026-01-01", -1), "2025-12-31");
});

test("fmtInr uses Indian grouping", () => {
  assert.equal(fmtInr(14985), "₹14,985");
  assert.equal(fmtInr(1234567), "₹12,34,567");
  assert.equal(fmtInr(82.5), "₹82.50");
  assert.equal(fmtInr(-10), "-₹10");
});

test("mapListRow maps every list field", () => {
  const r = mapListRow(listRow, "2026-10-26T10:00:00.000Z");
  assert.equal(r.slug, "demo-ipo");
  assert.equal(r.board, "mainboard");
  assert.equal(r.status, "open");
  assert.equal(r.price_min, 1585);
  assert.equal(r.issue_price, 1665);
  assert.equal(r.issue_size_cr, 1200);
  assert.equal(r.gmp, 35);
  assert.equal(r.gmp_percent, 2.1);
  assert.equal(r.gmp_expected_price, 1700);
  assert.equal(r.gmp_updated_at, "2026-10-26T07:42:07.000Z");
  assert.equal(r.sub_total, 0.06);
  assert.equal(r.listing_price, null);
  assert.deepEqual(r.raw_data, { list: listRow });
  assert.equal(mapListRow({ ...listRow, type: "SME", sub_type: "BSE SME" }).board, "sme");
});

test("mapDetail maps nested detail document", () => {
  const d = mapDetail({
    slug: "demo-ipo",
    name: "Demo Ltd",
    type: "Mainboard",
    status: "Open",
    images: { logo: "https://x/l.webp", feature: null },
    timeline: { open_date: "2026-10-26", close_date: "2026-10-28", allotment_date: "2026-10-29", refund_date: "2026-10-30", credit_to_demat_date: "2026-10-30", listing_date: "2026-11-02" },
    issue: { issue_size: "1200", issue_price: "1665", price_band: "1585-1665", price_min: 1585, price_max: 1665, face_value: "5", lot_size: 9, min_investment: 14985, sale_type: "Offer for sale only", listing_on: "BSE, NSE", bse_scrip_code: "8054", nse_symbol: null },
    subscription_summary: { total: "0.06", qib: "0.08", nii: "0.11", retail: "0.02", employee: "0", shareholder: "0", anchor: null, applications: null, updated_at: "2026-10-26T08:10:28.000000Z" },
    listing: { listing_price: null, listing_gain_percent: null, cmp: null, cmp_updated_at: null, current_gain_percent: null },
    company: { about: "About", description: "Desc", strengths: ["a", ""], risks: ["r"], objects_of_issue: { items: [{ object: "x", amount: "" }], text: null }, financials: { headers: ["31 Mar 2026"], rows: [{ metric: "Revenue from Operations", data: ["869.54"] }], unit: "Rs. Crore" }, kpis: [{ key: "pe", label: "P/E", value: "33.35" }], promoters_text: "P", promoters: [], pre_holding: "95%", post_holding: "83%" },
    contacts: { company: { email: "a@b" }, registrar: { name: "MUFG", status_page: null, driver: "mufg" }, lead_managers: [{ name: "Axis" }] },
    documents: { rhp: "https://x/rhp.pdf", drhp: null, anchor: null, boa: null },
  }, "2026-10-26T10:00:00.000Z");
  assert.equal(d.refund_date, "2026-10-30");
  assert.equal(d.face_value, 5);
  assert.equal(d.sub_qib, 0.08);
  assert.deepEqual(d.strengths, ["a"]);
  assert.equal(d.registrar.name, "MUFG");
  assert.equal(d.lead_managers.length, 1);
  assert.equal(d.pre_issue_holding, "95%");
});

test("mapFinancials flattens headers × rows and maps metrics", () => {
  const rows = mapFinancials("ipo-1", {
    headers: ["30 Jun 2026", "31 Mar 2026"],
    rows: [
      { metric: "Revenue from Operations", data: ["275.53", "869.54"] },
      { metric: "Profit After Tax", data: ["80.71", "265.20"] },
      { metric: "Net Worth", data: ["1160.38", "1075.54"] },
      { metric: "Total Borrowing", data: ["399.20", ""] },
      { metric: "Total Assets", data: ["2101.84", "2170.28"] },
    ],
    unit: "Rs. Crore",
  });
  assert.equal(rows.length, 2);
  assert.equal(rows[0].period, "30 Jun 2026");
  assert.equal(rows[0].period_order, 0);
  assert.equal(rows[0].revenue, 275.53);
  assert.equal(rows[0].profit, 80.71);
  assert.equal(rows[0].net_worth, 1160.38);
  assert.equal(rows[0].total_borrowing, 399.2);
  assert.equal(rows[1].total_borrowing, null);
  assert.equal(rows[1].total_assets, 2170.28);
  assert.equal(rows[0].raw["Revenue from Operations"], 275.53);
  assert.deepEqual(mapFinancials("x", null), []);
});

test("mapDocuments skips nulls and non-urls", () => {
  const docs = mapDocuments("ipo-1", { rhp: "https://a/rhp", drhp: null, anchor: "not a url", boa: "http://b" });
  assert.deepEqual(docs.map((d) => d.kind), ["rhp", "boa"]);
  assert.equal(docs[0].title, "Red Herring Prospectus (RHP)");
});

test("mapSubscriptionRows flattens the category tree with a stable snapshot time", () => {
  const rows = mapSubscriptionRows("ipo-1", {
    slug: "demo-ipo",
    summary: { total: "0.06", updated_at: "2026-10-26T08:10:28.000000Z" },
    categories: [
      { key: "QIB", label: "QIB", times: "0.08", times_value: 0.08, shares_offered: "1514195", shares_applied: "120150", demand_crore: 20, sub_categories: [{ key: "FII", times: "", times_value: null, shares_applied: "120150", demand_crore: 20 }, { key: "MF", times: "", times_value: null, shares_applied: null, demand_crore: null }] },
      { key: "TOTAL", times: "0.06", times_value: 0.06, shares_offered: "5299684", shares_applied: "312372", demand_crore: 52.01, sub_categories: [] },
    ],
  });
  assert.equal(rows.length, 3); // QIB, FII, TOTAL (MF skipped: empty)
  assert.equal(rows[0].snapshot_time, "2026-10-26T08:10:28.000Z");
  assert.equal(rows[0].parent_key, "");
  assert.equal(rows[1].parent_key, "QIB");
  assert.equal(rows[0].shares_offered, 1514195);
  assert.equal(rows[2].times_subscribed, 0.06);
});

test("mapGmpHistoryRows + live reading → history row", () => {
  const rows = mapGmpHistoryRows("ipo-1", { trend: [{ date: "2026-10-23", price: "121", price_value: 121, percentage: "7.27", estimated_listing_price: 1786 }] });
  assert.equal(rows[0].recorded_on, "2026-10-23");
  assert.equal(rows[0].gmp, 121);
  const live = gmpReadingToHistoryRow("ipo-1", { gmp: 35, gmp_percent: 2.1, gmp_expected_price: 1700, gmp_kostak: null, gmp_subject_to_sauda: null, gmp_updated_at: "2026-10-26T19:00:00.000Z" });
  assert.equal(live?.recorded_on, "2026-10-27"); // IST
  assert.equal(gmpReadingToHistoryRow("ipo-1", { gmp: null, gmp_percent: null, gmp_expected_price: null, gmp_kostak: null, gmp_subject_to_sauda: null, gmp_updated_at: null }), null);
});

test("milestoneFor", () => {
  assert.equal(milestoneFor(0.5), null);
  assert.equal(milestoneFor(1), 1);
  assert.equal(milestoneFor(7.3), 5);
  assert.equal(milestoneFor(150), 100);
  assert.equal(milestoneFor(null), null);
});

const prev: PrevIpoState = { status: "open", open_date: "2026-10-26", gmp: 20, gmp_percent: 1.2, listing_price: null, sub_total: 0.9, sub_retail: 0.8, sub_nii: 0.5, sub_qib: 0.1 };

test("detectEvents: new IPO only for fresh upcoming/open issues", () => {
  const next = mapListRow({ ...listRow, status: "Upcoming" });
  const ev = detectEvents(null, next, { today: "2026-10-26" });
  assert.equal(ev.length, 1);
  assert.equal(ev[0].type, "new_ipo");
  assert.equal(ev[0].dedupeKey, "new_ipo:demo-ipo");
  // old backfilled IPO → no event
  assert.equal(detectEvents(null, mapListRow({ ...listRow, open_date: "2025-01-01" }), { today: "2026-10-26" }).length, 0);
  // already known → no new_ipo event
  assert.equal(detectEvents(prev, next, { today: "2026-10-26" }).filter((e) => e.type === "new_ipo").length, 0);
});

test("detectEvents: subscription milestones fire once per level, per category", () => {
  const next = { ...mapListRow(listRow), sub_total: 2.4, sub_retail: 1.1, sub_nii: 0.6, sub_qib: 0.1 };
  const ev = detectEvents(prev, next, { today: "2026-10-26", gmpThresholdPct: 100 });
  const keys = ev.map((e) => e.dedupeKey).sort();
  assert.deepEqual(keys, ["milestone:demo-ipo:sub_retail:1", "milestone:demo-ipo:sub_total:2"]);
  // same state again → prev now equals next → nothing
  const again = detectEvents({ ...prev, sub_total: 2.4, sub_retail: 1.1 }, next, { today: "2026-10-26", gmpThresholdPct: 100 });
  assert.equal(again.length, 0);
});

test("detectEvents: GMP change respects threshold and direction-per-day dedupe", () => {
  const up = { ...mapListRow(listRow), gmp_percent: 4.5, gmp: 75 };
  const ev = detectEvents(prev, up, { today: "2026-10-26", gmpThresholdPct: 2 });
  assert.equal(ev.filter((e) => e.type === "gmp_change").length, 1);
  assert.equal(ev.find((e) => e.type === "gmp_change")?.dedupeKey, "gmp_change:demo-ipo:2026-10-26:up");
  const small = { ...mapListRow(listRow), gmp_percent: 2.1 };
  assert.equal(detectEvents(prev, small, { today: "2026-10-26", gmpThresholdPct: 2 }).filter((e) => e.type === "gmp_change").length, 0);
});

test("detectEvents: listing result once when listing price appears", () => {
  const listed = mapListRow({ ...listRow, status: "Closed", is_listed: true, listing_price: "1800", listing_gain_percent: 8.11, close_date: "2026-10-24" });
  const ev = detectEvents({ ...prev, status: "closed" }, listed, { today: "2026-10-26" });
  assert.equal(ev.length, 1);
  assert.equal(ev[0].type, "listed");
  assert.match(ev[0].title, /listed at ₹1,800/);
  // already had listing price → no repeat
  assert.equal(detectEvents({ ...prev, status: "listed", listing_price: 1800 }, listed, { today: "2026-10-26" }).length, 0);
});
