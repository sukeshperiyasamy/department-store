/**
 * Low-level SQLite driver interface.
 *
 * Production uses the Tauri SQL plugin (tauri-driver.ts). Tests and offline
 * tooling use better-sqlite3 (node-driver.ts) so persistence guarantees — atomic
 * sale+outbox writes, crash recovery, restart durability — are verified against a
 * real SQLite engine, not a mock.
 */
export interface SqliteDriver {
  exec(sql: string, params?: readonly unknown[]): Promise<void>;
  select<T = Record<string, unknown>>(sql: string, params?: readonly unknown[]): Promise<T[]>;
  /** Runs fn inside BEGIN IMMEDIATE … COMMIT; rolls back on throw. */
  transaction<T>(fn: () => Promise<T>): Promise<T>;
  close(): Promise<void>;
}
