import type { ReactNode } from "react";

import { Card } from "@/components/ui";

export interface RankColumn<T> {
  key: string;
  label: string;
  align?: "left" | "right";
  render: (row: T) => ReactNode;
}

/** Compact ranked table inside a card, with its own title and empty copy. */
export function RankTable<T>({ title, subtitle, rows, columns, empty = "Nothing in this range yet.", rowKey }: { title: string; subtitle?: string; rows: T[]; columns: RankColumn<T>[]; empty?: string; rowKey: (row: T, i: number) => string }) {
  return (
    <Card padded={false}>
      <div className="px-5 pt-4 pb-3 border-b border-line">
        <h3 className="text-[15px]">{title}</h3>
        {subtitle ? <p className="text-[12px] text-ink-3 mt-0.5">{subtitle}</p> : null}
      </div>
      {rows.length === 0 ? (
        <p className="px-5 py-6 text-[13px] text-ink-3">{empty}</p>
      ) : (
        <div className="overflow-x-auto">
          <table className="data">
            <thead>
              <tr>
                <th className="!pl-5 w-8">#</th>
                {columns.map((c) => (
                  <th key={c.key} className={c.align === "right" ? "text-right" : ""}>
                    {c.label}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {rows.map((r, i) => (
                <tr key={rowKey(r, i)}>
                  <td className="!pl-5 num text-ink-3">{i + 1}</td>
                  {columns.map((c) => (
                    <td key={c.key} className={c.align === "right" ? "text-right num" : ""}>
                      {c.render(r)}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </Card>
  );
}
