"use client";

// Staff-entered facts for one IPO (public.ipo_admin_data): state, sector, industry, listing platform.
// Kept apart from the feed data shown above it, so a sync can never overwrite what is entered here.
import { Check } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState } from "react";

import { Badge, Button, Card } from "@/components/ui";
import { INDIAN_STATES, LISTING_PLATFORMS, SECTORS, missingFields, platformLabel, type IpoAdminData, type ListingPlatform } from "@/lib/ipo-admin-data";
import { supabaseBrowser } from "@/lib/supabase/client";

export interface AdminDataSuggestions {
  state?: string | null;
  sector?: string | null;
  listing_platform?: ListingPlatform | null;
  /** Where the suggestion came from, e.g. "the insight" or "the data feed". */
  stateFrom?: string;
  sectorFrom?: string;
  platformFrom?: string;
}

export function IpoAdminDataForm({ ipoId, initial, suggestions }: { ipoId: string; initial: IpoAdminData | null; suggestions: AdminDataSuggestions }) {
  const router = useRouter();
  const [state, setState] = useState(initial?.state ?? "");
  const [sector, setSector] = useState(initial?.sector ?? "");
  const [industry, setIndustry] = useState(initial?.industry ?? "");
  const [platform, setPlatform] = useState<string>(initial?.listing_platform ?? "");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [savedAt, setSavedAt] = useState<number | null>(null);

  const dirty = state !== (initial?.state ?? "") || sector !== (initial?.sector ?? "") || industry.trim() !== (initial?.industry ?? "") || platform !== (initial?.listing_platform ?? "");
  const missing = missingFields({ state: state || null, sector: sector || null, listing_platform: (platform || null) as ListingPlatform | null });
  const industryInvalid = industry.trim().length === 1 || industry.trim().length > 120;

  const save = async () => {
    setSaving(true);
    setError(null);
    const { error: err } = await supabaseBrowser()
      .from("ipo_admin_data")
      .upsert({ ipo_id: ipoId, state: state || null, sector: sector || null, industry: industry.trim() || null, listing_platform: platform || null }, { onConflict: "ipo_id" });
    setSaving(false);
    if (err) {
      setError(/ipo_admin_data|schema cache/i.test(err.message) ? "This table is not in the database yet. Apply the migration 20261114000600_ipo_admin_data.sql." : err.message);
      return;
    }
    setSavedAt(Date.now());
    router.refresh();
  };

  const Suggest = ({ value, label, from, onUse }: { value: string | null | undefined; label: string; from?: string; onUse: () => void }) =>
    value ? (
      <button type="button" onClick={onUse} className="mt-1.5 text-[12px] text-navy hover:underline text-left">
        Use “{label}”{from ? ` (from ${from})` : ""}
      </button>
    ) : null;

  return (
    <Card className="mb-6">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h2 className="text-[17px]">IPO data entered by the team</h2>
          <p className="text-ink-3 text-[13px] mt-1">The data feed has no state or sector. What you enter here drives the state-wise view, sector view and alert filters in the app. Blank fields show as “Not specified”.</p>
        </div>
        {missing.length === 0 ? <Badge tone="green">Complete</Badge> : <Badge tone="amber">Missing: {missing.join(", ")}</Badge>}
      </div>

      <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mt-5">
        <label className="block">
          <span className="text-[12px] text-ink-3">State (registered office)</span>
          <select className="field h-10 mt-1" value={state} onChange={(e) => setState(e.target.value)}>
            <option value="">Not specified</option>
            {INDIAN_STATES.map((s) => (
              <option key={s} value={s}>
                {s}
              </option>
            ))}
          </select>
          {!state ? <Suggest value={suggestions.state} label={suggestions.state ?? ""} from={suggestions.stateFrom} onUse={() => setState(suggestions.state ?? "")} /> : null}
        </label>

        <label className="block">
          <span className="text-[12px] text-ink-3">Sector</span>
          <select className="field h-10 mt-1" value={sector} onChange={(e) => setSector(e.target.value)}>
            <option value="">Not specified</option>
            {SECTORS.map((s) => (
              <option key={s} value={s}>
                {s}
              </option>
            ))}
          </select>
          {!sector ? <Suggest value={suggestions.sector} label={suggestions.sector ?? ""} from={suggestions.sectorFrom} onUse={() => setSector(suggestions.sector ?? "")} /> : null}
        </label>

        <label className="block">
          <span className="text-[12px] text-ink-3">Industry (optional, more specific)</span>
          <input className="field h-10 mt-1" value={industry} maxLength={120} placeholder="e.g. Elevator manufacturing" onChange={(e) => setIndustry(e.target.value)} />
          {industryInvalid ? <span className="text-[12px] text-red mt-1.5 block">2 to 120 characters.</span> : null}
        </label>

        <label className="block">
          <span className="text-[12px] text-ink-3">Listing platform</span>
          <select className="field h-10 mt-1" value={platform} onChange={(e) => setPlatform(e.target.value)}>
            <option value="">Not specified</option>
            {LISTING_PLATFORMS.map((p) => (
              <option key={p.value} value={p.value}>
                {p.label}
              </option>
            ))}
          </select>
          {!platform ? <Suggest value={suggestions.listing_platform} label={platformLabel(suggestions.listing_platform)} from={suggestions.platformFrom} onUse={() => setPlatform(suggestions.listing_platform ?? "")} /> : null}
        </label>
      </div>

      {error ? <div className="rounded-[10px] border border-red/30 bg-red-soft text-red px-4 py-3 text-[13px] mt-4">{error}</div> : null}

      <div className="flex items-center gap-3 mt-5">
        <Button onClick={() => void save()} disabled={saving || !dirty || industryInvalid}>
          {saving ? "Saving…" : "Save IPO data"}
        </Button>
        {savedAt && !dirty ? (
          <span className="inline-flex items-center gap-1.5 text-[13px] text-green">
            <Check size={15} /> Saved
          </span>
        ) : null}
      </div>
    </Card>
  );
}
