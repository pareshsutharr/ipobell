const IST = "Asia/Kolkata";

export function dateShort(v: string | null | undefined): string {
  if (!v) return "—";
  const d = new Date(v.length === 10 ? `${v}T00:00:00+05:30` : v);
  if (Number.isNaN(d.getTime())) return "—";
  return d.toLocaleDateString("en-IN", { day: "numeric", month: "short", timeZone: IST });
}

export function dateTime(v: string | null | undefined): string {
  if (!v) return "—";
  const d = new Date(v);
  if (Number.isNaN(d.getTime())) return "—";
  return d.toLocaleString("en-IN", { day: "numeric", month: "short", hour: "numeric", minute: "2-digit", timeZone: IST });
}

export function dateRange(a: string | null, b: string | null): string {
  if (!a && !b) return "Dates TBA";
  return `${dateShort(a)} – ${dateShort(b)}`;
}

export function crore(n: number | null | undefined): string {
  if (n === null || n === undefined) return "—";
  return `₹${n.toLocaleString("en-IN", { maximumFractionDigits: n >= 100 ? 0 : 2 })} Cr`;
}

export function inr(n: number | null | undefined): string {
  if (n === null || n === undefined) return "—";
  return `₹${n.toLocaleString("en-IN", { maximumFractionDigits: 0 })}`;
}

export function pct(n: number | null | undefined, decimals = 1): string {
  if (n === null || n === undefined) return "—";
  return `${n > 0 ? "+" : ""}${n.toFixed(decimals)}%`;
}

export function titleCase(s: string): string {
  return s.replace(/[-_]/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
}

export function daysAgo(n: number): string {
  const d = new Date();
  d.setDate(d.getDate() - n);
  return d.toISOString();
}
