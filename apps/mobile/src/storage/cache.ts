/**
 * Tenant-scoped read-only cache with offline & stale data detection.
 *
 * Rules:
 * - Scoped strictly by `${userId}:${tenantId}:${key}` to prevent cross-tenant data leakage.
 * - Tracks `cachedAt` timestamp and `isStale` flag.
 * - When switching tenants, `clearTenantCache(tenantId)` clears that tenant's cached data.
 * - When logging out, `clearAllUserCaches()` clears all cached operational records.
 */

interface CacheEnvelope<T> {
  data: T;
  cachedAt: string;
  expiresAt: number;
}

export interface CachedResult<T> {
  data: T | null;
  isStale: boolean;
  cachedAt: string | null;
}

class TenantCacheManager {
  private store = new Map<string, CacheEnvelope<unknown>>();

  private buildKey(userId: string, tenantId: string, subKey: string): string {
    return `${userId}:${tenantId}:${subKey}`;
  }

  set<T>(userId: string, tenantId: string, subKey: string, data: T, ttlMs = 15 * 60 * 1000): void {
    if (!userId || !tenantId || !subKey) return;
    const now = Date.now();
    const envelope: CacheEnvelope<T> = {
      data,
      cachedAt: new Date(now).toISOString(),
      expiresAt: now + ttlMs,
    };
    this.store.set(this.buildKey(userId, tenantId, subKey), envelope);
  }

  get<T>(userId: string, tenantId: string, subKey: string): CachedResult<T> {
    if (!userId || !tenantId || !subKey) {
      return { data: null, isStale: false, cachedAt: null };
    }
    const key = this.buildKey(userId, tenantId, subKey);
    const envelope = this.store.get(key) as CacheEnvelope<T> | undefined;
    if (!envelope) {
      return { data: null, isStale: false, cachedAt: null };
    }
    const isStale = Date.now() > envelope.expiresAt;
    return {
      data: envelope.data,
      isStale,
      cachedAt: envelope.cachedAt,
    };
  }

  clearTenant(userIdOrTenantId: string, tenantId?: string): void {
    const targetTenant = tenantId || userIdOrTenantId;
    const marker = `:${targetTenant}:`;
    for (const key of Array.from(this.store.keys())) {
      if (key.includes(marker)) {
        this.store.delete(key);
      }
    }
  }

  clearAll(): void {
    this.store.clear();
  }
}

export const tenantCache = new TenantCacheManager();
