import Database from "better-sqlite3";
import path from "path";
import fs from "fs";

let cachedDbPath: string | null = null;

export function invalidateDbPath() {
  cachedDbPath = null;
}

// Helper to get the current configured path
export function getDbPath() {
  if (cachedDbPath) return cachedDbPath;

  const configPath = path.join(process.cwd(), "src", "data", "dbposition.json");
  try {
    const configContent = fs.readFileSync(configPath, "utf8");
    const dbConfigPath = JSON.parse(configContent).dbPath;
    cachedDbPath = path.resolve(process.cwd(), dbConfigPath);
  } catch (e) {
    console.warn("Could not read dbposition.json, using default path: data/pos.db");
    cachedDbPath = path.resolve(process.cwd(), "data/pos.db");
  }
  return cachedDbPath;
}

// Create .env from .env.example if it doesn't exist
const envPath = path.resolve(process.cwd(), ".env");
const envExamplePath = path.resolve(process.cwd(), ".env.example");
if (!fs.existsSync(envPath) && fs.existsSync(envExamplePath)) {
  fs.copyFileSync(envExamplePath, envPath);
}

let db: any;
let currentDbPath: string | null = null;

export function getDb() {
  const expectedPath = getDbPath();

  // If the path changed, close the old connection and reconnect
  if (db && currentDbPath !== expectedPath) {
    console.log(`Database path changed from ${currentDbPath} to ${expectedPath}. Reconnecting...`);
    db.close();
    db = null;
  }

  if (!db) {
    const dbDir = path.dirname(expectedPath);
    if (!fs.existsSync(dbDir)) {
      fs.mkdirSync(dbDir, { recursive: true });
    }
    db = new Database(expectedPath);
    // Enable Write-Ahead Logging for better concurrency/performance
    db.pragma("journal_mode = WAL");
    db.pragma("wal_autocheckpoint = 100");
    currentDbPath = expectedPath;
  }
  return db;
}

