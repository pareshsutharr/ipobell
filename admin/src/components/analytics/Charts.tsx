// Dependency-free SVG charts. Server-renderable (no hooks); tooltips via <title>.
import type { ReactNode } from "react";

import type { AnalyticsDailyRow } from "@/lib/types";

const NAVY = "#0f2d52";
const GOLD = "#c9962b";
const LINE = "#e6e4de";
const INK3 = "#7b8290";

function niceMax(n: number): number {
  if (n <= 5) return 5;
  const p = 10 ** Math.floor(Math.log10(n));
  const m = n / p;
  const step = m <= 1 ? 1 : m <= 2 ? 2 : m <= 5 ? 5 : 10;
  return step * p;
}

function dayLabel(d: string): string {
  return new Date(`${d}T00:00:00Z`).toLocaleDateString("en-IN", { day: "numeric", month: "short", timeZone: "UTC" });
}

/** Bars = active users per day, line = leads per day. */
export function DailyChart({ rows, fromDay, toDay }: { rows: AnalyticsDailyRow[]; fromDay: string; toDay: string }) {
  // Fill missing days with zeros so the x axis is continuous.
  const byDay = new Map(rows.map((r) => [r.day, r]));
  const days: string[] = [];
  for (let d = new Date(`${fromDay}T00:00:00Z`); d.toISOString().slice(0, 10) <= toDay && days.length < 400; d.setUTCDate(d.getUTCDate() + 1)) days.push(d.toISOString().slice(0, 10));
  const series = days.map((d) => ({ day: d, users: Number(byDay.get(d)?.users ?? 0), leads: Number(byDay.get(d)?.leads ?? 0), new_users: Number(byDay.get(d)?.new_users ?? 0) }));

  const W = 920;
  const H = 240;
  const padL = 40;
  const padR = 36;
  const padT = 14;
  const padB = 30;
  const innerW = W - padL - padR;
  const innerH = H - padT - padB;
  const maxUsers = niceMax(Math.max(1, ...series.map((s) => s.users)));
  const maxLeads = niceMax(Math.max(1, ...series.map((s) => s.leads)));
  const n = series.length || 1;
  const slot = innerW / n;
  const barW = Math.max(2, Math.min(28, slot * 0.62));
  const y = (v: number, max: number) => padT + innerH - (v / max) * innerH;
  const x = (i: number) => padL + i * slot + slot / 2;
  const ticks = [0, 0.25, 0.5, 0.75, 1].map((f) => f * maxUsers);
  const labelEvery = Math.ceil(n / 10);
  const linePath = series.map((s, i) => `${i === 0 ? "M" : "L"}${x(i).toFixed(1)},${y(s.leads, maxLeads).toFixed(1)}`).join(" ");

  return (
    <div>
      <svg viewBox={`0 0 ${W} ${H}`} className="w-full h-auto" role="img" aria-label="Daily active users and leads">
        {ticks.map((t) => (
          <g key={t}>
            <line x1={padL} x2={W - padR} y1={y(t, maxUsers)} y2={y(t, maxUsers)} stroke={LINE} strokeWidth={1} />
            <text x={padL - 8} y={y(t, maxUsers) + 4} fontSize={11} fill={INK3} textAnchor="end" className="num">
              {Math.round(t)}
            </text>
          </g>
        ))}
        {[0, 0.5, 1].map((f) => (
          <text key={f} x={W - padR + 8} y={y(f * maxLeads, maxLeads) + 4} fontSize={11} fill={GOLD} textAnchor="start" className="num">
            {Math.round(f * maxLeads)}
          </text>
        ))}
        {series.map((s, i) => (
          <g key={s.day}>
            <rect x={x(i) - barW / 2} y={y(s.users, maxUsers)} width={barW} height={Math.max(0, padT + innerH - y(s.users, maxUsers))} fill={NAVY} opacity={0.9} rx={2}>
              <title>{`${dayLabel(s.day)}\n${s.users} active users · ${s.new_users} new\n${s.leads} leads`}</title>
            </rect>
            {i % labelEvery === 0 ? (
              <text x={x(i)} y={H - 10} fontSize={11} fill={INK3} textAnchor="middle">
                {dayLabel(s.day)}
              </text>
            ) : null}
          </g>
        ))}
        <path d={linePath} fill="none" stroke={GOLD} strokeWidth={2} strokeLinejoin="round" strokeLinecap="round" />
        {series.map((s, i) =>
          s.leads > 0 ? (
            <circle key={s.day} cx={x(i)} cy={y(s.leads, maxLeads)} r={3.5} fill="#fff" stroke={GOLD} strokeWidth={2}>
              <title>{`${dayLabel(s.day)} · ${s.leads} lead${s.leads === 1 ? "" : "s"}`}</title>
            </circle>
          ) : null,
        )}
      </svg>
      <div className="flex items-center gap-5 text-[12px] text-ink-2 mt-1">
        <span className="inline-flex items-center gap-2">
          <span className="w-3 h-3 rounded-sm" style={{ background: NAVY }} /> Active users (left axis)
        </span>
        <span className="inline-flex items-center gap-2">
          <span className="w-4 h-[2px]" style={{ background: GOLD }} /> Leads (right axis)
        </span>
      </div>
    </div>
  );
}

