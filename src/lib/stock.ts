import type { Item } from "@/types/db";

export interface StockSummary {
  enabled: boolean;
  unit: string;
  initial: number;
  deduct: number;
  soldCount: number;
  soldAmount: number;
  remaining: number;
  percent: number;
  isEmpty: boolean;
}

function roundStock(value: number): number {
  return Math.round(value * 10000) / 10000;
}

/**
 * Returns true if the item has valid stock tracking configuration.
 */
export function hasItemStock(
  item: Pick<Item, "stock_initial" | "stock_deduct">,
): boolean {
  return (
    item.stock_initial != null &&
    item.stock_initial > 0 &&
    item.stock_deduct != null &&
    item.stock_deduct > 0
  );
}

/**
 * Counts sold/reserved item occurrences across paid receipts and open tabs.
 * Negative IDs (e.g. ad-hoc custom items) and malformed JSON blobs are ignored.
 */
export function computeItemUsageCounts(
  receiptsItemsJson: (string | null)[],
  tabsItemsJson: (string | null)[],
): Map<number, number> {
  const counts = new Map<number, number>();

  for (const raw of [...receiptsItemsJson, ...tabsItemsJson]) {
    if (!raw) continue;
    let parsed: unknown;
    try {
      parsed = JSON.parse(raw);
    } catch {
      continue;
    }
    if (!Array.isArray(parsed)) continue;

    for (const entry of parsed) {
      if (
        entry &&
        typeof entry === "object" &&
        typeof (entry as { id?: unknown }).id === "number" &&
        Number.isFinite((entry as { id: number }).id) &&
        (entry as { id: number }).id > 0
      ) {
        const id = (entry as { id: number }).id;
        counts.set(id, (counts.get(id) ?? 0) + 1);
      }
    }
  }

  return counts;
}

/**
 * Computes current stock summary for an item, or null if stock tracking is disabled.
 */
export function calculateItemStock(
  item: Pick<Item, "stock_unit" | "stock_initial" | "stock_deduct">,
  usedCount: number,
): StockSummary | null {
  if (!hasItemStock(item)) {
    return null;
  }

  const initial = item.stock_initial!;
  const deduct = item.stock_deduct!;
  const safeCount = Number.isFinite(usedCount) && usedCount > 0 ? usedCount : 0;
  const soldAmount = roundStock(safeCount * deduct);
  const remaining = roundStock(initial - soldAmount);
  const percent = Math.max(0, Math.min(100, (remaining / initial) * 100));

  return {
    enabled: true,
    unit: item.stock_unit?.trim() || "ks",
    initial,
    deduct,
    soldCount: safeCount,
    soldAmount,
    remaining,
    percent,
    isEmpty: remaining <= 0,
  };
}

/**
 * Formats stock quantities up to 2 decimal places without trailing zeros.
 */
export function formatStockNumber(value: number): string {
  const rounded = Math.round(value * 100) / 100;
  return Number.isInteger(rounded) ? String(rounded) : String(rounded);
}
