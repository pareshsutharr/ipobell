"use client";

import { Search } from "lucide-react";
import { usePathname, useRouter } from "next/navigation";
import { useState } from "react";

export function IpoFilters({ q, status, board, insight, data }: { q: string; status: string; board: string; insight: string; data: string }) {
  const router = useRouter();
  const path = usePathname();
  const [text, setText] = useState(q);

  const apply = (patch: Partial<{ q: string; status: string; board: string; insight: string; data: string }>) => {
    const next = { q: text, status, board, insight, data, ...patch };
    const params = new URLSearchParams();
    Object.entries(next).forEach(([k, v]) => {
      if (v) params.set(k, v);
    });
    router.replace(`${path}${params.size ? `?${params}` : ""}` as never);
  };

  const Select = ({ value, onChange, options, all }: { value: string; onChange: (v: string) => void; options: [string, string][]; all: string }) => (
    <select className="field h-10 !w-auto pr-8" value={value} onChange={(e) => onChange(e.target.value)}>
      <option value="">{all}</option>
      {options.map(([v, l]) => (
        <option key={v} value={v}>
          {l}
        </option>
      ))}
    </select>
  );

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        apply({ q: text });
      }}
      className="flex flex-wrap items-center gap-2"
    >
      <div className="relative">
        <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-ink-3" />
        <input className="field h-10 !w-[280px] !pl-9" placeholder="Search company name" value={text} onChange={(e) => setText(e.target.value)} />
      </div>
      <Select value={status} onChange={(v) => apply({ status: v })} all="All statuses" options={[["open", "Open"], ["upcoming", "Upcoming"], ["closed", "Closed"], ["listed", "Listed"]]} />
      <Select value={board} onChange={(v) => apply({ board: v })} all="All boards" options={[["sme", "SME"], ["mainboard", "Mainboard"]]} />
      <Select value={insight} onChange={(v) => apply({ insight: v })} all="Any insight state" options={[["none", "No insight"], ["draft", "Draft"], ["published", "Published"]]} />
      <Select value={data} onChange={(v) => apply({ data: v })} all="Any data state" options={[["incomplete", "Incomplete data"], ["complete", "Complete data"]]} />
    </form>
  );
}
