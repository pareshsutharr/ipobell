"use client";

import { Mail, Plus, Send, X } from "lucide-react";
import { useState } from "react";

import { Button, Card, ErrorBanner } from "@/components/ui";
import { dateTime } from "@/lib/format";
import { supabaseBrowser } from "@/lib/supabase/client";
import type { LeadNotificationSettings } from "@/lib/types";

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export function NotificationSettings({ initial, updatedAt, canWrite, canTest }: { initial: LeadNotificationSettings; updatedAt: string | null; canWrite: boolean; canTest: boolean }) {
  const [emails, setEmails] = useState<string[]>(initial.emails);
  const [enabled, setEnabled] = useState(initial.enabled);
  const [draft, setDraft] = useState("");
  const [saving, setSaving] = useState(false);
  const [testing, setTesting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [savedAt, setSavedAt] = useState<string | null>(updatedAt);

  const dirty = enabled !== initial.enabled || emails.join(",") !== initial.emails.join(",");

  function add() {
    const e = draft.trim().toLowerCase();
    if (!EMAIL.test(e)) return setError("Enter a valid e-mail address.");
    if (emails.includes(e)) return setError("That address is already on the list.");
    setEmails([...emails, e]);
    setDraft("");
    setError(null);
  }

  async function save() {
    if (!emails.length) return setError("Keep at least one address, otherwise nobody hears about new leads.");
    setSaving(true);
    setError(null);
    setNotice(null);
    const { data, error: err } = await supabaseBrowser()
      .from("app_settings")
      .upsert({ key: "lead_notifications", value: { enabled, emails }, description: "Who gets an e-mail when an app user submits a business lead." }, { onConflict: "key" })
      .select("updated_at")
      .single();
    setSaving(false);
    if (err) return setError(err.message);
    setSavedAt((data as { updated_at: string }).updated_at);
    setNotice("Saved. New leads will go to this list from now on.");
    initial.enabled = enabled;
    initial.emails = [...emails];
  }

  async function sendTest() {
    setTesting(true);
    setError(null);
    setNotice(null);
    const res = await fetch("/api/notifications/test", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ to: emails }) });
    const body = (await res.json().catch(() => ({}))) as { error?: string; to?: string[] };
    setTesting(false);
    if (!res.ok) return setError(body.error ?? "Test failed.");
    setNotice(`Test e-mail sent to ${(body.to ?? emails).join(", ")}. Check the inbox (and spam) in a minute.`);
  }

  return (
    <div className="grid gap-5 max-w-[720px]">
      <Card>
        <div className="flex items-start justify-between gap-4">
          <div>
            <h2 className="text-[15px] font-semibold text-ink">Lead e-mail notifications</h2>
            <p className="text-[13px] text-ink-2 mt-1">
              Every time someone in the app completes the readiness score, eligibility check, issue size or cost calculator, the checklist, books a call or sends the Get Listed form, the full lead (contact details plus everything they entered) is e-mailed to these addresses from admin@beipoready.com.
            </p>
          </div>
          <label className="inline-flex items-center gap-2 text-[13px] shrink-0 cursor-pointer">
            <input type="checkbox" checked={enabled} disabled={!canWrite} onChange={(e) => setEnabled(e.target.checked)} className="w-4 h-4 accent-[#0F2D52]" />
            {enabled ? "On" : "Off"}
          </label>
        </div>

        <div className="mt-5">
          <p className="label">Send to</p>
          <ul className="divide-y divide-line border border-line rounded-[10px] bg-white">
            {emails.map((e) => (
              <li key={e} className="flex items-center gap-3 px-4 h-11 text-[13.5px]">
                <Mail size={14} className="text-ink-3" />
                <span className="flex-1 truncate">{e}</span>
                {canWrite ? (
                  <button type="button" onClick={() => setEmails(emails.filter((x) => x !== e))} className="text-ink-3 hover:text-red" aria-label={`Remove ${e}`}>
                    <X size={14} />
                  </button>
                ) : null}
              </li>
            ))}
            {!emails.length ? <li className="px-4 h-11 flex items-center text-[13px] text-ink-3">No addresses. Add one below.</li> : null}
          </ul>
          {canWrite ? (
            <form
              className="flex gap-2 mt-3"
              onSubmit={(e) => {
                e.preventDefault();
                add();
              }}
            >
              <input className="field flex-1" type="email" placeholder="name@company.com" value={draft} onChange={(e) => setDraft(e.target.value)} />
              <Button type="submit" variant="secondary">
                <Plus size={14} /> Add
              </Button>
            </form>
          ) : (
            <p className="text-[12.5px] text-ink-3 mt-3">Only a super admin can change this list.</p>
          )}
        </div>

        <ErrorBanner message={error} />
        {notice ? <p className="mt-4 text-[13px] text-green bg-green-soft rounded-[10px] px-4 py-2.5">{notice}</p> : null}

        <div className="flex flex-wrap items-center gap-3 mt-5 pt-5 border-t border-line">
          {canWrite ? (
            <Button onClick={save} disabled={!dirty || saving}>
              {saving ? "Saving…" : "Save changes"}
            </Button>
          ) : null}
          <Button variant="secondary" onClick={sendTest} disabled={testing || !emails.length || !canTest} title={canTest ? undefined : "Needs SUPABASE_SERVICE_ROLE_KEY on the server"}>
            <Send size={14} /> {testing ? "Sending…" : "Send a test e-mail"}
          </Button>
          <span className="text-[12px] text-ink-3 ml-auto">{savedAt ? `Last saved ${dateTime(savedAt)}` : "Using the default address"}</span>
        </div>
      </Card>

      <Card className="text-[13px] text-ink-2 space-y-2">
        <p className="font-semibold text-ink">How it works</p>
        <p>The database calls the <code>notify-lead</code> function the moment a lead is saved. The e-mail goes out over SMTP as admin@beipoready.com, and the lead row records when it was sent, or the error if it failed. You can see that on each lead under Leads.</p>
        <p>If sending fails, the lead is still here in the panel and is still forwarded to the website inbox.</p>
      </Card>
    </div>
  );
}
