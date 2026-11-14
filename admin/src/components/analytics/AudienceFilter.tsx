"use client";

import { usePathname, useRouter, useSearchParams } from "next/navigation";

import { AUDIENCE_FILTERS } from "@/lib/analytics-format";

/** Audience pills stored in ?audience= (shared by every analytics tab). */
export function AudienceFilter({ value }: { value: string }) {
  const router = useRouter();
  const path = usePathname();
  const sp = useSearchParams();
  const set = (v: string) => {
    const next = new URLSearchParams(sp.toString());
    v ? next.set("audience", v) : next.delete("audience");
    router.replace(`${path}${next.size ? `?${next.toString()}` : ""}` as never);
  };
  return (
    <div className="inline-flex rounded-[10px] border border-line-strong bg-white p-0.5" role="group" aria-label="Audience">
      {AUDIENCE_FILTERS.map((a) => (
        <button key={a.value} type="button" onClick={() => set(a.value)} className={`h-8 px-3 rounded-[8px] text-[13px] transition ${value === a.value ? "bg-gold text-white" : "text-ink-2 hover:bg-gold-soft"}`}>
          {a.label}
        </button>
      ))}
    </div>
  );
}
