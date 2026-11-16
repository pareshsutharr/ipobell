"use client";

// The two features held for legal review. Both start off. Turning one on asks for a typed confirmation,
// because it changes what every user of the app sees.
import { useRouter } from "next/navigation";
import { useState } from "react";

import { Badge, Button, Card } from "@/components/ui";
import { HELD_FEATURES, type SwitchKey } from "@/lib/held-features";
import { supabaseBrowser } from "@/lib/supabase/client";

export function HeldFeatures({ initial, canWrite, setupError }: { initial: Record<SwitchKey, boolean>; canWrite: boolean; setupError: string | null }) {
  const router = useRouter();
  const [state, setState] = useState(initial);
  const [busy, setBusy] = useState<SwitchKey | null>(null);
  const [error, setError] = useState<string | null>(null);

  const set = async (key: SwitchKey, enabled: boolean) => {
    if (enabled) {
      const typed = window.prompt("This shows the feature to every user of the app.\n\nType LEGAL OK to confirm that your legal adviser has approved it.");
      if (typed === null) return;
      if (typed.trim().toUpperCase() !== "LEGAL OK") {
        setError("Not turned on: the confirmation text did not match.");
        return;
      }
    }
    setBusy(key);
    setError(null);
    const { data, error: err } = await supabaseBrowser().from("feature_switches").update({ enabled }).eq("key", key).select("key");
    setBusy(null);
    if (err) return setError(err.message);
    if (!data?.length) return setError("Not changed. Only a super admin can change this.");
    setState((s) => ({ ...s, [key]: enabled }));
    router.refresh();
  };

  return (
    <Card className="mt-6">
      <h2 className="text-[17px]">Features held for legal review</h2>
      <p className="text-ink-3 text-[13px] mt-1">These are built but switched off. Nothing of them appears in the app until a super admin turns them on here. Every change is recorded in the change log.</p>
      {setupError ? <div className="rounded-[10px] border border-amber/30 bg-amber-soft px-4 py-3 text-[13px] mt-4">{setupError}</div> : null}
      <ul className="divide-y divide-line mt-4">
        {HELD_FEATURES.map((f) => (
          <li key={f.key} className="py-4 flex items-start justify-between gap-6">
            <div className="min-w-0">
              <p className="font-medium flex items-center gap-2">
                {f.title} <Badge tone={state[f.key] ? "green" : "navy"}>{state[f.key] ? "On" : "Off"}</Badge>
              </p>
              <p className="text-[13px] text-ink-2 mt-1">{f.what}</p>
              <p className="text-[12.5px] text-ink-3 mt-1">{f.before}</p>
            </div>
            {canWrite && !setupError ? (
              <Button variant="secondary" size="sm" disabled={busy !== null} onClick={() => void set(f.key, !state[f.key])}>
                {busy === f.key ? "Saving…" : state[f.key] ? "Turn off" : "Turn on"}
              </Button>
            ) : null}
          </li>
        ))}
      </ul>
      {!canWrite ? <p className="text-[12.5px] text-ink-3">Only a super admin can change these.</p> : null}
      {error ? <div className="rounded-[10px] border border-red/30 bg-red-soft text-red px-4 py-3 text-[13px] mt-2">{error}</div> : null}
    </Card>
  );
}
