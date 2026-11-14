// Retail minimum application. Since SEBI's 2025 SME framework the minimum retail application in an
// SME IPO is 2 lots; Mainboard stays at 1 lot. The data feed's `min_investment` is price × one lot,
// so we never show it directly: prefer the issue's own "Retail (Min)" row, else derive it here.
import type { IpoListItem, LotTier } from "@/features/ipos/types";

export interface RetailMinimum {
  lots: number;
  shares: number;
  amount: number;
  /** true when taken from the issue's published lot table rather than derived */
  fromIssue: boolean;
}

export function minLotsFor(board: IpoListItem["board"]): number {
  return board === "sme" ? 2 : 1;
}

export function retailMinimum(ipo: Pick<IpoListItem, "board" | "lot_size" | "price_max" | "issue_price" | "min_investment"> & { lot_calculator?: LotTier[] | null }): RetailMinimum | null {
  const published = (ipo.lot_calculator ?? []).find((t) => /retail/i.test(t.label) && /min/i.test(t.label) && t.amount > 0 && t.lots > 0);
  if (published) return { lots: published.lots, shares: published.shares, amount: published.amount, fromIssue: true };

  const lots = minLotsFor(ipo.board);
  const price = ipo.price_max ?? ipo.issue_price ?? null;
  if (ipo.lot_size && price) {
    return { lots, shares: ipo.lot_size * lots, amount: ipo.lot_size * lots * price, fromIssue: false };
  }
  if (ipo.min_investment) {
    // No price band in the feed yet — scale the feed's one-lot figure.
    return { lots, shares: (ipo.lot_size ?? 0) * lots, amount: ipo.min_investment * lots, fromIssue: false };
  }
  return null;
}

/** Amount only, for list rows and share text. */
export function retailMinimumAmount(ipo: Parameters<typeof retailMinimum>[0]): number | null {
  return retailMinimum(ipo)?.amount ?? null;
}
