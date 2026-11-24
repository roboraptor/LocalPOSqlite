import { NextRequest, NextResponse } from "next/server";
import db from "@/db";
import { parseItemsImportJson } from "@/lib/importItems";

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const mode = body?.mode === "replace" ? "replace" : "append";
    const createMissingCategories = body?.createMissingCategories !== false;

    const { items, errors } = parseItemsImportJson(body?.items);
    if (errors.length > 0 || items.length === 0) {
      return NextResponse.json(
        { error: errors[0] || "Neplatná data pro import.", errors },
        { status: 400 },
      );
    }

    const importTx = db.transaction(() => {
      if (mode === "replace") {
        db.prepare("DELETE FROM items").run();
      }

      if (createMissingCategories) {
        const insertCat = db.prepare(
          "INSERT OR IGNORE INTO categories (name, color, icon, position) VALUES (?, '#22c55e', 'FaCubes', 0)",
        );
        const uniqueCategories = new Set(items.map((item) => item.category));
        for (const cat of uniqueCategories) {
          insertCat.run(cat);
        }
      }

      const insertItem = db.prepare(
        "INSERT INTO items (name, price, category, icon, position, stock_unit, stock_initial, stock_deduct) VALUES (?, ?, ?, ?, ?, ?, ?, ?)",
      );

      for (const item of items) {
        // Při přidávání k existujícím předáme 0, aby trigger trg_items_next_pos zařadil položku na konec
        const pos = mode === "replace" ? item.position : 0;
        insertItem.run(
          item.name,
          item.price,
          item.category,
          item.icon,
          pos,
          item.stock_unit ?? null,
          item.stock_initial ?? null,
          item.stock_deduct ?? null,
        );
      }
    });

    importTx();

    return NextResponse.json({
      success: true,
      imported: items.length,
      mode,
    });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
