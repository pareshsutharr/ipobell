"use client";

// Editor for public.business_rules: the numbers behind the app's issue size, issue cost and eligibility tools.
// Each section saves on its own, after the same checks the app applies when it reads the value.
import { Check, Plus, Trash2 } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState, type ReactNode } from "react";

import { Badge, Button, Card } from "@/components/ui";
import { checkRule, costTotals, ELIGIBILITY_FIELDS, fmt, type CostItem, type CostStage, type Eligibility, type GrowthTier, type IssueCost, type IssueSize, type RuleKey, type SectorPe } from "@/lib/business-rules";
import { dateTime } from "@/lib/format";
import { supabaseBrowser } from "@/lib/supabase/client";

export interface RulesInitial {
  sector_pe: SectorPe[];
  growth_premium: GrowthTier[];
  issue_size: IssueSize;
  issue_cost: IssueCost;
  eligibility: Eligibility;
  updatedAt: Partial<Record<RuleKey, string>>;
}

const toNum = (s: string): number => (s.trim() === "" ? Number.NaN : Number(s));

function NumberInput({ value, onChange, disabled, width = "w-[110px]", step = "any" }: { value: number; onChange: (n: number) => void; disabled: boolean; width?: string; step?: string }) {
  return <input type="number" inputMode="decimal" step={step} className={`field h-9 ${width} num`} disabled={disabled} value={Number.isFinite(value) ? value : ""} onChange={(e) => onChange(toNum(e.target.value))} />;
}

function Section({ ruleKey, title, help, value, canWrite, updatedAt, children }: { ruleKey: RuleKey; title: string; help: string; value: unknown; canWrite: boolean; updatedAt?: string; children: ReactNode }) {
  const router = useRouter();
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
  const problem = checkRule(ruleKey, value);

  const save = async () => {
    setError(null);
    setSaved(false);
    if (problem) return setError(problem);
    setSaving(true);
    const { error: err } = await supabaseBrowser().from("business_rules").upsert({ key: ruleKey, value }, { onConflict: "key" });
    setSaving(false);
    if (err) return setError(/business_rules|schema cache/i.test(err.message) ? "This table is not in the database yet. Apply the migration 20261114001000_business_rules.sql." : err.message);
    setSaved(true);
    router.refresh();
  };

  return (
    <Card>
      <div className="flex items-start justify-between gap-4">
        <div>
          <h2 className="text-[17px]">{title}</h2>
          <p className="text-ink-3 text-[13px] mt-1 max-w-[720px]">{help}</p>
        </div>
        {updatedAt ? <span className="text-[12px] text-ink-3 whitespace-nowrap">Last changed {dateTime(updatedAt)}</span> : null}
      </div>
      <div className="mt-4">{children}</div>
      {problem ? <p className="text-[13px] text-amber mt-4">{problem}</p> : null}
      {error && error !== problem ? <div className="rounded-[10px] border border-red/30 bg-red-soft text-red px-4 py-3 text-[13px] mt-4">{error}</div> : null}
      {canWrite ? (
        <div className="flex items-center gap-3 mt-4">
          <Button onClick={() => void save()} disabled={saving || Boolean(problem)}>
            {saving ? "Saving…" : "Save"}
          </Button>
          {saved ? (
            <span className="inline-flex items-center gap-1.5 text-[13px] text-green">
              <Check size={15} /> Saved. The app picks it up within 30 minutes, or when it is reopened.
            </span>
          ) : null}
        </div>
      ) : null}
    </Card>
  );
}

