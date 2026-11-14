// Number / date formatting for the Indian market.
import dayjs from "dayjs";
import customParseFormat from "dayjs/plugin/customParseFormat";
import relativeTime from "dayjs/plugin/relativeTime";
import utc from "dayjs/plugin/utc";

dayjs.extend(relativeTime);
dayjs.extend(customParseFormat);
dayjs.extend(utc);

const IST_OFFSET_MIN = 330;

/** Today's date in IST as YYYY-MM-DD. */
export function todayIST(): string {
  return dayjs().utcOffset(IST_OFFSET_MIN).format("YYYY-MM-DD");
}

/** Indian digit grouping: 12,34,567 */
export function groupIndian(intPart: string): string {
  const last3 = intPart.slice(-3);
  const rest = intPart.slice(0, -3);
  if (!rest) return last3;
  return rest.replace(/\B(?=(\d{2})+(?!\d))/g, ",") + "," + last3;
}

export function inr(n: number | null | undefined, opts: { decimals?: number; sign?: boolean } = {}): string {
  if (n === null || n === undefined || Number.isNaN(n)) return "—";
  const decimals = opts.decimals ?? (Number.isInteger(n) ? 0 : 2);
  const abs = Math.abs(n).toFixed(decimals);
  const [i, d] = abs.split(".");
  const body = groupIndian(i) + (d ? `.${d}` : "");
  const sign = n < 0 ? "-" : opts.sign && n > 0 ? "+" : "";
  return `${sign}₹${body}`;
}

/** ₹ crore with sensible compaction: 1200 → ₹1,200 Cr, 30187.65 → ₹30,188 Cr */
export function crore(n: number | null | undefined): string {
  if (n === null || n === undefined || Number.isNaN(n)) return "—";
  if (n >= 1000) return `${inr(Math.round(n))} Cr`;
  return `${inr(Number(n.toFixed(n >= 100 ? 0 : 2)))} Cr`;
}

/** Compact rupee amount: 14985 → ₹14,985 ; 1003995 → ₹10.04 L ; 2.5Cr */
export function inrCompact(n: number | null | undefined): string {
  if (n === null || n === undefined || Number.isNaN(n)) return "—";
  const abs = Math.abs(n);
  if (abs >= 1e7) return `₹${(n / 1e7).toFixed(2)} Cr`;
  if (abs >= 1e5) return `₹${(n / 1e5).toFixed(2)} L`;
  return inr(n);
}

export function pct(n: number | null | undefined, opts: { sign?: boolean; decimals?: number } = { sign: true }): string {
  if (n === null || n === undefined || Number.isNaN(n)) return "—";
  const d = opts.decimals ?? 2;
  const sign = n > 0 && opts.sign !== false ? "+" : "";
  return `${sign}${n.toFixed(d)}%`;
}

export function times(n: number | null | undefined): string {
  if (n === null || n === undefined || Number.isNaN(n)) return "—";
  if (n >= 100) return `${Math.round(n)}x`;
  if (n >= 10) return `${n.toFixed(1)}x`;
  return `${n.toFixed(2)}x`;
}

export function compactNumber(n: number | null | undefined): string {
  if (n === null || n === undefined || Number.isNaN(n)) return "—";
  const abs = Math.abs(n);
  if (abs >= 1e7) return `${(n / 1e7).toFixed(2)} Cr`;
  if (abs >= 1e5) return `${(n / 1e5).toFixed(2)} L`;
  if (abs >= 1e3) return groupIndian(String(Math.round(n)));
  return String(n);
}

export function dateShort(d: string | null | undefined): string {
  if (!d) return "TBA";
  return dayjs(d, "YYYY-MM-DD").format("D MMM");
}

export function dateLong(d: string | null | undefined): string {
  if (!d) return "To be announced";
  return dayjs(d, "YYYY-MM-DD").format("ddd, D MMM YYYY");
}

export function dateRange(a: string | null | undefined, b: string | null | undefined): string {
  if (!a && !b) return "Dates TBA";
  if (!a) return `Till ${dateShort(b)}`;
  if (!b) return `From ${dateShort(a)}`;
  const da = dayjs(a, "YYYY-MM-DD");
  const db = dayjs(b, "YYYY-MM-DD");
  if (da.month() === db.month()) return `${da.format("D")}–${db.format("D MMM")}`;
  return `${da.format("D MMM")} – ${db.format("D MMM")}`;
}

/** Days from today (IST) to the date. 0 = today, negative = past. */
export function daysUntil(d: string | null | undefined): number | null {
  if (!d) return null;
  return dayjs(d, "YYYY-MM-DD").diff(dayjs(todayIST(), "YYYY-MM-DD"), "day");
}

export function relativeDay(d: string | null | undefined): string {
  const n = daysUntil(d);
  if (n === null) return "TBA";
  if (n === 0) return "Today";
  if (n === 1) return "Tomorrow";
  if (n === -1) return "Yesterday";
  if (n > 1) return `In ${n} days`;
  return `${-n} days ago`;
}

export function timeAgo(iso: string | null | undefined): string {
  if (!iso) return "";
  return dayjs(iso).fromNow();
}

export function dateTimeIST(iso: string | null | undefined): string {
  if (!iso) return "";
  return dayjs(iso).utcOffset(IST_OFFSET_MIN).format("D MMM, h:mm A") + " IST";
}

export function initials(name: string): string {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((w) => w[0]?.toUpperCase() ?? "")
    .join("");
}

export function clamp(n: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, n));
}
