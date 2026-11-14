import Link from "next/link";
import type { ButtonHTMLAttributes, ReactNode } from "react";

type Variant = "primary" | "secondary" | "ghost" | "danger" | "gold";

const VARIANT: Record<Variant, string> = {
  primary: "bg-navy text-white hover:bg-navy-deep border border-navy",
  gold: "bg-gold text-white hover:brightness-95 border border-gold",
  secondary: "bg-white text-ink border border-line-strong hover:border-ink-3",
  ghost: "bg-transparent text-ink-2 hover:bg-navy-soft border border-transparent",
  danger: "bg-transparent text-red hover:bg-red-soft border border-transparent",
};

export function Button({ variant = "primary", size = "md", className = "", ...rest }: ButtonHTMLAttributes<HTMLButtonElement> & { variant?: Variant; size?: "sm" | "md" }) {
  const sz = size === "sm" ? "h-8 px-3 text-[13px]" : "h-10 px-4 text-sm";
  return <button {...rest} className={`inline-flex items-center justify-center gap-2 rounded-[10px] font-medium transition disabled:opacity-50 disabled:cursor-not-allowed ${sz} ${VARIANT[variant]} ${className}`} />;
}

export function LinkButton({ href, children, variant = "secondary", size = "md", className = "" }: { href: string; children: ReactNode; variant?: Variant; size?: "sm" | "md"; className?: string }) {
  const sz = size === "sm" ? "h-8 px-3 text-[13px]" : "h-10 px-4 text-sm";
  return (
    <Link href={href as never} className={`inline-flex items-center justify-center gap-2 rounded-[10px] font-medium transition ${sz} ${VARIANT[variant]} ${className}`}>
      {children}
    </Link>
  );
}

export function Card({ children, className = "", padded = true }: { children: ReactNode; className?: string; padded?: boolean }) {
  return <div className={`bg-white border border-line rounded-[14px] ${padded ? "p-5" : ""} ${className}`}>{children}</div>;
}

type Tone = "neutral" | "navy" | "green" | "amber" | "red" | "blue" | "gold";
const TONE: Record<Tone, string> = {
  neutral: "bg-[#f1efe9] text-ink-2",
  navy: "bg-navy-soft text-navy",
  green: "bg-green-soft text-green",
  amber: "bg-amber-soft text-amber",
  red: "bg-red-soft text-red",
  blue: "bg-blue-soft text-blue",
  gold: "bg-gold-soft text-[#8a6418]",
};

export function Badge({ children, tone = "neutral", className = "" }: { children: ReactNode; tone?: Tone; className?: string }) {
  return <span className={`inline-flex items-center rounded-md px-2 h-[22px] text-[12px] font-medium whitespace-nowrap ${TONE[tone]} ${className}`}>{children}</span>;
}

export function statusTone(status: string): Tone {
  switch (status) {
    case "open":
    case "published":
    case "qualified":
      return "green";
    case "upcoming":
    case "contacted":
      return "blue";
    case "closed":
      return "amber";
    case "spam":
      return "red";
    case "new":
      return "gold";
    case "draft":
      return "navy";
    default:
      return "neutral";
  }
}

export function PageHeader({ title, subtitle, actions }: { title: string; subtitle?: string; actions?: ReactNode }) {
  return (
    <div className="flex items-end justify-between gap-6 mb-6">
      <div>
        <h1 className="text-[26px] leading-tight">{title}</h1>
        {subtitle ? <p className="text-ink-3 mt-1">{subtitle}</p> : null}
      </div>
      {actions ? <div className="flex items-center gap-2">{actions}</div> : null}
    </div>
  );
}

export function EmptyState({ title, message, action }: { title: string; message?: string; action?: ReactNode }) {
  return (
    <div className="text-center py-16 px-6">
      <p className="font-medium">{title}</p>
      {message ? <p className="text-ink-3 mt-1 max-w-md mx-auto">{message}</p> : null}
      {action ? <div className="mt-5 flex justify-center">{action}</div> : null}
    </div>
  );
}

export function ErrorBanner({ message }: { message: string | null | undefined }) {
  if (!message) return null;
  return <div className="rounded-[10px] border border-red/30 bg-red-soft text-red px-4 py-3 text-[13px]">{message}</div>;
}

export function Stat({ label, value, hint }: { label: string; value: ReactNode; hint?: string }) {
  return (
    <Card>
      <p className="text-[11px] uppercase tracking-[0.08em] text-ink-3 font-medium">{label}</p>
      <p className="display text-[30px] leading-none mt-3 num">{value}</p>
      {hint ? <p className="text-ink-3 text-[12px] mt-2">{hint}</p> : null}
    </Card>
  );
}