export function RulesEditor({ initial, canWrite }: { initial: RulesInitial; canWrite: boolean }) {
  const [sectorPe, setSectorPe] = useState(initial.sector_pe);
  const [tiers, setTiers] = useState(initial.growth_premium);
  const [size, setSize] = useState(initial.issue_size);
  const [cost, setCost] = useState(initial.issue_cost);
  const [elig, setElig] = useState(initial.eligibility);
  const ro = !canWrite;
  const totals = costTotals(cost);

  const setItem = (i: number, patch: Partial<CostItem>) => setCost((c) => ({ ...c, items: c.items.map((it, n) => (n === i ? { ...it, ...patch } : it)) }));
  const setStage = (i: number, patch: Partial<CostStage>) => setCost((c) => ({ ...c, stages: c.stages.map((st, n) => (n === i ? { ...st, ...patch } : st)) }));

  return (
    <div className="space-y-5">
      {ro ? <div className="rounded-[10px] border border-line bg-[#f6f4ee] px-4 py-3 text-[13px] text-ink-2">Only a super admin can change these numbers. You can read them.</div> : null}

      <Section ruleKey="sector_pe" title="Sector P/E multiples" help="Issue size calculator: market cap ≈ profit after tax × this multiple. The sector names are fixed because the IPO sector list and the alert filters use the same names." value={sectorPe} canWrite={canWrite} updatedAt={initial.updatedAt.sector_pe}>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-x-8 gap-y-2">
          {sectorPe.map((s, i) => (
            <label key={s.sector} className="flex items-center justify-between gap-4">
              <span className="text-[13.5px]">{s.sector}</span>
              <span className="flex items-center gap-2">
                <NumberInput value={s.pe} disabled={ro} width="w-[90px]" onChange={(n) => setSectorPe((list) => list.map((x, k) => (k === i ? { ...x, pe: n } : x)))} />
                <span className="text-ink-3 text-[12px]">×</span>
              </span>
            </label>
          ))}
        </div>
      </Section>

      <Section ruleKey="growth_premium" title="Growth premium" help="A company whose 3-year revenue growth is at or above a tier gets that premium added to its sector multiple. Faster growth must never earn a smaller premium." value={tiers} canWrite={canWrite} updatedAt={initial.updatedAt.growth_premium}>
        <div className="space-y-2">
          {tiers.map((t, i) => (
            <div key={i} className="flex items-center gap-3 text-[13.5px]">
              <span>Growth of</span>
              <NumberInput value={t.minCagrPct} disabled={ro} width="w-[90px]" onChange={(n) => setTiers((l) => l.map((x, k) => (k === i ? { ...x, minCagrPct: n } : x)))} />
              <span>% or more adds</span>
              <NumberInput value={t.premiumPct} disabled={ro} width="w-[90px]" onChange={(n) => setTiers((l) => l.map((x, k) => (k === i ? { ...x, premiumPct: n } : x)))} />
              <span>% to the multiple</span>
              {canWrite ? (
                <button type="button" aria-label="Remove tier" className="text-ink-3 hover:text-red" onClick={() => setTiers((l) => l.filter((_, k) => k !== i))}>
                  <Trash2 size={15} />
                </button>
              ) : null}
            </div>
          ))}
          {canWrite && tiers.length < 10 ? (
            <Button variant="secondary" size="sm" onClick={() => setTiers((l) => [...l, { minCagrPct: Number.NaN, premiumPct: Number.NaN }])}>
              <Plus size={14} /> Add tier
            </Button>
          ) : null}
        </div>
      </Section>

      <Section ruleKey="issue_size" title="Float and valuation band" help="The issue size shown is the estimated market cap, less or plus the band, times the public float range." value={size} canWrite={canWrite} updatedAt={initial.updatedAt.issue_size}>
        <div className="flex flex-wrap items-center gap-x-6 gap-y-3 text-[13.5px]">
          <label className="flex items-center gap-2">
            Public float from <NumberInput value={size.dilutionLowPct} disabled={ro} width="w-[80px]" onChange={(n) => setSize((s) => ({ ...s, dilutionLowPct: n }))} /> % to
            <NumberInput value={size.dilutionHighPct} disabled={ro} width="w-[80px]" onChange={(n) => setSize((s) => ({ ...s, dilutionHighPct: n }))} /> %
          </label>
          <label className="flex items-center gap-2">
            Valuation band ± <NumberInput value={size.bandPct} disabled={ro} width="w-[80px]" onChange={(n) => setSize((s) => ({ ...s, bandPct: n }))} /> %
          </label>
        </div>
      </Section>

      <Section ruleKey="issue_cost" title="Issue cost" help="Line items priced for one reference deal; the app scales them to the issue size the user enters. The payment stages split the same total over time, so both lists must add up to the same amount." value={cost} canWrite={canWrite} updatedAt={initial.updatedAt.issue_cost}>
        <label className="flex items-center gap-2 text-[13.5px]">
          Reference issue: ₹ <NumberInput value={cost.referenceIssueLakhs} disabled={ro} onChange={(n) => setCost((c) => ({ ...c, referenceIssueLakhs: n }))} /> lakh
          <span className="text-ink-3">({Number.isFinite(cost.referenceIssueLakhs) ? `₹${fmt(cost.referenceIssueLakhs / 100)} Cr` : "—"})</span>
        </label>

        <p className="text-[12px] uppercase tracking-[0.06em] text-ink-3 mt-5 mb-2">Cost items (₹ lakh)</p>
        <div className="space-y-2">
          {cost.items.map((it, i) => (
            <div key={i} className="flex items-center gap-2">
              <input className="field h-9 flex-1 min-w-[220px]" disabled={ro} value={it.label} maxLength={120} placeholder="Item name" onChange={(e) => setItem(i, { label: e.target.value })} />
              <NumberInput value={it.lakhs} disabled={ro} onChange={(n) => setItem(i, { lakhs: n })} />
              <input className="field h-9 w-[280px]" disabled={ro} value={it.hint ?? ""} maxLength={200} placeholder="Note shown under the item (optional)" onChange={(e) => setItem(i, { hint: e.target.value || undefined })} />
              {canWrite ? (
                <button type="button" aria-label="Remove item" className="text-ink-3 hover:text-red" onClick={() => setCost((c) => ({ ...c, items: c.items.filter((_, k) => k !== i) }))}>
                  <Trash2 size={15} />
                </button>
              ) : null}
            </div>
          ))}
          {canWrite && cost.items.length < 20 ? (
            <Button variant="secondary" size="sm" onClick={() => setCost((c) => ({ ...c, items: [...c.items, { label: "", lakhs: Number.NaN }] }))}>
              <Plus size={14} /> Add item
            </Button>
          ) : null}
        </div>

        <p className="text-[12px] uppercase tracking-[0.06em] text-ink-3 mt-5 mb-2">Payment stages (₹ lakh)</p>
        <div className="space-y-2">
          {cost.stages.map((st, i) => (
            <div key={i} className="flex items-center gap-2">
              <input className="field h-9 flex-1 min-w-[220px]" disabled={ro} value={st.label} maxLength={120} placeholder="Stage name" onChange={(e) => setStage(i, { label: e.target.value })} />
              <NumberInput value={st.lakhs} disabled={ro} onChange={(n) => setStage(i, { lakhs: n })} />
              {canWrite ? (
                <button type="button" aria-label="Remove stage" className="text-ink-3 hover:text-red" onClick={() => setCost((c) => ({ ...c, stages: c.stages.filter((_, k) => k !== i) }))}>
                  <Trash2 size={15} />
                </button>
              ) : null}
            </div>
          ))}
          {canWrite && cost.stages.length < 12 ? (
            <Button variant="secondary" size="sm" onClick={() => setCost((c) => ({ ...c, stages: [...c.stages, { label: "", lakhs: Number.NaN }] }))}>
              <Plus size={14} /> Add stage
            </Button>
          ) : null}
        </div>

        <div className="flex flex-wrap items-center gap-2 mt-4">
          <Badge tone="navy">Items ₹{fmt(totals.items)} lakh</Badge>
          <Badge tone="navy">Stages ₹{fmt(totals.stages)} lakh</Badge>
          <Badge tone={totals.match ? "green" : "red"}>{totals.match ? "Totals match" : "Totals do not match"}</Badge>
          <Badge tone="neutral">{fmt(totals.pctOfIssue)}% of the issue</Badge>
        </div>
      </Section>

      <Section ruleKey="eligibility" title="Eligibility limits" help="The numbers in the eligibility check for NSE Emerge, BSE SME and the Main Board. Update them when SEBI or an exchange changes a criterion; the wording in the app follows the number." value={elig} canWrite={canWrite} updatedAt={initial.updatedAt.eligibility}>
        <div className="space-y-2">
          {ELIGIBILITY_FIELDS.map((f) => (
            <label key={f.key} className="flex items-center justify-between gap-4 max-w-[720px]">
              <span className="text-[13.5px]">{f.label}</span>
              <span className="flex items-center gap-2">
                <NumberInput value={elig[f.key]} disabled={ro} width="w-[100px]" step={f.key === "opProfitMinYears" ? "1" : "any"} onChange={(n) => setElig((e) => ({ ...e, [f.key]: n }))} />
                <span className="text-ink-3 text-[12px] w-[42px]">{f.unit}</span>
              </span>
            </label>
          ))}
        </div>
      </Section>
    </div>
  );
}
