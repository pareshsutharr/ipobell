"use client";

import Link from "next/link";
import { usePathname, useSearchParams } from "next/navigation";

const TABS = [
  { href: "/analytics", label: "Overview", exact: true },
  { href: "/analytics/audience", label: "Audience" },
  { href: "/analytics/journeys", label: "Tool journeys" },
  { href: "/analytics/events", label: "Events" },
];

/** Sub-navigation for the analytics section. Carries the current date range across tabs. */
export function AnalyticsTabs() {
  const path = usePathname();
  const sp = useSearchParams();
  const keep = new URLSearchParams();
  ["range", "from", "to", "audience"].forEach((k) => {
    const v = sp.get(k);
    if (v) keep.set(k, v);
  });
  const qs = keep.size ? `?${keep.toString()}` : "";
  return (
    <nav className="flex gap-1 border-b border-line mb-5">
      {TABS.map((t) => {
        const active = t.exact ? path === t.href : path.startsWith(t.href);
        return (
          <Link key={t.href} href={`${t.href}${qs}` as never} className={`relative px-3 h-10 inline-flex items-center text-[13.5px] transition ${active ? "text-navy font-medium" : "text-ink-3 hover:text-ink"}`}>
            {t.label}
            {active ? <span className="absolute left-2 right-2 -bottom-px h-[2px] bg-gold rounded-t" /> : null}
          </Link>
        );
      })}
    </nav>
  );
}
