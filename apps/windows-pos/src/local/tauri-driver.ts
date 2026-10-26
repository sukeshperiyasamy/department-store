/**
 * Tauri SQL plugin driver — production driver inside the desktop shell.
 * Only importable when running under Tauri (dynamic import avoids bundling
 * issues in tests and in plain vite dev).
 */
import type { SqliteDriver } from "./driver";

interface TauriDb {
  execute(sql: string, params?: readonly unknown[]): Promise<{ rowsAffected: number }>;
  select<T>(sql: string, params?: readonly unknown[]): Promise<T[]>;
  close(): Promise<void>;
}

export class TauriSqliteDriver implements SqliteDriver {
  private db: TauriDb | null = null;
  private inTransaction = false;

  private async getDb(): Promise<TauriDb> {
    if (!this.db) {
      const { Database } = await import("@tauri-apps/plugin-sql");
      this.db = await Database.load("sqlite:pos.db");
    }
    return this.db;
  }

  async exec(sql: string, params: readonly unknown[] = []): Promise<void> {
    const db = await this.getDb();
    await db.execute(sql, params);
  }

  async select<T>(sql: string, params: readonly unknown[] = []): Promise<T[]> {
    const db = await this.getDb();
    return db.select<T>(sql, params);
  }

  async transaction<T>(fn: () => Promise<T>): Promise<T> {
    if (this.inTransaction) {
      // The plugin has no nested transaction support; assume single-threaded use.
      return fn();
    }
    await this.exec("BEGIN IMMEDIATE");
    this.inTransaction = true;
    try {
      const result = await fn();
      await this.exec("COMMIT");
      return result;
    } catch (error) {
      await this.exec("ROLLBACK");
      throw error;
    } finally {
      this.inTransaction = false;
    }
  }

  async close(): Promise<void> {
    if (this.db) {
      await this.db.close();
      this.db = null;
    }
  }
}
