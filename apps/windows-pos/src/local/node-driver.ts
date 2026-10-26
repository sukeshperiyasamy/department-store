/**
 * better-sqlite3 driver — used by tests and CLI tooling to verify persistence
 * guarantees against a real SQLite engine (not available inside the Tauri webview).
 */
import BetterSqlite3 from "better-sqlite3";
import type { SqliteDriver } from "./driver";

export class NodeSqliteDriver implements SqliteDriver {
  private db: BetterSqlite3.Database;

  constructor(filename: string) {
    this.db = new BetterSqlite3(filename);
    this.db.pragma("journal_mode = WAL");
    this.db.pragma("foreign_keys = ON");
  }

  async exec(sql: string, params: readonly unknown[] = []): Promise<void> {
    this.db.prepare(sql).run(...params);
  }

  async select<T>(sql: string, params: readonly unknown[] = []): Promise<T[]> {
    return this.db.prepare(sql).all(...params) as T[];
  }

  async transaction<T>(fn: () => Promise<T>): Promise<T> {
    // BEGIN IMMEDIATE takes the write lock upfront, matching the Tauri driver.
    this.db.exec("BEGIN IMMEDIATE");
    try {
      const result = await fn();
      this.db.exec("COMMIT");
      return result;
    } catch (error) {
      this.db.exec("ROLLBACK");
      throw error;
    }
  }

  async close(): Promise<void> {
    this.db.close();
  }
}
