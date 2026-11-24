import { NextRequest, NextResponse } from "next/server";
import db from "@/db"; // Alias @ by měl směřovat do src, nebo použijte relativní cestu '../../../../src/db'
import { Item } from "@/types/db";
import { calculateItemStock, computeItemUsageCounts } from "@/lib/stock";

function parseStockPayload(body: Record<string, unknown>):
  | { error: string }
  | { stock_unit: string | null; stock_initial: number | null; stock_deduct: number | null } {
  const rawInitial = body?.stock_initial;
  if (rawInitial === null || rawInitial === undefined || String(rawInitial).trim() === "") {
    return { stock_unit: null, stock_initial: null, stock_deduct: null };
  }

  const stockInitial = Number(String(rawInitial).replace(",", ".").trim());
  if (!Number.isFinite(stockInitial) || stockInitial <= 0) {
    return { error: "Naskladněné množství musí být kladné číslo." };
  }

  const rawDeduct = body?.stock_deduct;
  const stockDeduct =
    rawDeduct === null || rawDeduct === undefined || String(rawDeduct).trim() === ""
      ? 1
      : Number(String(rawDeduct).replace(",", ".").trim());
  if (!Number.isFinite(stockDeduct) || stockDeduct <= 0) {
    return { error: "Odečet za prodej musí být kladné číslo." };
  }

  const stockUnit =
    typeof body?.stock_unit === "string" && body.stock_unit.trim()
      ? body.stock_unit.trim()
      : "ks";

  return {
    stock_unit: stockUnit,
    stock_initial: stockInitial,
    stock_deduct: stockDeduct,
  };
}

// GET /api/items - Získat všechny položky
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const category = searchParams.get("category");

    let query = "SELECT * FROM items";
    const params: (string | number)[] = [];

    if (category) {
      query += " WHERE category = ?";
      params.push(category);
    }

    query += " ORDER BY position ASC";

    const items = db.prepare(query).all(...params) as Item[];
    const hasStockItems = items.some(
      (i) =>
        i.stock_initial != null &&
        i.stock_initial > 0 &&
        i.stock_deduct != null &&
        i.stock_deduct > 0,
    );

    let usageCounts = new Map<number, number>();
    if (hasStockItems) {
      const receiptRows = db
        .prepare("SELECT items FROM receipts")
        .all() as { items: string | null }[];
      const tabRows = db.prepare("SELECT items FROM tabs").all() as { items: string | null }[];
      usageCounts = computeItemUsageCounts(
        receiptRows.map((r) => r.items),
        tabRows.map((t) => t.items),
      );
    }

    const enriched = items.map((item) => {
      const stock = calculateItemStock(item, usageCounts.get(item.id) ?? 0);
      return {
        ...item,
        stock_used_count: stock ? stock.soldCount : 0,
        stock_remaining: stock ? stock.remaining : null,
        stock_percent: stock ? stock.percent : null,
      };
    });

    return NextResponse.json(enriched);
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

// POST /api/items - Vytvořit novou položku
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { name, price, category, icon, position } = body;

    if (!name) return NextResponse.json({ error: "Název je povinný" }, { status: 400 });

    const stock = parseStockPayload(body);
    if ("error" in stock) {
      return NextResponse.json({ error: stock.error }, { status: 400 });
    }

    // SQLite Trigger 'trg_items_next_pos' se postará o pozici, pokud je 0/null.
    // Pokud ale frontend pošle specifickou pozici, musíme ostatní posunout (reorder).
    // Pro jednoduchost v MVP necháme DB trigger řešit řazení na konec.

    const stmt = db.prepare(`
      INSERT INTO items (name, price, category, icon, position, stock_unit, stock_initial, stock_deduct)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `);

    const result = stmt.run(
      name,
      price || 0,
      category || "Ostatní",
      icon || null,
      position || 0, // 0 spustí trigger pro auto-increment pozice
      stock.stock_unit,
      stock.stock_initial,
      stock.stock_deduct,
    );

    return NextResponse.json({ success: true, id: result.lastInsertRowid }, { status: 201 });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

// PUT /api/items - Upravit existující položku
export async function PUT(request: NextRequest) {
  try {
    const body = await request.json();
    const { id, name, price, category, icon, position } = body;

    if (!id) return NextResponse.json({ error: "ID je povinné" }, { status: 400 });
    if (!name) return NextResponse.json({ error: "Název je povinný" }, { status: 400 });

    const stock = parseStockPayload(body);
    if ("error" in stock) {
      return NextResponse.json({ error: stock.error }, { status: 400 });
    }

    const stmt = db.prepare(`
      UPDATE items 
      SET name = ?, price = ?, category = ?, icon = ?, position = ?, stock_unit = ?, stock_initial = ?, stock_deduct = ?
      WHERE id = ?
    `);

    const result = stmt.run(
      name,
      price || 0,
      category || "Ostatní",
      icon || null,
      position ?? 0,
      stock.stock_unit,
      stock.stock_initial,
      stock.stock_deduct,
      id,
    );

    if (result.changes === 0) {
      return NextResponse.json({ error: "Položka nenalezena" }, { status: 404 });
    }

    return NextResponse.json({ success: true, id });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

// DELETE /api/items - Smazat položku
export async function DELETE(request: NextRequest) {
  try {
    const body = await request.json();
    const { id } = body;

    if (!id) return NextResponse.json({ error: "ID je povinné" }, { status: 400 });

    const result = db.prepare("DELETE FROM items WHERE id = ?").run(id);

    if (result.changes === 0) {
      return NextResponse.json({ error: "Položka nenalezena" }, { status: 404 });
    }

    return NextResponse.json({ success: true });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

// PATCH /api/items - Přeuspořádání (Drag & Drop na frontendu)
export async function PATCH(request: NextRequest) {
  try {
    const body = await request.json();
    const { order } = body; // Očekáváme pole [{ id: 1, position: 1 }, { id: 2, position: 2 }]

    if (!Array.isArray(order)) {
      return NextResponse.json({ error: "Neplatná data" }, { status: 400 });
    }

    const updateStmt = db.prepare("UPDATE items SET position = ? WHERE id = ?");

    // Použijeme transakci pro atomickou aktualizaci všech pozic
    const updateMany = db.transaction((items) => {
      for (const item of items) {
        updateStmt.run(item.position, item.id);
      }
    });

    updateMany(order);

    return NextResponse.json({ success: true });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
