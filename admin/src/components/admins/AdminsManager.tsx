"use client";

import { Copy, RefreshCw } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState } from "react";

import { Badge, Button, Card, EmptyState, ErrorBanner } from "@/components/ui";
import { dateTime } from "@/lib/format";
import type { AdminRole, AdminUserRow } from "@/lib/types";

function generatePassword(): string {
  const alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789";
  const bytes = crypto.getRandomValues(new Uint8Array(14));
  return Array.from(bytes, (b) => alphabet[b % alphabet.length]).join("");
}

export function AdminsManager({ admins, currentUserId, canWrite }: { admins: AdminUserRow[]; currentUserId: string; canWrite: boolean }) {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [name, setName] = useState("");
  const [password, setPassword] = useState(generatePassword());
  const [role, setRole] = useState<AdminRole>("editor");
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState<string | null>(null);
  const superCount = admins.filter((a) => a.role === "super_admin").length;

  const call = async (method: "POST" | "DELETE", body: unknown) => {
    const res = await fetch("/api/admins", { method, headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
    const json = (await res.json().catch(() => ({}))) as { error?: string };
    if (!res.ok) throw new Error(json.error ?? `Request failed (${res.status})`);
    return json;
  };

  const add = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy("add");
    setError(null);
    setDone(null);
    try {
      await call("POST", { email: email.trim(), password, role, full_name: name.trim() || undefined });
      setDone(`${email.trim()} can now sign in with the temporary password. Share it privately and ask them to change it.`);
      setEmail("");
      setName("");
      setPassword(generatePassword());
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not add admin.");
    } finally {
      setBusy(null);
    }
  };

  const remove = async (a: AdminUserRow) => {
    if (!confirm(`Remove admin access for ${a.email ?? a.user_id}? Their sign-in stays; they just lose the panel.`)) return;
    setBusy(a.user_id);
    setError(null);
    setDone(null);
    try {
      await call("DELETE", { user_id: a.user_id });
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not remove admin.");
    } finally {
      setBusy(null);
    }
  };

  return (
    <div className="grid xl:grid-cols-[1fr_380px] gap-6 items-start">
      <Card padded={false}>
        {admins.length === 0 ? (
          <EmptyState title="No admins listed" message="Once the migration is applied, the super admin appears here after signing in." />
        ) : (
          <table className="data">
            <thead>
              <tr>
                <th>Person</th>
                <th>Role</th>
                <th>Added</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {admins.map((a) => {
                const isMe = a.user_id === currentUserId;
                const lastSuper = a.role === "super_admin" && superCount <= 1;
                return (
                  <tr key={a.user_id}>
                    <td>
                      <p className="font-medium">{a.display_name ?? a.email ?? "—"}</p>
                      {a.display_name && a.email ? <p className="text-ink-3 text-[12px]">{a.email}</p> : null}
                      {isMe ? <p className="text-ink-3 text-[12px]">You</p> : null}
                    </td>
                    <td>
                      <Badge tone={a.role === "super_admin" ? "gold" : "navy"}>{a.role === "super_admin" ? "Super admin" : "Editor"}</Badge>
                    </td>
                    <td className="num text-ink-3 whitespace-nowrap">{dateTime(a.created_at)}</td>
                    <td className="text-right">
                      <Button variant="danger" size="sm" disabled={!canWrite || isMe || lastSuper || busy !== null} onClick={() => remove(a)} title={isMe ? "You cannot remove yourself" : lastSuper ? "The last super admin cannot be removed" : undefined}>
                        {busy === a.user_id ? "Removing…" : "Remove"}
                      </Button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </Card>

      <Card>
        <h2 className="text-[18px]">Add an admin</h2>
        <p className="text-ink-3 text-[13px] mt-0.5">They sign in at this address with the temporary password.</p>
        <form onSubmit={add} className="mt-5 space-y-4">
          <div>
            <label className="label" htmlFor="adm-name">
              Name
            </label>
            <input id="adm-name" className="field" value={name} onChange={(e) => setName(e.target.value)} placeholder="Research analyst" />
          </div>
          <div>
            <label className="label" htmlFor="adm-email">
              Email
            </label>
            <input id="adm-email" type="email" className="field" required value={email} onChange={(e) => setEmail(e.target.value)} placeholder="analyst@beipoready.com" />
          </div>
          <div>
            <label className="label" htmlFor="adm-pass">
              Temporary password
            </label>
            <div className="flex gap-2">
              <input id="adm-pass" className="field num" required minLength={8} value={password} onChange={(e) => setPassword(e.target.value)} />
              <Button type="button" variant="secondary" onClick={() => setPassword(generatePassword())} title="Generate">
                <RefreshCw size={14} />
              </Button>
              <Button type="button" variant="secondary" onClick={() => navigator.clipboard?.writeText(password)} title="Copy">
                <Copy size={14} />
              </Button>
            </div>
          </div>
          <div>
            <span className="label">Role</span>
            <div className="flex gap-2">
              {(["editor", "super_admin"] as AdminRole[]).map((r) => (
                <button key={r} type="button" onClick={() => setRole(r)} className={`h-9 px-3 rounded-[10px] border text-[13px] transition ${role === r ? "bg-navy text-white border-navy" : "bg-white border-line-strong text-ink-2 hover:border-ink-3"}`}>
                  {r === "editor" ? "Editor" : "Super admin"}
                </button>
              ))}
            </div>
            <p className="text-[12px] text-ink-3 mt-1.5">{role === "editor" ? "Writes insights and works leads." : "Everything an editor does, plus managing this list."}</p>
          </div>
          <ErrorBanner message={error} />
          {done ? <div className="rounded-[10px] border border-green/30 bg-green-soft text-green px-4 py-3 text-[13px]">{done}</div> : null}
          <Button type="submit" className="w-full" disabled={!canWrite || busy === "add"}>
            {busy === "add" ? "Adding…" : "Add admin"}
          </Button>
        </form>
      </Card>
    </div>
  );
}
