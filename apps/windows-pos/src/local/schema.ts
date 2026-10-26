/**
 * Counter SQLite schema. Versioned with PRAGMA user_version.
 *
 * Design notes:
 * - sales rows are the transactional outbox source: the sale and its outbox event
 *   are inserted in ONE transaction (see repos.saveSaleWithOutbox).
 * - catalog tables are replaceable caches; refreshing them never touches sales.
 * - all timestamps stored as epoch millis (UTC) to avoid local-time ambiguity.
 */
export interface Migration {
  version: number;
  statements: string[];
}

export const MIGRATIONS: Migration[] = [
  {
    version: 1,
    statements: [      `CREATE TABLE IF NOT EXISTS schema_meta (
         key TEXT PRIMARY KEY,
         value TEXT NOT NULL
       )`,
      `CREATE TABLE IF NOT EXISTS catalog_items (
         item_code TEXT PRIMARY KEY,
         item_name TEXT NOT NULL,
         item_group TEXT,
         stock_uom TEXT NOT NULL,
         brand TEXT,
         description TEXT,
         is_stock_item INTEGER NOT NULL DEFAULT 1,
         has_batch_no INTEGER NOT NULL DEFAULT 0,
         aliases TEXT NOT NULL DEFAULT '',
         price_minor INTEGER,
         currency TEXT,
         modified TEXT NOT NULL,
         payload TEXT NOT NULL
       )`,
      `CREATE INDEX IF NOT EXISTS idx_catalog_items_name ON catalog_items(item_name)`,
      `CREATE TABLE IF NOT EXISTS catalog_barcodes (
         barcode TEXT PRIMARY KEY,
         item_code TEXT NOT NULL REFERENCES catalog_items(item_code) ON DELETE CASCADE
       )`,
      `CREATE INDEX IF NOT EXISTS idx_catalog_barcodes_item ON catalog_barcodes(item_code)`,
      `CREATE TABLE IF NOT EXISTS catalog_meta (
         id INTEGER PRIMARY KEY CHECK (id = 1),
         checkpoint TEXT NOT NULL DEFAULT '',
         price_list TEXT NOT NULL DEFAULT '',
         currency TEXT,
         updated_at INTEGER NOT NULL
       )`,
      `CREATE TABLE IF NOT EXISTS sales (
         transaction_id TEXT PRIMARY KEY,
         state TEXT NOT NULL,
         payload TEXT NOT NULL,
         response TEXT,
         attempts INTEGER NOT NULL DEFAULT 0,
         next_attempt_at INTEGER,
         last_error_code TEXT,
         last_error_message TEXT,
         device_id TEXT,
         receipt_printed INTEGER NOT NULL DEFAULT 0,
         created_at INTEGER NOT NULL,
         updated_at INTEGER NOT NULL
       )`,
      `CREATE INDEX IF NOT EXISTS idx_sales_state ON sales(state, next_attempt_at)`,
      `CREATE TABLE IF NOT EXISTS outbox (
         event_id TEXT PRIMARY KEY,
         transaction_id TEXT NOT NULL REFERENCES sales(transaction_id),
         event_type TEXT NOT NULL,
         payload TEXT NOT NULL,
         created_at INTEGER NOT NULL,
         dispatched_at INTEGER
       )`,
      `CREATE INDEX IF NOT EXISTS idx_outbox_dispatched ON outbox(dispatched_at)`,
      `CREATE TABLE IF NOT EXISTS shifts (
         shift_id TEXT PRIMARY KEY,
         device_id TEXT NOT NULL,
         cashier TEXT NOT NULL,
         opened_at INTEGER NOT NULL,
         closed_at INTEGER,
         opening_float_minor INTEGER NOT NULL DEFAULT 0,
         counted_minor INTEGER,
         expected_minor INTEGER,
         variance_minor INTEGER,
         status TEXT NOT NULL DEFAULT 'OPEN'
       )`,
      `CREATE TABLE IF NOT EXISTS sync_runs (
         run_id INTEGER PRIMARY KEY AUTOINCREMENT,
         started_at INTEGER NOT NULL,
         finished_at INTEGER,
         committed INTEGER NOT NULL DEFAULT 0,
         reviewed INTEGER NOT NULL DEFAULT 0,
         failed INTEGER NOT NULL DEFAULT 0
       )`,
    ],
  },
  {
    version: 2,
    statements: [
      // v2: returns — kind discriminator + return link on sync records
      `ALTER TABLE sales ADD COLUMN kind TEXT NOT NULL DEFAULT 'sale'`,
      `ALTER TABLE sales ADD COLUMN original_invoice TEXT`,
      `CREATE INDEX IF NOT EXISTS idx_sales_kind ON sales(kind)`,
    ],
  },
];

export const CURRENT_VERSION = MIGRATIONS.reduce((max, m) => Math.max(max, m.version), 0);
