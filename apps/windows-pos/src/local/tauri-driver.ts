/**
 * Tauri SQL plugin driver — production driver inside the desktop shell.
 * Nested transactions use SAVEPOINTs, matching the Node test driver.
 */
import type { QueryResult } from "@tauri-apps/plugin-sql";
import type { SqliteDriver } from "./driver";

type PluginDatabase = InstanceType<(typeof import("@tauri-apps/plugin-sql"))["default"]>;

export class TauriSqliteDriver implements SqliteDriver {
  private db: PluginDatabase | null = null;
  private depth = 0;
  /** Serializes ALL operations: the sync engine loop and UI actions share this
   * driver, and sqlite contention (code 5, database is locked) is a real
   * failure mode when writes interleave (QA-WIN-002). Statements issued from
   * inside transactionInner bypass the queue (re-entrant) to avoid deadlock. */
  private queue: Promise<unknown> = Promise.resolve();
  private bypassQueue = false;

  private enqueue<T>(fn: () => Promise<T>): Promise<T> {
    if (this.bypassQueue) return fn();
    const next = this.queue.then(fn, fn);
    this.queue = next.catch(() => undefined);
    return next;
  }

  private async getDb(): Promise<PluginDatabase> {
    const existing = this.db;
    if (!existing) {
      const mod = await import("@tauri-apps/plugin-sql");
      const loaded = await mod.default.load("sqlite:pos.db");
      // Durability + contention settings; WAL allows readers during our writes.
      await loaded.execute("PRAGMA journal_mode = WAL").catch(() => undefined);
      await loaded.execute("PRAGMA busy_timeout = 5000").catch(() => undefined);
      await loaded.execute("PRAGMA foreign_keys = ON").catch(() => undefined);
      this.db = loaded;
      return loaded;
    }
    return existing;
  }

  async exec(sql: string, params: readonly unknown[] = []): Promise<{ changes: number }> {
    return this.enqueue(async () => {
      const db = await this.getDb();
      const result: QueryResult = await db.execute(sql, [...params]);
      return { changes: result.rowsAffected };
    });
  }

  async select<T>(sql: string, params: readonly unknown[] = []): Promise<T[]> {
    return this.enqueue(async () => {
      const db = await this.getDb();
      return db.select<T[]>(sql, [...params]);
    });
  }

  async transaction<T>(fn: () => Promise<T>): Promise<T> {
    return this.enqueue(() => this.transactionInner(fn));
  }

  private async transactionInner<T>(fn: () => Promise<T>): Promise<T> {
    const wasBypass = this.bypassQueue;
    this.bypassQueue = true;
    try {
      return await this.transactionInnerUnlocked(fn);
    } finally {
      this.bypassQueue = wasBypass;
    }
  }

  private async transactionInnerUnlocked<T>(fn: () => Promise<T>): Promise<T> {
    if (this.depth === 0) {
      await this.execDirect("BEGIN IMMEDIATE");
      this.depth = 1;
      try {
        const result = await fn();
        await this.execDirect("COMMIT");
        return result;
      } catch (error) {
        await this.execDirect("ROLLBACK");
        throw error;
      } finally {
        this.depth = 0;
      }
    }
    const savepoint = `sp_${this.depth}`;
    this.depth += 1;
    await this.execDirect(`SAVEPOINT ${savepoint}`);
    try {
      const result = await fn();
      await this.execDirect(`RELEASE ${savepoint}`);
      return result;
    } catch (error) {
      await this.execDirect(`ROLLBACK TO ${savepoint}`);
      await this.execDirect(`RELEASE ${savepoint}`);
      throw error;
    } finally {
      this.depth -= 1;
    }
  }

  /** Raw execute without queueing (used inside the queue-held transaction). */
  private async execDirect(sql: string, params: readonly unknown[] = []): Promise<{ changes: number }> {
    const db = await this.getDb();
    const result: QueryResult = await db.execute(sql, [...params]);
    return { changes: result.rowsAffected };
  }

  async close(): Promise<void> {
    if (this.db) {
      await this.db.close();
      this.db = null;
    }
  }
}
