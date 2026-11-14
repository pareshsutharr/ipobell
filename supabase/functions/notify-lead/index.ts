// notify-lead — e-mails a business lead (from the app's readiness / eligibility / issue-size / issue-cost /
// checklist / book-a-call / hub forms) to the firm's notification addresses over SMTP.
//
// POST { "lead_id": "<uuid>" }                       → called by the business_leads_notify trigger (pg_net)
// POST { "test": true, "to": ["a@b.com"] }           → test mail from the admin panel (service-role bearer)
//
// Recipients: public.app_settings['lead_notifications'].emails, else LEAD_NOTIFY_DEFAULT_EMAIL.
// Trusted callers only (x-cron-secret or service-role bearer).

import { SMTPClient } from "https://deno.land/x/denomailer@1.6.0/mod.ts";

import { adminClient, isTrustedCaller } from "../_shared/auth.ts";
import { env, envOptional } from "../_shared/env.ts";
import { error, handleOptions, json, readJson } from "../_shared/http.ts";

interface Lead {
  id: string;
  user_id: string | null;
  source: string;
  name: string | null;
  company_name: string | null;
  phone: string | null;
  email: string | null;
  message: string | null;
  readiness_score: number | null;
  payload: Record<string, unknown> | null;
  app_version: string | null;
  status: string;
  created_at: string;
}

const SOURCE_LABEL: Record<string, string> = {
  "readiness-tool": "IPO Readiness Score",
  "eligibility-check": "Eligibility Check",
  "issue-size-calculator": "Issue Size Calculator",
  "issue-cost-estimator": "Issue Cost Estimator",
  "sme-ipo-checklist": "SME IPO Checklist",
  "book-call": "Book a call",
  "business-hub": "Get Listed enquiry",
};

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function esc(s: unknown): string {
  return String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c] as string);
}

function istTime(iso: string): string {
  return new Date(iso).toLocaleString("en-IN", { timeZone: "Asia/Kolkata", dateStyle: "medium", timeStyle: "short" }) + " IST";
}

function flatten(payload: Record<string, unknown> | null): [string, string][] {
  if (!payload || typeof payload !== "object") return [];
  return Object.entries(payload).map(([k, v]) => [k, typeof v === "object" && v !== null ? JSON.stringify(v) : String(v ?? "—")]);
}

async function recipients(admin: ReturnType<typeof adminClient>): Promise<{ enabled: boolean; emails: string[] }> {
  const fallback = [envOptional("LEAD_NOTIFY_DEFAULT_EMAIL") ?? "beipoready@gmail.com"];
  const { data } = await admin.from("app_settings").select("value").eq("key", "lead_notifications").maybeSingle();
  const value = (data?.value ?? {}) as { enabled?: boolean; emails?: unknown };
  const emails = Array.isArray(value.emails) ? value.emails.filter((e): e is string => typeof e === "string" && EMAIL_RE.test(e)) : [];
  return { enabled: value.enabled !== false, emails: emails.length ? emails : fallback };
}

