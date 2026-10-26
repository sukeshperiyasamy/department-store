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

  private async getDb(): Promise<PluginDatabase> {
    const existing = this.db;
    if (!existing) {
      const mod = await import("@tauri-apps/plugin-sql");
      const loaded = await mod.default.load("sqlite:pos.db");
      this.db = loaded;
      return loaded;
    }
    return existing;
  }

  async exec(sql: string, params: readonly unknown[] = []): Promise<{ changes: number }> {
    const db = await this.getDb();
    const result: QueryResult = await db.execute(sql, [...params]);
    return { changes: result.rowsAffected };
  }

  async select<T>(sql: string, params: readonly unknown[] = []): Promise<T[]> {
    const db = await this.getDb();
    return db.select<T[]>(sql, [...params]);
  }

  async transaction<T>(fn: () => Promise<T>): Promise<T> {
    if (this.depth === 0) {
      await this.exec("BEGIN IMMEDIATE");
      this.depth = 1;
      try {
        const result = await fn();
        await this.exec("COMMIT");
        return result;
      } catch (error) {
        await this.exec("ROLLBACK");
        throw error;
      } finally {
        this.depth = 0;
      }
    }
    const savepoint = `sp_${this.depth}`;
    this.depth += 1;
    await this.exec(`SAVEPOINT ${savepoint}`);
    try {
      const result = await fn();
      await this.exec(`RELEASE ${savepoint}`);
      return result;
    } catch (error) {
      await this.exec(`ROLLBACK TO ${savepoint}`);
      await this.exec(`RELEASE ${savepoint}`);
      throw error;
    } finally {
      this.depth -= 1;
    }
  }

  async close(): Promise<void> {
    if (this.db) {
      await this.db.close();
      this.db = null;
    }
  }
}
