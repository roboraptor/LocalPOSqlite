export const czk = new Intl.NumberFormat("cs-CZ", {
  style: "currency",
  currency: "CZK",
});

const currencyFormatters = new Map<string, Intl.NumberFormat>([["CZK", czk]]);

export function formatCurrency(amount: number, currency?: string | null): string {
  const code = (currency || "CZK").trim().toUpperCase() || "CZK";
  let formatter = currencyFormatters.get(code);
  if (!formatter) {
    try {
      formatter = new Intl.NumberFormat("cs-CZ", {
        style: "currency",
        currency: code,
      });
      currencyFormatters.set(code, formatter);
    } catch {
      formatter = czk;
    }
  }
  return formatter.format(amount);
}

export function toTimestamp(dateStr: string): number {
  if (!dateStr) return 0;
  const t = new Date(dateStr).getTime();
  return Number.isFinite(t) ? t : 0;
}

export function isWithinDateRange(dateStr: string, from: string, to: string): boolean {
  const ts = toTimestamp(dateStr);
  const fromBound = from ? new Date(`${from}T00:00:00`).getTime() : null;
  const toBound = to ? new Date(`${to}T23:59:59`).getTime() : null;

  if (fromBound && Number.isFinite(fromBound) && ts < fromBound) return false;
  if (toBound && Number.isFinite(toBound) && ts > toBound) return false;
  return true;
}
