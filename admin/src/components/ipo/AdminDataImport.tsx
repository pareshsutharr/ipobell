"use client";

// Bulk entry of state / sector / industry / platform: download a sheet of every IPO, fill it in Excel, upload it.
// The file is checked in the browser first; nothing is saved until "Import" is pressed.
import { Download, Upload } from "lucide-react";
import { useRouter } from "next/navigation";
import { useMemo, useState } from "react";

import { Badge, Button, Card } from "@/components/ui";
import { exportCsv, isComplete, planImport, platformLabel, SECTORS, type IpoAdminData, type IpoRef } from "@/lib/ipo-admin-data";
import { supabaseBrowser } from "@/lib/supabase/client";

const MAX_FILE_BYTES = 2 * 1024 * 1024;
const BATCH = 200;

export function AdminDataImport({ ipos, existing }: { ipos: IpoRef[]; existing: IpoAdminData[] }) {
  const router = useRouter();
  const [text, setText] = useState<string | null>(null);
  const [fileName, setFileName] = useState("");
  const [fileError, setFileError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<{ saved: number; error: string | null } | null>(null);

  const plan = useMemo(() => (text === null ? null : planImport(text, ipos, existing)), [text, ipos, existing]);
  const nameOf = useMemo(() => new Map(ipos.map((i) => [i.id, i.display_name ?? i.name])), [ipos]);
  const complete = useMemo(() => existing.filter((e) => isComplete(e)).length, [existing]);

  const download = () => {
    const blob = new Blob(["﻿" + exportCsv(ipos, existing)], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `ipo-data-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const onFile = async (file: File | undefined) => {
    setResult(null);
    setFileError(null);
    setText(null);
    if (!file) return;
    setFileName(file.name);
    if (file.size > MAX_FILE_BYTES) return setFileError("That file is larger than 2 MB. Is it the right sheet?");
    if (!/\.csv$/i.test(file.name) && file.type !== "text/csv") return setFileError("Please upload a .csv file. In Excel use File → Save As → CSV UTF-8.");
    setText(await file.text());
  };

  const run = async () => {
    if (!plan?.rows.length) return;
    setBusy(true);
    let saved = 0;
    let error: string | null = null;
    for (let i = 0; i < plan.rows.length; i += BATCH) {
      const batch = plan.rows.slice(i, i + BATCH);
      const { error: err } = await supabaseBrowser().from("ipo_admin_data").upsert(batch, { onConflict: "ipo_id" });
      if (err) {
        error = /ipo_admin_data|schema cache/i.test(err.message) ? "This table is not in the database yet. Apply the migration 20261114000600_ipo_admin_data.sql." : err.message;
        break;
      }
      saved += batch.length;
    }
    setBusy(false);
    setResult({ saved, error });
    if (saved) {
      setText(null);
      router.refresh();
    }
  };

  return (
    <div className="space-y-5">
      <Card>
        <h2 className="text-[17px]">1. Download the sheet</h2>
        <p className="text-ink-3 text-[13px] mt-1">
          One line per IPO ({ipos.length} in total, {complete} already complete), with whatever has been entered so far. Fill in the blank cells in Excel or Google Sheets. Do not change the <code>slug</code> column: it is how each line finds its IPO.
        </p>
        <div className="mt-4">
          <Button variant="secondary" onClick={download}>
            <Download size={15} /> Download CSV
          </Button>
        </div>
        <div className="text-[12.5px] text-ink-3 mt-4 space-y-1">
          <p>
            <span className="text-ink-2 font-medium">state</span>: the full state or union territory name, e.g. Gujarat, Tamil Nadu, Delhi.
          </p>
          <p>
            <span className="text-ink-2 font-medium">sector</span>: exactly one of {SECTORS.join("; ")}.
          </p>
          <p>
            <span className="text-ink-2 font-medium">industry</span>: optional free text, e.g. Elevator manufacturing.
          </p>
          <p>
            <span className="text-ink-2 font-medium">listing_platform</span>: NSE Emerge, BSE SME or Mainboard.
          </p>
          <p>A blank cell leaves the current value as it is. It never clears a value.</p>
        </div>
      </Card>

      <Card>
        <h2 className="text-[17px]">2. Upload the filled sheet</h2>
        <label className="mt-4 inline-flex items-center gap-2 h-10 px-4 rounded-[10px] border border-line-strong bg-white text-sm font-medium cursor-pointer hover:border-ink-3">
          <Upload size={15} /> Choose CSV file
          <input type="file" accept=".csv,text/csv" className="hidden" onChange={(e) => void onFile(e.target.files?.[0])} />
        </label>
        {fileName ? <span className="ml-3 text-[13px] text-ink-3">{fileName}</span> : null}
        {fileError ? <div className="rounded-[10px] border border-red/30 bg-red-soft text-red px-4 py-3 text-[13px] mt-4">{fileError}</div> : null}

        {plan ? (
          <div className="mt-5">
            <div className="flex flex-wrap items-center gap-2">
              <Badge tone="navy">{plan.total} lines read</Badge>
              <Badge tone="green">{plan.rows.length} to save</Badge>
              <Badge tone="neutral">{plan.unchanged} unchanged</Badge>
              {plan.issues.length ? <Badge tone="red">{plan.issues.length} need attention</Badge> : null}
            </div>

            {plan.issues.length ? (
              <div className="mt-4 rounded-[10px] border border-amber/30 bg-amber-soft px-4 py-3">
                <p className="text-[13px] font-medium">These lines were not imported. Fix them in the sheet and upload again; the other lines can be imported now.</p>
                <ul className="mt-2 text-[12.5px] space-y-1 max-h-[220px] overflow-y-auto">
                  {plan.issues.map((i, n) => (
                    <li key={n}>
                      <span className="num text-ink-3">Line {i.line}:</span> {i.message}
                    </li>
                  ))}
                </ul>
              </div>
            ) : null}

            {plan.rows.length ? (
              <div className="mt-4 overflow-x-auto border border-line rounded-[10px] max-h-[360px] overflow-y-auto">
                <table className="data">
                  <thead>
                    <tr>
                      <th>Company</th>
                      <th>State</th>
                      <th>Sector</th>
                      <th>Industry</th>
                      <th>Platform</th>
                    </tr>
                  </thead>
                  <tbody>
                    {plan.rows.slice(0, 200).map((r) => (
                      <tr key={r.ipo_id}>
                        <td className="font-medium">{nameOf.get(r.ipo_id) ?? r.ipo_id}</td>
                        <td>{r.state ?? <span className="text-ink-3">Not specified</span>}</td>
                        <td>{r.sector ?? <span className="text-ink-3">Not specified</span>}</td>
                        <td>{r.industry ?? <span className="text-ink-3">—</span>}</td>
                        <td>{r.listing_platform ? platformLabel(r.listing_platform) : <span className="text-ink-3">Not specified</span>}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                {plan.rows.length > 200 ? <p className="text-[12px] text-ink-3 px-4 py-2">Showing the first 200 of {plan.rows.length}.</p> : null}
              </div>
            ) : null}

            <div className="mt-4">
              <Button onClick={() => void run()} disabled={busy || plan.rows.length === 0}>
                {busy ? "Importing…" : plan.rows.length ? `Import ${plan.rows.length} ${plan.rows.length === 1 ? "IPO" : "IPOs"}` : "Nothing to import"}
              </Button>
            </div>
          </div>
        ) : null}

        {result ? (
          <div className={`rounded-[10px] border px-4 py-3 text-[13px] mt-4 ${result.error ? "border-red/30 bg-red-soft text-red" : "border-green/30 bg-green-soft text-green"}`}>
            {result.error ? `Saved ${result.saved} before stopping: ${result.error}` : `Saved ${result.saved} ${result.saved === 1 ? "IPO" : "IPOs"}.`}
          </div>
        ) : null}
      </Card>
    </div>
  );
}
