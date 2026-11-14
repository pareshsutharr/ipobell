// Investor interest signal (pure, unit-tested). Totals come from the `ipo_interest` database function, which
// already hides anything below 3 so a number never points at one or two people.
export interface IpoInterest {
  watchers: number | null;
  viewers: number | null;
}

export function parseInterest(raw: unknown): IpoInterest {
  const o = (raw ?? {}) as { watchers?: unknown; viewers_30d?: unknown };
  const n = (v: unknown) => (typeof v === "number" && Number.isFinite(v) && v >= 3 ? Math.floor(v) : null);
  return { watchers: n(o.watchers), viewers: n(o.viewers_30d) };
}

function people(n: number): string {
  return n >= 1000 ? `${(Math.floor(n / 100) / 10).toString().replace(/\.0$/, "")}k people` : `${n} people`;
}

/** "42 people watching · 310 people viewed this month", or null when there is nothing to show. */
export function interestLine(i: IpoInterest | null | undefined): string | null {
  if (!i) return null;
  const parts: string[] = [];
  if (i.watchers) parts.push(`${people(i.watchers)} watching`);
  if (i.viewers) parts.push(`${people(i.viewers)} viewed this month`);
  return parts.length ? parts.join(" · ") : null;
}
