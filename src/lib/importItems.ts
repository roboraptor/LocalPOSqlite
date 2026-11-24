export interface NormalizedImportItem {
  name: string;
  price: number;
  category: string;
  position: number;
  icon: string | null;
  stock_unit?: string | null;
  stock_initial?: number | null;
  stock_deduct?: number | null;
}

export function parseItemsImportJson(raw: unknown): {
  items: NormalizedImportItem[];
  errors: string[];
} {
  if (!Array.isArray(raw)) {
    return { items: [], errors: ["JSON musí obsahovat pole položek (např. z exportu zálohy)."] };
  }

  if (raw.length === 0) {
    return { items: [], errors: ["Soubor neobsahuje žádné položky k importu."] };
  }

  const items: NormalizedImportItem[] = [];
  const errors: string[] = [];

  raw.forEach((entry, idx) => {
    const rowLabel = `Položka #${idx + 1}`;
    if (!entry || typeof entry !== "object") {
      errors.push(`${rowLabel}: neplatný objekt.`);
      return;
    }

    const obj = entry as Record<string, unknown>;
    const name = typeof obj.name === "string" ? obj.name.trim() : "";
    if (!name) {
      errors.push(`${rowLabel}: chybí název (name).`);
      return;
    }

    const price = Number(obj.price);
    if (!Number.isFinite(price) || price < 0) {
      errors.push(`${rowLabel} (${name}): neplatná cena.`);
      return;
    }

    const category =
      typeof obj.category === "string" && obj.category.trim() ? obj.category.trim() : "Ostatní";

    const icon =
      typeof obj.icon === "string" && obj.icon.trim() ? obj.icon.trim() : null;

    const rawPos = Number(obj.position);
    const position = Number.isInteger(rawPos) && rawPos > 0 ? rawPos : 0;

    const rawStockInitial =
      obj.stock_initial == null || obj.stock_initial === "" ? null : Number(obj.stock_initial);
    const hasValidStock =
      rawStockInitial !== null && Number.isFinite(rawStockInitial) && rawStockInitial > 0;

    if (hasValidStock) {
      const rawStockDeduct =
        obj.stock_deduct == null || obj.stock_deduct === "" ? 1 : Number(obj.stock_deduct);
      const stock_deduct =
        Number.isFinite(rawStockDeduct) && rawStockDeduct > 0 ? rawStockDeduct : 1;
      const stock_unit =
        typeof obj.stock_unit === "string" && obj.stock_unit.trim()
          ? obj.stock_unit.trim()
          : "ks";
      items.push({
        name,
        price,
        category,
        position,
        icon,
        stock_unit,
        stock_initial: rawStockInitial,
        stock_deduct,
      });
    } else {
      items.push({ name, price, category, position, icon });
    }
  });

  return { items, errors };
}
