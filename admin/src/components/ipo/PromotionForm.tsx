"use client";

// "Promoted" flag for one IPO (public.ipo_admin_data.is_promoted / promoted_until). Super admins only; the
// database refuses anyone else. Nothing is shown in the app while the Promoted IPOs feature is off.
import { useRouter } from "next/navigation";
import { useState } from "react";

import { Badge, Button, Card } from "@/components/ui";
import { checkPromotion, promotionError, promotionStatus, todayIST, type Promotion } from "@/lib/held-features";
import { supabaseBrowser } from "@/lib/supabase/client";

export function PromotionForm({ ipoId, ipoStatus, initial, switchOn, setupError }: { ipoId: string; ipoStatus: string; initial: Promotion; switchOn: boolean; setupError: string | null }) {
  const router = useRouter();
  const [promoted, setPromoted] = useState(initial.is_promoted);
  const [until, setUntil] = useState(initial.promoted_until ?? "");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const today = todayIST();
  const value: Promotion = { is_promoted: promoted, promoted_until: until || null };
  const problem = checkPromotion(value, today);
  const dirty = promoted !== initial.is_promoted || (until || null) !== initial.promoted_until;

  const save = async () => {
    setSaving(true);
    setError(null);
    const { error: err } = await supabaseBrowser().from("ipo_admin_data").upsert({ ipo_id: ipoId, ...value }, { onConflict: "ipo_id" });
    setSaving(false);
    if (err) return setError(promotionError(err.message));
    router.refresh();
  };

  return (
    <Card className="mb-6">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h2 className="text-[17px]">Promoted placement</h2>
          <p className="text-ink-3 text-[13px] mt-1">A paid placement. The app shows it in a separate block labelled “Promoted”; it never changes the order of the normal lists, any figure or the data score. Held for legal review.</p>
        </div>
        <Badge tone={initial.is_promoted ? "gold" : "navy"}>{initial.is_promoted ? "Marked as promoted" : "Not promoted"}</Badge>
      </div>
      {setupError ? (
        <div className="rounded-[10px] border border-amber/30 bg-amber-soft px-4 py-3 text-[13px] mt-4">{setupError}</div>
      ) : (
        <>
          <div className="flex flex-wrap items-end gap-6 mt-5">
            <label className="flex items-center gap-2 text-[13.5px] h-10">
              <input type="checkbox" checked={promoted} onChange={(e) => { setPromoted(e.target.checked); if (!e.target.checked) setUntil(""); }} /> Promoted
            </label>
            <label className="block">
              <span className="text-[12px] text-ink-3">Show until (optional)</span>
              <input type="date" className="field h-10 mt-1" value={until} min={today} disabled={!promoted} onChange={(e) => setUntil(e.target.value)} />
            </label>
          </div>
          <p className="text-[13px] text-ink-2 mt-4">{promotionStatus(initial, ipoStatus, switchOn, today)}</p>
          {problem ? <p className="text-[12.5px] text-red mt-2">{problem}</p> : null}
          {error ? <div className="rounded-[10px] border border-red/30 bg-red-soft text-red px-4 py-3 text-[13px] mt-4">{error}</div> : null}
          <div className="mt-5">
            <Button onClick={() => void save()} disabled={saving || !dirty || Boolean(problem)}>
              {saving ? "Saving…" : "Save promotion"}
            </Button>
          </div>
        </>
      )}
    </Card>
  );
}
