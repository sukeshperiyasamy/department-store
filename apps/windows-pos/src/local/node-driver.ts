/**
 * better-sqlite3 driver — used by tests and CLI tooling to verify persistence
 * guarantees against a real SQLite engine (not available inside the Tauri webview).
 */
import BetterSqlite3 from "better-sqlite3";
import type { SqliteDriver } from "./driver";

export class NodeSqliteDriver implements SqliteDriver {
  private db: BetterSqlite3.Database;
  private depth = 0;

  constructor(filename: string) {
    this.db = new BetterSqlite3(filename);
    this.db.pragma("journal_mode = WAL");
    this.db.pragma("foreign_keys = ON");
  }

  async exec(sql: string, params: readonly unknown[] = []): Promise<{ changes: number }> {
    const info = this.db.prepare(sql).run(...params);
    return { changes: Number(info.changes) };
  }

  async select<T>(sql: string, params: readonly unknown[] = []): Promise<T[]> {
    return this.db.prepare(sql).all(...params) as T[];
  }

  async transaction<T>(fn: () => Promise<T>): Promise<T> {
    // Top-level: BEGIN IMMEDIATE takes the write lock upfront. Nested calls use
    // SAVEPOINTs, which SQLite requires (no nested BEGIN).
    if (this.depth === 0) {
      this.db.exec("BEGIN IMMEDIATE");
      this.depth = 1;
      try {
        const result = await fn();
        this.db.exec("COMMIT");
        return result;
      } catch (error) {
        this.db.exec("ROLLBACK");
        throw error;
      } finally {
        this.depth = 0;
      }
    }
    const savepoint = `sp_${this.depth}`;
    this.depth += 1;
    this.db.exec(`SAVEPOINT ${savepoint}`);
    try {
      const result = await fn();
      this.db.exec(`RELEASE ${savepoint}`);
      return result;
    } catch (error) {
      this.db.exec(`ROLLBACK TO ${savepoint}`);
      this.db.exec(`RELEASE ${savepoint}`);
      throw error;
    } finally {
      this.depth -= 1;
    }
  }

  async close(): Promise<void> {
    this.db.close();
  }
}