function render(lead: Lead, panelUrl: string): { subject: string; html: string; text: string } {
  const tool = SOURCE_LABEL[lead.source] ?? lead.source;
  const who = lead.name?.trim() || "Unnamed";
  const subject = `New app lead · ${tool} · ${who}${lead.company_name ? ` (${lead.company_name})` : ""}`;
  const contact: [string, string][] = [
    ["Name", who],
    ["Company", lead.company_name ?? "—"],
    ["Mobile", lead.phone ?? "—"],
    ["Email", lead.email ?? "—"],
    ["Tool", tool],
    ...(lead.readiness_score !== null ? [["Readiness score", `${lead.readiness_score.toFixed(1)} / 10`] as [string, string]] : []),
    ["Submitted", istTime(lead.created_at)],
    ["App version", lead.app_version ?? "—"],
    ["Lead ID", lead.id],
  ];
  const details = flatten(lead.payload);
  const row = ([k, v]: [string, string]) =>
    `<tr><td style="padding:7px 10px;border-bottom:1px solid #ECE9E2;color:#6B7280;font-size:13px;white-space:nowrap;vertical-align:top">${esc(k)}</td><td style="padding:7px 10px;border-bottom:1px solid #ECE9E2;color:#1A1F2B;font-size:13px">${esc(v)}</td></tr>`;
  const phoneLink = lead.phone ? `<a href="tel:${esc(lead.phone.replace(/\s+/g, ""))}" style="color:#0F2D52">${esc(lead.phone)}</a>` : "";
  const waLink = lead.phone ? `<a href="https://wa.me/${esc(lead.phone.replace(/\D/g, "").replace(/^0+/, "").replace(/^(\d{10})$/, "91$1"))}" style="color:#0F2D52">WhatsApp</a>` : "";
  const mailLink = lead.email ? `<a href="mailto:${esc(lead.email)}" style="color:#0F2D52">${esc(lead.email)}</a>` : "";

  const html = `<!doctype html><html><body style="margin:0;background:#FBFAF7;font-family:-apple-system,Segoe UI,Roboto,Helvetica,Arial,sans-serif">
<div style="max-width:620px;margin:0 auto;padding:24px 16px">
  <div style="background:#0F2D52;border-radius:14px 14px 0 0;padding:18px 22px">
    <div style="color:#D4A440;font-size:11px;letter-spacing:.12em;text-transform:uppercase;font-weight:700">Be IPO Ready · app lead</div>
    <div style="color:#fff;font-size:20px;font-weight:600;margin-top:6px">${esc(who)}${lead.company_name ? ` <span style="color:rgba(255,255,255,.7);font-weight:400">· ${esc(lead.company_name)}</span>` : ""}</div>
    <div style="color:rgba(255,255,255,.75);font-size:13px;margin-top:4px">${esc(tool)} · ${esc(istTime(lead.created_at))}</div>
  </div>
  <div style="background:#fff;border:1px solid #ECE9E2;border-top:0;border-radius:0 0 14px 14px;padding:6px 12px 16px">
    <div style="padding:10px 10px 4px;font-size:12px;color:#6B7280;text-transform:uppercase;letter-spacing:.08em;font-weight:700">Contact</div>
    <table style="width:100%;border-collapse:collapse">${contact.map(row).join("")}</table>
    ${lead.phone || lead.email ? `<div style="padding:12px 10px 4px;font-size:13px">${[phoneLink, waLink, mailLink].filter(Boolean).join(" &nbsp;·&nbsp; ")}</div>` : ""}
    ${lead.message ? `<div style="padding:14px 10px 4px;font-size:12px;color:#6B7280;text-transform:uppercase;letter-spacing:.08em;font-weight:700">Message</div><div style="padding:4px 10px;font-size:13px;color:#1A1F2B;white-space:pre-wrap">${esc(lead.message)}</div>` : ""}
    ${details.length ? `<div style="padding:14px 10px 4px;font-size:12px;color:#6B7280;text-transform:uppercase;letter-spacing:.08em;font-weight:700">What they entered in the tool</div><table style="width:100%;border-collapse:collapse">${details.map(row).join("")}</table>` : ""}
    <div style="padding:16px 10px 4px"><a href="${esc(panelUrl)}/leads" style="display:inline-block;background:#0F2D52;color:#fff;text-decoration:none;font-size:13px;font-weight:600;padding:10px 16px;border-radius:10px">Open in admin panel</a></div>
  </div>
  <div style="color:#9AA1AE;font-size:11px;padding:12px 6px">Sent automatically by the Be IPO Ready app. Change who receives these in the admin panel → Settings.</div>
</div></body></html>`;

  const text = [
    `New app lead — ${tool}`,
    ...contact.map(([k, v]) => `${k}: ${v}`),
    lead.message ? `\nMessage:\n${lead.message}` : "",
    details.length ? `\nTool details:\n${details.map(([k, v]) => `- ${k}: ${v}`).join("\n")}` : "",
    `\n${panelUrl}/leads`,
  ]
    .filter(Boolean)
    .join("\n");
  return { subject, html, text };
}

