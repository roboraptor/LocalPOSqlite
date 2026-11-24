// @vitest-environment node
import { describe, it, expect, beforeEach, afterEach } from "vitest";
import Database from "better-sqlite3";
import { initDb } from "@/db";

describe("tabs timestamp & cleanup triggers", () => {
  let memDb: Database.Database;

  beforeEach(() => {
    memDb = new Database(":memory:");
    initDb(memDb);
  });

  afterEach(() => {
    memDb.close();
  });

  it("writes ISO 8601 UTC timestamp when updated_at is not explicitly changed", () => {
    const oldTs = new Date(Date.now() - 60_000).toISOString();
    const info = memDb
      .prepare(
        "INSERT INTO tabs (name, is_permanent, is_table, is_staff, created_at, updated_at, items) VALUES (?, 0, 0, 0, ?, ?, '[]')",
      )
      .run("Karel", oldTs, oldTs);

    memDb.prepare("UPDATE tabs SET items = ? WHERE id = ?").run('[{"name":"Pivo"}]', info.lastInsertRowid);

    const row = memDb
      .prepare("SELECT updated_at FROM tabs WHERE id = ?")
      .get(info.lastInsertRowid) as { updated_at: string };

    expect(row.updated_at).not.toBe(oldTs);
    expect(row.updated_at).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/);
  });

  it("preserves explicit ISO 8601 updated_at provided by API", () => {
    const createdTs = new Date(Date.now() - 60_000).toISOString();
    const explicitTs = new Date().toISOString();
    const info = memDb
      .prepare(
        "INSERT INTO tabs (name, is_permanent, is_table, is_staff, created_at, updated_at, items) VALUES (?, 0, 0, 0, ?, ?, '[]')",
      )
      .run("Jana", createdTs, createdTs);

    memDb
      .prepare("UPDATE tabs SET items = ?, updated_at = ? WHERE id = ?")
      .run('[{"name":"Kava"}]', explicitTs, info.lastInsertRowid);

    const row = memDb
      .prepare("SELECT updated_at FROM tabs WHERE id = ?")
      .get(info.lastInsertRowid) as { updated_at: string };

    expect(row.updated_at).toBe(explicitTs);
  });

  it("cleans up expired temporary tabs in both ISO 8601 and legacy space-separated formats", () => {
    const nowIso = new Date().toISOString();
    const insert = memDb.prepare(
      "INSERT INTO tabs (name, is_permanent, is_table, is_staff, created_at, updated_at, items) VALUES (?, ?, ?, 0, ?, ?, '[]')",
    );

    insert.run("Expired ISO", 0, 0, "2020-01-01T00:00:00.000Z", "2020-01-01T00:00:00.000Z");
    insert.run("Expired Legacy", 0, 0, "2020-01-01 00:00:00", "2020-01-01 00:00:00");
    insert.run("Permanent Expired", 1, 0, "2020-01-01T00:00:00.000Z", "2020-01-01T00:00:00.000Z");
    insert.run("Table Expired", 1, 1, "2020-01-01T00:00:00.000Z", "2020-01-01T00:00:00.000Z");
    // Inserting a fresh temporary tab triggers AFTER INSERT cleanup
    insert.run("Fresh Tab", 0, 0, nowIso, nowIso);

    const remaining = memDb
      .prepare("SELECT name FROM tabs ORDER BY id ASC")
      .all()
      .map((r: any) => r.name);

    expect(remaining).toEqual(["Permanent Expired", "Table Expired", "Fresh Tab"]);
  });

  it("migrates legacy receipts table by adding is_staff column if missing", () => {
    const legacyDb = new Database(":memory:");
    legacyDb.exec(`
      CREATE TABLE receipts (
        id INTEGER PRIMARY KEY,
        created_at TEXT NOT NULL,
        issued_to TEXT,
        items TEXT NOT NULL,
        payment_method TEXT,
        eet_fik TEXT,
        eet_bkp TEXT,
        eet_pkp TEXT
      );
    `);

    initDb(legacyDb);

    const cols = legacyDb.prepare("PRAGMA table_info(receipts)").all() as { name: string }[];
    expect(cols.some((c) => c.name === "is_staff")).toBe(true);
    legacyDb.close();
  });

  it("initializes singleton customer_display_settings row with defaults", () => {
    const row = memDb
      .prepare("SELECT * FROM customer_display_settings WHERE id = 1")
      .get() as {
      id: number;
      adb_path: string;
      port: number;
      auto_reverse: number;
      active_brightness: number;
      qr_brightness: number;
      tap_x: number;
      tap_y: number;
    };

    expect(row).toBeDefined();
    expect(row.id).toBe(1);
    expect(row.adb_path).toBe("adb");
    expect(row.port).toBe(3000);
    expect(row.auto_reverse).toBe(0);
    expect(row.active_brightness).toBe(100);
    expect(row.qr_brightness).toBe(200);
    expect(row.tap_x).toBe(400);
    expect(row.tap_y).toBe(100);
  });
});