/** 24 small bars: events by hour of day (IST). */
export function HourChart({ hours }: { hours: { hour: number; events: number }[] }) {
  const counts = Array.from({ length: 24 }, (_, h) => Number(hours.find((x) => Number(x.hour) === h)?.events ?? 0));
  const max = Math.max(1, ...counts);
  const W = 440;
  const H = 120;
  const padB = 20;
  const slot = W / 24;
  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="w-full h-auto" role="img" aria-label="Activity by hour of day">
      {counts.map((c, h) => {
        const bh = (c / max) * (H - padB - 6);
        return (
          <g key={h}>
            <rect x={h * slot + 3} y={H - padB - bh} width={slot - 6} height={bh} rx={2} fill={h >= 9 && h <= 18 ? NAVY : "#9aa5b8"}>
              <title>{`${h}:00–${h + 1}:00 IST · ${c} events`}</title>
            </rect>
            {h % 3 === 0 ? (
              <text x={h * slot + slot / 2} y={H - 5} fontSize={10} fill={INK3} textAnchor="middle">
                {h}
              </text>
            ) : null}
          </g>
        );
      })}
    </svg>
  );
}

/** Horizontal stacked bar with legend. */
export function StackedBar({ parts }: { parts: { label: string; value: number; color: string }[] }) {
  const total = parts.reduce((n, p) => n + p.value, 0) || 1;
  return (
    <div>
      <div className="flex h-3 w-full overflow-hidden rounded-full bg-[#f1efe9]">
        {parts.map((p) => (
          <div key={p.label} style={{ width: `${(p.value / total) * 100}%`, background: p.color }} title={`${p.label}: ${p.value}`} />
        ))}
      </div>
      <div className="flex flex-wrap gap-x-5 gap-y-1 mt-2 text-[12px] text-ink-2">
        {parts.map((p) => (
          <span key={p.label} className="inline-flex items-center gap-2">
            <span className="w-2.5 h-2.5 rounded-sm" style={{ background: p.color }} />
            {p.label} <span className="num text-ink-3">{Math.round((p.value / total) * 100)}%</span>
          </span>
        ))}
      </div>
    </div>
  );
}

/** One row of a funnel: three proportional bars. */
export function FunnelRow({ label, steps }: { label: ReactNode; steps: { label: string; value: number; color: string }[] }) {
  const max = Math.max(1, ...steps.map((s) => s.value));
  return (
    <div className="grid grid-cols-[180px_1fr] gap-4 items-center py-2.5 border-b border-line last:border-b-0">
      <div className="text-[13px] font-medium">{label}</div>
      <div className="space-y-1">
        {steps.map((s) => (
          <div key={s.label} className="flex items-center gap-2 text-[12px]">
            <div className="w-[88px] text-ink-3">{s.label}</div>
            <div className="flex-1 h-2 rounded-full bg-[#f1efe9] overflow-hidden">
              <div className="h-full rounded-full" style={{ width: `${(s.value / max) * 100}%`, background: s.color }} />
            </div>
            <div className="w-10 text-right num">{s.value}</div>
          </div>
        ))}
      </div>
    </div>
  );
}
