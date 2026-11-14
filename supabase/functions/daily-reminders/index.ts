// daily-reminders — date-driven alerts.
//
// POST { mode: "morning" | "closing_soon" | "evening", date?: "YYYY-MM-DD" (IST, for testing) }
//   morning      (08:30 IST): opens today, closes today, allotment today, refund / demat credit today, listing today
//   closing_soon (15:00 IST): closes in ~2 hours (retail bidding closes 17:00 IST)
//   evening      (19:00 IST): allotment tomorrow, listing tomorrow
//
// Each reminder is deduped per IPO per date; users eligible for several IPOs get one grouped push.

import { adminClient, isTrustedCaller } from "../_shared/auth.ts";
import { error, handleOptions, json, readJson } from "../_shared/http.ts";
import { addDays, fmtInr, istDate } from "../_shared/mappers.ts";
import { dispatch, type NotificationItem, type NotificationType } from "../_shared/notify.ts";

type Mode = "morning" | "closing_soon" | "evening";

interface IpoRow {
  id: string;
  slug: string;
  name: string;
  board: "mainboard" | "sme";
  status: string;
  logo_url: string | null;
  open_date: string | null;
  close_date: string | null;
  allotment_date: string | null;
  refund_date: string | null;
  credit_to_demat_date: string | null;
  listing_date: string | null;
  price_band: string | null;
  price_max: number | null;
  lot_size: number | null;
  min_investment: number | null;
  gmp: number | null;
  gmp_percent: number | null;
  sub_total: number | null;
  registrar: { name?: string; status_page?: string | null; website?: string | null } | null;
}

const SELECT = "id, slug, name, board, status, logo_url, open_date, close_date, allotment_date, refund_date, credit_to_demat_date, listing_date, price_band, price_max, lot_size, min_investment, gmp, gmp_percent, sub_total, registrar";