export function initDb(targetDb?: Database.Database) {
  const database = targetDb ?? getDb();
  database.exec(`
    CREATE TABLE IF NOT EXISTS general (
      id INTEGER PRIMARY KEY CHECK (id = 1), -- singleton row
      organization_name TEXT,
      organization_address TEXT,
      organization_owner TEXT,
      currency TEXT DEFAULT 'CZK',
      organization_id TEXT,
      bank_iban TEXT,
      trx_msg TEXT,
      trx_vs_enabled INTEGER DEFAULT 0,
      trx_ks INTEGER,
      tax_rate REAL DEFAULT 21.0,
      organization_vat_id TEXT,
      tax_enabled INTEGER DEFAULT 0,
      receipt_title TEXT,
      receipt_header TEXT,
      receipt_header_enabled INTEGER DEFAULT 0,
      receipt_footer TEXT,
      receipt_footer_enabled INTEGER DEFAULT 0,
      eet_enable INTEGER DEFAULT 0,
      use_external_qr_api INTEGER DEFAULT 0
    );

    CREATE TABLE IF NOT EXISTS categories (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL UNIQUE,
      color TEXT,
      icon TEXT,
      position INTEGER DEFAULT 0
    );

    CREATE TABLE IF NOT EXISTS items (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      price REAL NOT NULL,
      category TEXT DEFAULT 'Ostatní',
      position INTEGER DEFAULT 0,
      icon TEXT
    );

    CREATE TABLE IF NOT EXISTS receipts (
      id INTEGER PRIMARY KEY, -- We use timestamp as ID
      created_at TEXT NOT NULL,
      issued_to TEXT,
      items TEXT NOT NULL, -- JSON blob of the receipt items at time of purchase
      payment_method TEXT,
      is_staff INTEGER DEFAULT 0,
      eet_fik TEXT,
      eet_bkp TEXT,
      eet_pkp TEXT
    );

    -- Index for faster sorting of receipts by date
    CREATE INDEX IF NOT EXISTS idx_receipts_created_at ON receipts(created_at DESC);

    -- Open tabs (accounts) by name
    CREATE TABLE IF NOT EXISTS tabs (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      is_permanent INTEGER DEFAULT 0, -- 0 = smaže se po čase, 1 = zůstává navždy
      is_table INTEGER DEFAULT 0, -- 1 = je to fyzický stůl
      is_staff INTEGER DEFAULT 0, -- Boolean stored as 0/1
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL, -- Pro sledování aktivity
      items TEXT DEFAULT '[]'
    );

    -- Trigger: Automatically set position to MAX + 1 if inserted as 0 or NULL
    CREATE TRIGGER IF NOT EXISTS trg_items_next_pos
    AFTER INSERT ON items
    WHEN NEW.position IS NULL OR NEW.position = 0
    BEGIN
      UPDATE items 
      SET position = (SELECT IFNULL(MAX(position), 0) + 1 FROM items WHERE id != NEW.id) 
      WHERE id = NEW.id;
    END;

    -- Trigger: Aktualizace updated_at v ISO 8601 UTC při změně tabu bez explicitní změny updated_at
    DROP TRIGGER IF EXISTS trg_tabs_timestamp;
    CREATE TRIGGER trg_tabs_timestamp
    AFTER UPDATE ON tabs
    WHEN NEW.updated_at = OLD.updated_at
    BEGIN
      UPDATE tabs SET updated_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now') WHERE id = NEW.id;
    END;

    -- Trigger: Auto-úklid (Garbage Collection)
    -- Při vytvoření nového tabu smaže dočasné (is_permanent=0), které nebyly aktivní 7 dní
    -- datetime(updated_at) spolehlivě porovná ISO 8601 i starší formát s mezerou
    DROP TRIGGER IF EXISTS trg_tabs_cleanup;
    CREATE TRIGGER trg_tabs_cleanup
    AFTER INSERT ON tabs
    BEGIN
      DELETE FROM tabs
      WHERE is_permanent = 0
      AND is_table = 0
      AND datetime(updated_at) < datetime('now', '-7 days');
    END;

    -- Ensure singleton row in general table exists
    INSERT OR IGNORE INTO general (id) VALUES (1);

    -- Nastavení externího klientského displeje (USB / ADB)
    CREATE TABLE IF NOT EXISTS customer_display_settings (
      id INTEGER PRIMARY KEY CHECK (id = 1),
      adb_path TEXT DEFAULT 'adb',
      device_serial TEXT DEFAULT '',
      port INTEGER DEFAULT 3000,
      auto_reverse INTEGER DEFAULT 0,
      auto_open_cd INTEGER DEFAULT 0,
      auto_immersive INTEGER DEFAULT 0,
      auto_stay_on INTEGER DEFAULT 0,
      auto_brightness INTEGER DEFAULT 0,
      idle_brightness INTEGER DEFAULT 60,
      active_brightness INTEGER DEFAULT 100,
      qr_brightness INTEGER DEFAULT 200,
      tap_x INTEGER DEFAULT 400,
      tap_y INTEGER DEFAULT 100
    );
    INSERT OR IGNORE INTO customer_display_settings (id) VALUES (1);
  `);

  const receiptCols = database.prepare("PRAGMA table_info(receipts)").all() as { name: string }[];
  if (!receiptCols.some((c) => c.name === "is_staff")) {
    database.exec("ALTER TABLE receipts ADD COLUMN is_staff INTEGER DEFAULT 0");
  }

  const cdCols = database
    .prepare("PRAGMA table_info(customer_display_settings)")
    .all() as { name: string }[];
  if (!cdCols.some((c) => c.name === "qr_brightness")) {
    database.exec("ALTER TABLE customer_display_settings ADD COLUMN qr_brightness INTEGER DEFAULT 200");
  }
  if (!cdCols.some((c) => c.name === "tap_x")) {
    database.exec("ALTER TABLE customer_display_settings ADD COLUMN tap_x INTEGER DEFAULT 400");
  }
  if (!cdCols.some((c) => c.name === "tap_y")) {
    database.exec("ALTER TABLE customer_display_settings ADD COLUMN tap_y INTEGER DEFAULT 100");
  }

  return database;
}

// Vracíme Proxy, aby "import db from '@/db'" vždy používalo aktuální instanci z getDb()
const dbProxy = new Proxy({} as any, {
  get: (_, prop) => {
    const database = getDb();
    if (!database) throw new Error("Database not initialized");
    return typeof database[prop] === "function" ? database[prop].bind(database) : database[prop];
  },
});

// Initial call - wrap in try-catch to prevent app crash if DB fails to init
if (!process.env.VITEST) {
  try {
    initDb();
  } catch (error) {
    console.error("Failed to initialize database:", error);
  }
}

function cleanupDb() {
  if (db) {
    try {
      console.log("Shutting down database: merging WAL and closing connection...");
      db.pragma("wal_checkpoint(TRUNCATE)");
      db.close();
      db = null;
    } catch (e) {
      console.error("Error closing database during cleanup:", e);
    }
  }
}

// Register cleanup handlers for clean process shutdown
process.on("exit", cleanupDb);
process.on("SIGINT", () => {
  cleanupDb();
  process.exit(0);
});
process.on("SIGTERM", () => {
  cleanupDb();
  process.exit(0);
});

export default dbProxy;