async function sendMail(to: string[], subject: string, html: string, text: string) {
  const port = Number(envOptional("SMTP_PORT") ?? "465");
  const secure = (envOptional("SMTP_SECURE") ?? (port === 465 ? "true" : "false")) === "true";
  const client = new SMTPClient({
    connection: {
      hostname: env("SMTP_HOST"),
      port,
      tls: secure,
      auth: { username: env("SMTP_USER"), password: env("SMTP_PASSWORD") },
    },
  });
  try {
    // SMTP (RFC 5322) requires CRLF line endings; GoDaddy rejects bare LF with a 552.
    const crlf = (s: string) => s.replace(/\r?\n/g, "\r\n");
    await client.send({
      from: envOptional("SMTP_FROM") ?? env("SMTP_USER"),
      to,
      replyTo: envOptional("SMTP_REPLY_TO") ?? envOptional("SMTP_FROM") ?? env("SMTP_USER"),
      subject: subject.replace(/[\r\n]+/g, " "),
      content: crlf(text),
      html: crlf(html),
    });
  } finally {
    try {
      await client.close();
    } catch {
      // connection already closed
    }
  }
}

Deno.serve(async (req) => {
  const opt = handleOptions(req);
  if (opt) return opt;
  if (req.method !== "POST") return error("Method not allowed", 405);
  if (!isTrustedCaller(req)) return error("Unauthorized", 401);

  const body = await readJson<{ lead_id?: string; test?: boolean; to?: string[] }>(req);
  const admin = adminClient();
  const panelUrl = (envOptional("ADMIN_PANEL_URL") ?? "https://beipoready-admin.vercel.app").replace(/\/+$/, "");

  if (body.test) {
    const to = (body.to ?? []).filter((e) => EMAIL_RE.test(e));
    const list = to.length ? to : (await recipients(admin)).emails;
    const sample: Lead = {
      id: "test", user_id: null, source: "readiness-tool", name: "Test lead", company_name: "Sample Industries Pvt Ltd", phone: "+91 98765 43210",
      email: "promoter@example.com", message: "This is a test e-mail from the admin panel. Lead notifications are working.",
      readiness_score: 7.4, payload: { "Annual revenue": "₹25 – ₹100 Crore", "3-year revenue CAGR": "10% – 25%", "Section scores": "Financial Health 9/12 · Corporate Governance 8/12" },
      app_version: "test", status: "new", created_at: new Date().toISOString(),
    };
    const m = render(sample, panelUrl);
    try {
      await sendMail(list, `[Test] ${m.subject}`, m.html, m.text);
      return json({ ok: true, to: list });
    } catch (e) {
      return error(`SMTP failed: ${e instanceof Error ? e.message : String(e)}`, 502);
    }
  }

  if (!body.lead_id) return error("lead_id required");
  const { data: lead, error: leadErr } = await admin.from("business_leads").select("*").eq("id", body.lead_id).single();
  if (leadErr || !lead) return error("Lead not found", 404);

  const { enabled, emails } = await recipients(admin);
  if (!enabled) {
    await admin.from("business_leads").update({ notify_error: "notifications disabled" }).eq("id", body.lead_id);
    return json({ ok: true, skipped: "disabled" });
  }

  const m = render(lead as Lead, panelUrl);
  try {
    await sendMail(emails, m.subject, m.html, m.text);
    await admin.from("business_leads").update({ notified_at: new Date().toISOString(), notify_error: null }).eq("id", body.lead_id);
    return json({ ok: true, to: emails });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    await admin.from("business_leads").update({ notify_error: msg.slice(0, 500) }).eq("id", body.lead_id);
    return error(`SMTP failed: ${msg}`, 502);
  }
});