Deno.serve(async (req) => {
  const opt = handleOptions(req);
  if (opt) return opt;
  if (!isTrustedCaller(req)) return error("Unauthorized", 401);

  const body = await readJson<{ mode?: Mode; date?: string; dryRun?: boolean }>(req);
  const mode: Mode = body.mode ?? "morning";
  const today = body.date ?? istDate();
  const tomorrow = addDays(today, 1);
  const admin = adminClient();

  const groups: { type: NotificationType; items: NotificationItem[]; groupTitle: (n: number) => string }[] = [];

  const fetchBy = async (column: string, date: string, extra?: Record<string, string>) => {
    let q = admin.from("ipos").select(SELECT).eq(column, date).eq("dates_tba", false);
    for (const [k, v] of Object.entries(extra ?? {})) q = q.eq(k, v);
    const { data, error: e } = await q;
    if (e) throw new Error(e.message);
    return (data ?? []) as IpoRow[];
  };

  const boardTag = (r: IpoRow) => (r.board === "sme" ? "SME" : "Mainboard");
  // SME IPOs: retail minimum is 2 lots (SEBI 2025 framework); the feed's min_investment is one lot.
  const minInvest = (r: IpoRow) => {
    const lots = r.board === "sme" ? 2 : 1;
    const amt = r.lot_size && r.price_max ? r.lot_size * r.price_max * lots : r.min_investment ? r.min_investment * lots : null;
    return amt ? `${fmtInr(amt)}${lots > 1 ? ` (${lots} lots)` : ""}` : "—";
  };
  const gmpTxt = (r: IpoRow) => (r.gmp !== null && r.gmp_percent !== null ? ` · GMP ${fmtInr(r.gmp)} (${r.gmp_percent >= 0 ? "+" : ""}${r.gmp_percent}%)` : "");
  const registrarData = (r: IpoRow): Record<string, string> => {
    const url = r.registrar?.status_page || r.registrar?.website || "";
    return url ? { registrar_url: url, registrar: r.registrar?.name ?? "" } : {};
  };
  const mk = (type: NotificationType, r: IpoRow, title: string, text: string, extra: Record<string, string> = {}): NotificationItem => ({
    type,
    ipoId: r.id,
    slug: r.slug,
    name: r.name,
    dedupeKey: `${type}:${r.slug}:${today}`,
    title,
    body: text,
    data: { type, slug: r.slug, board: r.board, ...extra },
    imageUrl: r.logo_url ?? undefined,
  });

  try {
    if (mode === "morning") {
      const opens = await fetchBy("open_date", today);
      groups.push({
        type: "opens_today",
        groupTitle: (n) => `${n} IPOs open today`,
        items: opens.map((r) =>
          mk("opens_today", r, `${r.name} IPO opens today`, `${boardTag(r)} · Price band ₹${r.price_band ?? "—"} · Lot ${r.lot_size ?? "—"} · Min ${minInvest(r)}${gmpTxt(r)}`)
        ),
      });

      const closes = await fetchBy("close_date", today);
      groups.push({
        type: "closes_today",
        groupTitle: (n) => `${n} IPOs close today`,
        items: closes.map((r) =>
          mk("closes_today", r, `Last day: ${r.name} IPO closes today`, `Bidding closes 5:00 PM IST${r.sub_total !== null ? ` · Subscribed ${r.sub_total}x so far` : ""}${gmpTxt(r)}`)
        ),
      });

      const allot = await fetchBy("allotment_date", today);
      groups.push({
        type: "allotment",
        groupTitle: (n) => `Allotment today for ${n} IPOs`,
        items: allot.map((r) =>
          mk("allotment", r, `${r.name}: allotment expected today`, `Check your allotment status on ${r.registrar?.name ?? "the registrar's site"}. Tap to check.`, registrarData(r))
        ),
      });

      const refunds = await fetchBy("refund_date", today);
      const demat = await fetchBy("credit_to_demat_date", today);
      const seen = new Set<string>();
      const refundItems: NotificationItem[] = [];
      for (const r of [...refunds, ...demat]) {
        if (seen.has(r.slug)) continue;
        seen.add(r.slug);
        const both = r.refund_date === today && r.credit_to_demat_date === today;
        const what = both ? "Refunds & demat credit" : r.refund_date === today ? "Refunds" : "Demat credit";
        refundItems.push(mk(both || r.refund_date === today ? "refund" : "demat_credit", r, `${r.name}: ${what.toLowerCase()} today`, `${what} for ${r.name} IPO are expected today. Listing on ${fmtDate(r.listing_date)}.`));
      }
      groups.push({ type: "refund", groupTitle: (n) => `Refunds / demat credit today for ${n} IPOs`, items: refundItems });

      const listing = await fetchBy("listing_date", today);
      groups.push({
        type: "listing_today",
        groupTitle: (n) => `${n} IPOs list today`,
        items: listing.map((r) => mk("listing_today", r, `${r.name} lists today`, `Listing at 10:00 AM on ${boardTag(r) === "SME" ? "SME platform" : "NSE & BSE"}${r.gmp !== null && r.price_max !== null ? ` · Est. ${fmtInr(r.price_max + r.gmp)} (GMP ${fmtInr(r.gmp)})` : ""}`)),
      });
    }

    if (mode === "closing_soon") {
      const closes = await fetchBy("close_date", today, { status: "open" });
      groups.push({
        type: "closing_soon",
        groupTitle: (n) => `${n} IPOs close in 2 hours`,
        items: closes.map((r) =>
          mk("closing_soon", r, `${r.name} IPO closes in 2 hours`, `Bidding window closes at 5:00 PM IST${r.sub_total !== null ? ` · Subscribed ${r.sub_total}x` : ""}${gmpTxt(r)}`)
        ),
      });
    }

    if (mode === "evening") {
      const allotTomorrow = await fetchBy("allotment_date", tomorrow);
      groups.push({
        type: "allotment_tomorrow",
        groupTitle: (n) => `Allotment tomorrow for ${n} IPOs`,
        items: allotTomorrow.map((r) => mk("allotment_tomorrow", r, `${r.name}: allotment tomorrow`, `Basis of allotment expected ${fmtDate(tomorrow)}. We'll remind you to check with ${r.registrar?.name ?? "the registrar"}.`, registrarData(r))),
      });
      const listTomorrow = await fetchBy("listing_date", tomorrow);
      groups.push({
        type: "listing_tomorrow",
        groupTitle: (n) => `${n} IPOs list tomorrow`,
        items: listTomorrow.map((r) => mk("listing_tomorrow", r, `${r.name} lists tomorrow`, `Listing ${fmtDate(tomorrow)} at 10:00 AM${gmpTxt(r)}`)),
      });
    }

    const results: Record<string, unknown> = {};
    for (const g of groups) {
      if (!g.items.length) continue;
      if (body.dryRun) {
        results[g.type] = { dryRun: true, items: g.items.map((i) => i.dedupeKey) };
        continue;
      }
      results[g.type] = await dispatch(admin, g.items, { groupTitle: g.groupTitle });
    }
    return json({ ok: true, mode, date: today, results });
  } catch (e) {
    console.error("daily-reminders failed", e);
    return error(e instanceof Error ? e.message : String(e), 500);
  }
});

function fmtDate(d: string | null): string {
  if (!d) return "TBA";
  return new Date(`${d}T00:00:00Z`).toLocaleDateString("en-IN", { day: "numeric", month: "short", timeZone: "UTC" });
}
