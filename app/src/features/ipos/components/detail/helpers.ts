import * as Calendar from "expo-calendar";
import * as WebBrowser from "expo-web-browser";
import { Alert, Linking, Share } from "react-native";

import { retailMinimum } from "@/features/ipos/lots";
import type { Ipo } from "@/features/ipos/types";
import { track } from "@/lib/analytics";
import { dateLong, dateRange, inr, pct } from "@/lib/format";

export async function openUrl(url: string | null | undefined) {
  if (!url) return;
  const normalized = /^https?:\/\//i.test(url) ? url : `https://${url}`;
  try {
    track("external_link", { url: normalized, host: new URL(normalized).host.replace(/^www\./, "") });
  } catch {
    // unparsable URL: still try to open it
  }
  try {
    await WebBrowser.openBrowserAsync(normalized, { presentationStyle: WebBrowser.WebBrowserPresentationStyle.FULL_SCREEN });
  } catch {
    Linking.openURL(normalized).catch(() => undefined);
  }
}

export function shareIpo(ipo: Ipo) {
  track("share", { slug: ipo.slug, name: ipo.display_name ?? ipo.name });
  const lines = [
    `${ipo.display_name ?? ipo.name} IPO (${ipo.board === "sme" ? "SME" : "Mainboard"})`,
    ipo.price_band ? `Price band: ₹${ipo.price_band}` : null,
    ipo.lot_size ? `Lot size: ${ipo.lot_size} shares · Min ${inr(retailMinimum(ipo)?.amount ?? null)}${ipo.board === "sme" ? " (2 lots)" : ""}` : null,
    `Dates: ${dateRange(ipo.open_date, ipo.close_date)} · Listing ${ipo.listing_date ? dateLong(ipo.listing_date) : "TBA"}`,
    ipo.gmp !== null ? `GMP: ${inr(ipo.gmp)} (${pct(ipo.gmp_percent)})` : null,
    ipo.listing_price !== null ? `Listed at ${inr(ipo.listing_price)} (${pct(ipo.listing_gain_percent)})` : null,
    "",
    "Track it on Be IPO Ready",
    ipo.web_url ?? "",
  ].filter((l): l is string => l !== null);
  return Share.share({ message: lines.join("\n"), title: `${ipo.name} IPO` }).catch(() => undefined);
}

export async function addToCalendar(ipo: Ipo) {
  track("calendar_add", { slug: ipo.slug, name: ipo.display_name ?? ipo.name });
  const fallback = () =>
    Alert.alert(
      `${ipo.name} IPO dates`,
      [
        `Opens: ${dateLong(ipo.open_date)}`,
        `Closes: ${dateLong(ipo.close_date)}`,
        `Allotment: ${dateLong(ipo.allotment_date)}`,
        `Listing: ${dateLong(ipo.listing_date)}`,
      ].join("\n"),
    );
  if (!ipo.open_date && !ipo.close_date) {
    Alert.alert("Dates not announced yet", "We'll notify you once the IPO dates are out.");
    return;
  }
  try {
    const perm = await Calendar.requestCalendarPermissions(true);
    if (!perm.granted) {
      fallback();
      return;
    }
    const calendar = Calendar.getDefaultCalendarSync();
    const start = new Date(`${ipo.open_date ?? ipo.close_date}T10:00:00+05:30`);
    const end = new Date(`${ipo.close_date ?? ipo.open_date}T17:00:00+05:30`);
    await calendar.addEventWithForm({
      title: `${ipo.name} IPO (${ipo.board === "sme" ? "SME" : "Mainboard"})`,
      startDate: start,
      endDate: end,
      notes: [
        ipo.price_band ? `Price band ₹${ipo.price_band}` : null,
        ipo.lot_size ? `Lot ${ipo.lot_size} shares, min ${inr(retailMinimum(ipo)?.amount ?? null)}${ipo.board === "sme" ? " (2 lots)" : ""}` : null,
        `Allotment ${dateLong(ipo.allotment_date)}`,
        `Listing ${dateLong(ipo.listing_date)}`,
        "Added from Be IPO Ready",
      ]
        .filter(Boolean)
        .join("\n"),
    });
  } catch {
    fallback();
  }
}
