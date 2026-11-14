"use client";

import { BarChart3, Bug, Building2, LayoutDashboard, LogOut, MessageSquareText, Settings, Users } from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";

import type { AdminRole } from "@/lib/types";

const NAV = [
  { href: "/", label: "Overview", icon: LayoutDashboard, exact: true },
  { href: "/ipos", label: "IPOs & insights", icon: Building2 },
  { href: "/leads", label: "Leads", icon: MessageSquareText },
  { href: "/analytics", label: "Analytics", icon: BarChart3 },
  { href: "/errors", label: "App errors", icon: Bug },
  { href: "/admins", label: "Team access", icon: Users, superOnly: true },
  { href: "/settings", label: "Settings", icon: Settings },
] as const;

export function Sidebar({ email, role }: { email: string; role: AdminRole }) {
  const path = usePathname();
  return (
    <aside className="w-[232px] shrink-0 bg-navy-deep text-white flex flex-col min-h-screen sticky top-0 h-screen">
      <div className="px-5 pt-6 pb-5 border-b border-white/10">
        <p className="text-[10px] tracking-[0.18em] uppercase text-white/50 font-medium">Admin</p>
        <p className="display text-[20px] leading-tight mt-1">Be IPO Ready</p>
      </div>
      <nav className="px-3 py-4 flex-1 space-y-0.5">
        {NAV.filter((n) => !("superOnly" in n && n.superOnly) || role === "super_admin").map((n) => {
          const active = "exact" in n && n.exact ? path === n.href : path.startsWith(n.href);
          const Icon = n.icon;
          return (
            <Link key={n.href} href={n.href} className={`relative flex items-center gap-3 rounded-[10px] px-3 h-10 text-[13.5px] transition ${active ? "bg-white/10 text-white" : "text-white/65 hover:text-white hover:bg-white/5"}`}>
              {active ? <span className="absolute left-0 top-2.5 bottom-2.5 w-[3px] rounded-r bg-gold" /> : null}
              <Icon size={17} strokeWidth={1.75} />
              {n.label}
            </Link>
          );
        })}
      </nav>
      <div className="px-5 py-4 border-t border-white/10">
        <p className="text-[13px] truncate" title={email}>
          {email}
        </p>
        <p className="text-[11px] text-white/50 mt-0.5">{role === "super_admin" ? "Super admin" : "Editor"}</p>
        <form action="/auth/signout" method="post" className="mt-3">
          <button type="submit" className="inline-flex items-center gap-2 text-[12.5px] text-white/60 hover:text-white transition">
            <LogOut size={14} strokeWidth={1.75} /> Sign out
          </button>
        </form>
      </div>
    </aside>
  );
}
