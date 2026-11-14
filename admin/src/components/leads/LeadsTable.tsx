"use client";

import { Mail, MessageCircle, Phone, Search, X } from "lucide-react";
import { usePathname, useRouter } from "next/navigation";
import { useState } from "react";

import { Badge, Button, Card, EmptyState, ErrorBanner, statusTone } from "@/components/ui";
import { dateTime } from "@/lib/format";
import { supabaseBrowser } from "@/lib/supabase/client";
import { LEAD_SOURCE_LABEL, LEAD_STATUSES, type LeadRow, type LeadSource, type LeadStatus } from "@/lib/types";

type Filters = { status: string; source: string; q: string };

export function LeadsTable({ leads: initial, filters }: { leads: LeadRow[]; filters: Filters }) {
  const router = useRouter();
  const path = usePathname();
  const [leads, setLeads] = useState(initial);
  const [open, setOpen] = useState<LeadRow | null>(null);
  const [text, setText] = useState(filters.q);

  const apply = (patch: Partial<Filters>) => {
    const next = { ...filters, q: text, ...patch };
    const params = new URLSearchParams();
    Object.entries(next).forEach(([k, v]) => v && params.set(k, v));
    router.replace(`${path}${params.size ? `?${params}` : ""}` as never);
  };

  const onSaved = (row: LeadRow) => {
    setLeads((ls) => ls.map((l) => (l.id === row.id ? row : l)));
    setOpen(row);
  };

  return (
    <>
      <form
        onSubmit={(e) => {
          e.preventDefault();
          apply({ q: text });
        }}
        className="flex flex-wrap items-center gap-2"
      >
        <div className="relative">
          <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-ink-3" />
          <input className="field h-10 !w-[280px] !pl-9" placeholder="Name, company, phone or email" value={text} onChange={(e) => setText(e.target.value)} />
        </div>
        <select className="field h-10 !w-auto pr-8" value={filters.status} onChange={(e) => apply({ status: e.target.value })}>
          <option value="">All statuses</option>
          {LEAD_STATUSES.map((s) => (
            <option key={s} value={s}>
              {s[0].toUpperCase() + s.slice(1)}
            </option>
          ))}
        </select>
        <select className="field h-10 !w-auto pr-8" value={filters.source} onChange={(e) => apply({ source: e.target.value })}>
          <option value="">All sources</option>
          {(Object.keys(LEAD_SOURCE_LABEL) as LeadSource[]).map((s) => (
            <option key={s} value={s}>
              {LEAD_SOURCE_LABEL[s]}
            </option>
          ))}
        </select>
        <span className="text-ink-3 text-[13px] ml-auto num">{leads.length} lead{leads.length === 1 ? "" : "s"}</span>
      </form>

      <Card padded={false} className="mt-4 overflow-x-auto">
        {leads.length === 0 ? (
          <EmptyState title="No leads here" message={filters.q || filters.status || filters.source ? "Nothing matches these filters." : "Leads appear the moment someone submits a form in the app."} />
        ) : (
          <table className="data">
            <thead>
              <tr>
                <th>When</th>
                <th>Name</th>
                <th>Company</th>
                <th>Contact</th>
                <th>Source</th>
                <th className="text-right">Readiness</th>
                <th>Status</th>
              </tr>
            </thead>
            <tbody>
              {leads.map((l) => (
                <tr key={l.id} className="clickable" onClick={() => setOpen(l)}>
                  <td className="num text-ink-3 whitespace-nowrap">{dateTime(l.created_at)}</td>
                  <td className="font-medium">{l.name}</td>
                  <td className="text-ink-2">{l.company_name ?? "—"}</td>
                  <td className="text-ink-2 num">
                    {l.phone ?? l.email ?? "—"}
                    {l.phone && l.email ? <span className="block text-[12px] text-ink-3">{l.email}</span> : null}
                  </td>
                  <td className="text-ink-2">{LEAD_SOURCE_LABEL[l.source] ?? l.source}</td>
                  <td className="num text-right">{l.readiness_score !== null ? `${Number(l.readiness_score).toFixed(1)} / 10` : "—"}</td>
                  <td>
                    <Badge tone={statusTone(l.status)}>{l.status}</Badge>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </Card>

      {open ? <LeadDrawer lead={open} onClose={() => setOpen(null)} onSaved={onSaved} /> : null}
    </>
  );
}

function LeadDrawer({ lead, onClose, onSaved }: { lead: LeadRow; onClose: () => void; onSaved: (l: LeadRow) => void }) {
  const [status, setStatus] = useState<LeadStatus>(lead.status);
  const [notes, setNotes] = useState(lead.notes ?? "");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const dirty = status !== lead.status || notes !== (lead.notes ?? "");

  const save = async () => {
    setBusy(true);
    setError(null);
    const { data, error: err } = await supabaseBrowser().from("business_leads").update({ status, notes: notes.trim() || null }).eq("id", lead.id).select("*").single();
    setBusy(false);
    if (err) return setError(err.message);
    onSaved(data as LeadRow);
  };

  const wa = lead.phone ? `https://wa.me/${lead.phone.replace(/\D/g, "").replace(/^0/, "91").replace(/^(\d{10})$/, "91$1")}` : null;
  const payload = Object.entries(lead.payload ?? {});

  return (
    <div className="fixed inset-0 z-40 flex justify-end" role="dialog" aria-modal="true">
      <button type="button" className="absolute inset-0 bg-ink/30" onClick={onClose} aria-label="Close" />
      <aside className="relative w-full max-w-[520px] h-full bg-paper border-l border-line overflow-y-auto scrollbar-thin">
        <div className="sticky top-0 bg-paper/95 backdrop-blur border-b border-line px-6 py-4 flex items-start justify-between gap-4">
          <div>
            <h2 className="text-[22px] leading-tight">{lead.name}</h2>
            <p className="text-ink-3 text-[13px] mt-0.5">
              {lead.company_name ? `${lead.company_name} · ` : ""}
              {LEAD_SOURCE_LABEL[lead.source] ?? lead.source} · {dateTime(lead.created_at)}
            </p>
          </div>
          <button type="button" onClick={onClose} className="text-ink-3 hover:text-ink p-1" aria-label="Close">
            <X size={18} />
          </button>
        </div>

        <div className="px-6 py-5 space-y-6">
          <div className="flex flex-wrap gap-2">
            {lead.phone ? (
              <a className="inline-flex items-center gap-2 h-9 px-3 rounded-[10px] border border-line-strong bg-white text-[13px] hover:border-ink-3" href={`tel:${lead.phone.replace(/\s/g, "")}`}>
                <Phone size={14} /> {lead.phone}
              </a>
            ) : null}
            {wa ? (
              <a className="inline-flex items-center gap-2 h-9 px-3 rounded-[10px] border border-line-strong bg-white text-[13px] hover:border-ink-3" href={wa} target="_blank" rel="noreferrer">
                <MessageCircle size={14} /> WhatsApp
              </a>
            ) : null}
            {lead.email ? (
              <a className="inline-flex items-center gap-2 h-9 px-3 rounded-[10px] border border-line-strong bg-white text-[13px] hover:border-ink-3" href={`mailto:${lead.email}`}>
                <Mail size={14} /> {lead.email}
              </a>
            ) : null}
          </div>

          {lead.message ? (
            <div>
              <p className="label">Their message</p>
              <p className="bg-white border border-line rounded-[10px] px-4 py-3 text-[13.5px] whitespace-pre-line">{lead.message}</p>
            </div>
          ) : null}

          {lead.readiness_score !== null ? (
            <div>
              <p className="label">Readiness score</p>
              <p className="display text-[28px] num">{Number(lead.readiness_score).toFixed(1)} / 10</p>
            </div>
          ) : null}

          <div>
            <p className="label">What they entered in the tool</p>
            {payload.length === 0 ? (
              <p className="text-ink-3 text-[13px]">Nothing beyond the contact details.</p>
            ) : (
              <dl className="bg-white border border-line rounded-[10px] divide-y divide-line">
                {payload.map(([k, v]) => (
                  <div key={k} className="grid grid-cols-[40%_1fr] gap-3 px-4 py-2.5 text-[13px]">
                    <dt className="text-ink-3 break-words">{k.replace(/[_-]/g, " ")}</dt>
                    <dd className="break-words whitespace-pre-wrap num">{typeof v === "object" && v !== null ? JSON.stringify(v, null, 1).replace(/[{}"]/g, "").trim() : String(v)}</dd>
                  </div>
                ))}
              </dl>
            )}
          </div>

          <div className="grid grid-cols-2 gap-3 text-[12px] text-ink-3">
            <p>App version · {lead.app_version ?? "—"}</p>
            <p>Forwarded to website · {lead.forwarded_at ? dateTime(lead.forwarded_at) : "not yet"}</p>
            <p className="col-span-2">{lead.notified_at ? `E-mailed to the team · ${dateTime(lead.notified_at)}` : lead.notify_error ? `E-mail failed · ${lead.notify_error}` : "E-mail to the team · pending"}</p>
          </div>

          <div className="border-t border-line pt-5 space-y-4">
            <div>
              <label className="label" htmlFor="lead-status">
                Status
              </label>
              <select id="lead-status" className="field" value={status} onChange={(e) => setStatus(e.target.value as LeadStatus)}>
                {LEAD_STATUSES.map((s) => (
                  <option key={s} value={s}>
                    {s[0].toUpperCase() + s.slice(1)}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="label" htmlFor="lead-notes">
                Notes for the team
              </label>
              <textarea id="lead-notes" className="field" value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Spoke on 3 Nov. Wants NSE Emerge, FY25 PAT about ₹2.4 Cr. Follow up after Diwali." />
            </div>
            <ErrorBanner message={error} />
            <div className="flex justify-end gap-2">
              <Button variant="secondary" onClick={onClose}>
                Close
              </Button>
              <Button onClick={save} disabled={!dirty || busy}>
                {busy ? "Saving…" : "Save"}
              </Button>
            </div>
          </div>
        </div>
      </aside>
    </div>
  );
}
