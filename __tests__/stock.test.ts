// @vitest-environment node
import { describe, it, expect } from "vitest";
import Database from "better-sqlite3";
import { initDb } from "@/db";
import { computeItemUsageCounts, calculateItemStock, formatStockNumber } from "@/lib/stock";

describe("stock helpers", () => {
  it("counts usage from both receipts and open tabs and ignores negative/invalid entries", () => {
    const receipts = [
      JSON.stringify([{ id: 1 }, { id: 1 }, { id: 2 }, { id: -100 }]),
      "not-valid-json",
      null,
    ];
    const tabs = [JSON.stringify([{ id: 1 }, { id: 3 }]), "[]"];

    const counts = computeItemUsageCounts(receipts, tabs);
    expect(counts.get(1)).toBe(3);
    expect(counts.get(2)).toBe(1);
    expect(counts.get(3)).toBe(1);
    expect(counts.get(-100)).toBeUndefined();
  });

  it("returns null when stock tracking is disabled", () => {
    expect(calculateItemStock({ stock_unit: null, stock_initial: null, stock_deduct: null }, 5)).toBeNull();
    expect(calculateItemStock({ stock_unit: "L", stock_initial: 0, stock_deduct: 0.5 }, 5)).toBeNull();
    expect(calculateItemStock({ stock_unit: "L", stock_initial: 60, stock_deduct: 0 }, 5)).toBeNull();
  });

  it("computes remaining liters and pieces accurately for Kofola and Klobasy", () => {
    const kofola = { stock_unit: "L", stock_initial: 60, stock_deduct: 0.5 };
    const afterThree = calculateItemStock(kofola, 3);
    expect(afterThree).toEqual({
      enabled: true,
      unit: "L",
      initial: 60,
      deduct: 0.5,
      soldCount: 3,
      soldAmount: 1.5,
      remaining: 58.5,
      percent: 97.5,
      isEmpty: false,
    });

    // Mid-event restock: increasing stock_initial from 60 -> 120 preserves historical deduction
    const restocked = calculateItemStock({ ...kofola, stock_initial: 120 }, 3);
    expect(restocked?.remaining).toBe(118.5);
    expect(restocked?.percent).toBe(98.75);

    const klobasa = { stock_unit: "ks", stock_initial: 120, stock_deduct: 1 };
    const halfSold = calculateItemStock(klobasa, 60);
    expect(halfSold?.remaining).toBe(60);
    expect(halfSold?.percent).toBe(50);
    expect(halfSold?.isEmpty).toBe(false);
  });

  it("flags empty and oversold stock while clamping percent to 0", () => {
    const klobasa = { stock_unit: "ks", stock_initial: 10, stock_deduct: 1 };

    const exactZero = calculateItemStock(klobasa, 10);
    expect(exactZero?.remaining).toBe(0);
    expect(exactZero?.percent).toBe(0);
    expect(exactZero?.isEmpty).toBe(true);

    const oversold = calculateItemStock(klobasa, 13);
    expect(oversold?.remaining).toBe(-3);
    expect(oversold?.percent).toBe(0);
    expect(oversold?.isEmpty).toBe(true);
  });

  it("formats stock numbers cleanly", () => {
    expect(formatStockNumber(60)).toBe("60");
    expect(formatStockNumber(58.5)).toBe("58.5");
    expect(formatStockNumber(12.345)).toBe("12.35");
  });

  it("migrates legacy items table by adding stock columns", () => {
    const legacyDb = new Database(":memory:");
    legacyDb.exec(`
      CREATE TABLE items (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        name TEXT NOT NULL,
        price REAL NOT NULL,
        category TEXT DEFAULT 'Ostatní',
        position INTEGER DEFAULT 0,
        icon TEXT
      );
    `);

    initDb(legacyDb);

    const cols = legacyDb.prepare("PRAGMA table_info(items)").all() as { name: string }[];
    const colNames = cols.map((c) => c.name);
    expect(colNames).toContain("stock_unit");
    expect(colNames).toContain("stock_initial");
    expect(colNames).toContain("stock_deduct");
    legacyDb.close();
  });
});
