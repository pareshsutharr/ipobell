"use client";

import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useState } from "react";

import { Button } from "@/components/ui";
import type { DateRange, RangePreset } from "@/lib/analytics-format";
import { rangeParams } from "@/lib/analytics-format";

const PRESETS: { value: RangePreset; label: string }[] = [
  { value: "today", label: "Today" },
  { value: "7d", label: "7 days" },
  { value: "30d", label: "30 days" },
  { value: "90d", label: "90 days" },
];

/** Date-range control kept in the URL (?range=…&from=&to=). Other query params on the page are preserved. */
export function RangePicker({ range }: { range: DateRange }) {
  const router = useRouter();
  const path = usePathname();
  const sp = useSearchParams();
  const [from, setFrom] = useState(range.fromDay);
  const [to, setTo] = useState(range.toDay);
  const [custom, setCustom] = useState(range.preset === "custom");

  const go = (r: Pick<DateRange, "preset" | "fromDay" | "toDay">) => {
    const next = new URLSearchParams(sp.toString());
    ["range", "from", "to"].forEach((k) => next.delete(k));
    new URLSearchParams(rangeParams(r)).forEach((v, k) => next.set(k, v));
    router.replace(`${path}?${next.toString()}` as never);
  };

  return (
    <div className="flex flex-wrap items-center gap-2">
      <div className="inline-flex rounded-[10px] border border-line-strong bg-white p-0.5">
        {PRESETS.map((p) => {
          const active = !custom && range.preset === p.value;
          return (
            <button
              key={p.value}
              type="button"
              onClick={() => {
                setCustom(false);
                go({ preset: p.value, fromDay: range.fromDay, toDay: range.toDay });
              }}
              className={`h-8 px-3 rounded-[8px] text-[13px] transition ${active ? "bg-navy text-white" : "text-ink-2 hover:bg-navy-soft"}`}
            >
              {p.label}
            </button>
          );
        })}
        <button type="button" onClick={() => setCustom(true)} className={`h-8 px-3 rounded-[8px] text-[13px] transition ${custom ? "bg-navy text-white" : "text-ink-2 hover:bg-navy-soft"}`}>
          Custom
        </button>
      </div>
      {custom ? (
        <form
          className="flex items-center gap-2"
          onSubmit={(e) => {
            e.preventDefault();
            if (from && to) go({ preset: "custom", fromDay: from, toDay: to });
          }}
        >
          <input type="date" className="field h-9 !w-auto" value={from} max={to} onChange={(e) => setFrom(e.target.value)} />
          <span className="text-ink-3 text-[13px]">to</span>
          <input type="date" className="field h-9 !w-auto" value={to} min={from} onChange={(e) => setTo(e.target.value)} />
          <Button type="submit" size="sm" variant="secondary">
            Apply
          </Button>
        </form>
      ) : null}
      <span className="text-[12.5px] text-ink-3 ml-1">{range.label} · IST</span>
    </div>
  );
}
