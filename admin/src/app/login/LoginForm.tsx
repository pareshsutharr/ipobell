"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { useEffect, useState } from "react";

import { Button, ErrorBanner } from "@/components/ui";
import { supabaseBrowser } from "@/lib/supabase/client";

type Mode = "signin" | "signup";

export function LoginForm() {
  const router = useRouter();
  const params = useSearchParams();
  const [mode, setMode] = useState<Mode>("signin");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [name, setName] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  useEffect(() => {
    const e = params.get("error");
    if (e === "noaccess") {
      setError("This account has no admin access. Ask the super admin to add you from Team access.");
      supabaseBrowser().auth.signOut().catch(() => undefined);
    } else if (e) {
      setError(e);
    }
  }, [params]);

  const google = async () => {
    setBusy(true);
    setError(null);
    const next = params.get("next");
    const redirectTo = `${window.location.origin}/auth/callback${next && next.startsWith("/") ? `?next=${encodeURIComponent(next)}` : ""}`;
    const { error: err } = await supabaseBrowser().auth.signInWithOAuth({ provider: "google", options: { redirectTo, queryParams: { prompt: "select_account" } } });
    if (err) {
      setError(err.message);
      setBusy(false);
    }
  };

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError(null);
    setNotice(null);
    const supabase = supabaseBrowser();
    try {
      if (mode === "signup") {
        const { data, error: err } = await supabase.auth.signUp({ email: email.trim(), password, options: { data: { full_name: name.trim() || undefined } } });
        if (err) throw err;
        if (!data.session) {
          setNotice("Check your inbox and confirm the email address, then sign in.");
          setMode("signin");
          return;
        }
      } else {
        const { error: err } = await supabase.auth.signInWithPassword({ email: email.trim(), password });
        if (err) throw err;
      }
      const { data: isAdmin, error: rpcErr } = await supabase.rpc("is_admin");
      if (rpcErr) throw rpcErr;
      if (!isAdmin) {
        await supabase.auth.signOut();
        setError("This account has no admin access. Ask the super admin to add you from Team access.");
        return;
      }
      const next = params.get("next");
      router.replace((next && next.startsWith("/") ? next : "/") as never);
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not sign in.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="w-full max-w-[380px]">
      <div className="lg:hidden mb-8">
        <p className="text-[11px] tracking-[0.18em] uppercase text-ink-3">Be IPO Ready · Admin</p>
      </div>
      <h2 className="text-[28px] leading-tight">{mode === "signin" ? "Sign in" : "Create your account"}</h2>
      <p className="text-ink-3 mt-2">{mode === "signin" ? "Use the email the super admin added for you." : "Only allow-listed emails receive admin access."}</p>

      <button type="button" onClick={google} disabled={busy} className="mt-7 w-full h-11 inline-flex items-center justify-center gap-3 rounded-[10px] border border-line-strong bg-white text-ink text-sm font-medium hover:border-ink-3 disabled:opacity-50">
        <svg width="18" height="18" viewBox="0 0 48 48" aria-hidden="true"><path fill="#EA4335" d="M24 9.5c3.5 0 6.6 1.2 9 3.5l6.7-6.7C35.6 2.5 30.2 0 24 0 14.6 0 6.5 5.4 2.6 13.3l7.8 6C12.3 13.6 17.7 9.5 24 9.5z"/><path fill="#4285F4" d="M46.5 24.5c0-1.6-.1-3.1-.4-4.5H24v9h12.7c-.6 3-2.3 5.5-4.8 7.2l7.5 5.8c4.4-4 7.1-10 7.1-17.5z"/><path fill="#FBBC05" d="M10.4 28.7A14.5 14.5 0 0 1 9.5 24c0-1.6.3-3.2.8-4.7l-7.8-6A24 24 0 0 0 0 24c0 3.9.9 7.5 2.6 10.7l7.8-6z"/><path fill="#34A853" d="M24 48c6.5 0 11.9-2.1 15.9-5.8l-7.5-5.8c-2.1 1.4-4.9 2.3-8.4 2.3-6.3 0-11.7-4.1-13.6-9.9l-7.8 6C6.5 42.6 14.6 48 24 48z"/></svg>
        Continue with Google
      </button>
      <div className="flex items-center gap-3 my-5 text-[12px] text-ink-3"><span className="flex-1 h-px bg-line" />or with email<span className="flex-1 h-px bg-line" /></div>

      <form onSubmit={submit} className="space-y-4">
        {mode === "signup" ? (
          <div>
            <label className="label" htmlFor="name">
              Your name
            </label>
            <input id="name" className="field" value={name} onChange={(e) => setName(e.target.value)} placeholder="Paresh Suthar" autoComplete="name" />
          </div>
        ) : null}
        <div>
          <label className="label" htmlFor="email">
            Email
          </label>
          <input id="email" type="email" className="field" value={email} onChange={(e) => setEmail(e.target.value)} required autoComplete="email" placeholder="you@beipoready.com" />
        </div>
        <div>
          <label className="label" htmlFor="password">
            Password
          </label>
          <input id="password" type="password" className="field" value={password} onChange={(e) => setPassword(e.target.value)} required minLength={8} autoComplete={mode === "signin" ? "current-password" : "new-password"} />
        </div>
        <ErrorBanner message={error} />
        {notice ? <div className="rounded-[10px] border border-green/30 bg-green-soft text-green px-4 py-3 text-[13px]">{notice}</div> : null}
        <Button type="submit" disabled={busy} className="w-full">
          {busy ? "Please wait…" : mode === "signin" ? "Sign in" : "Create account"}
        </Button>
      </form>

      <button
        type="button"
        onClick={() => {
          setMode(mode === "signin" ? "signup" : "signin");
          setError(null);
          setNotice(null);
        }}
        className="mt-6 text-[13px] text-navy hover:underline"
      >
        {mode === "signin" ? "First time here? Create your account" : "Already have an account? Sign in"}
      </button>
    </div>
  );
}
