/**
 * Simple in-memory cache with TTL.
 * For single-instance deployments (Fly.io with 1-2 machines).
 * Replace with Redis when scaling beyond 2 machines.
 */

interface CacheEntry<T> {
  data: T;
  expiresAt: number;
}

const store = new Map<string, CacheEntry<unknown>>();

const DEFAULT_TTL_MS = 30_000; // 30 seconds
const MAX_ENTRIES = 500;

export function cacheGet<T>(key: string): T | undefined {
  const entry = store.get(key);
  if (!entry) return undefined;
  if (Date.now() > entry.expiresAt) {
    store.delete(key);
    return undefined;
  }
  return entry.data as T;
}

export function cacheSet<T>(key: string, data: T, ttlMs = DEFAULT_TTL_MS): void {
  // Evict oldest entries if at capacity
  if (store.size >= MAX_ENTRIES) {
    const firstKey = store.keys().next().value;
    if (firstKey) store.delete(firstKey);
  }
  store.set(key, { data, expiresAt: Date.now() + ttlMs });
}

export function cacheInvalidate(pattern: string): void {
  for (const key of store.keys()) {
    if (key.includes(pattern)) store.delete(key);
  }
}

export function cacheClear(): void {
  store.clear();
}

/**
 * Cache-through helper for async functions.
 * Usage: const data = await cached("workers:tenant123", () => db.getWorkers(), 60_000);
 */
export async function cached<T>(key: string, fn: () => Promise<T>, ttlMs = DEFAULT_TTL_MS): Promise<T> {
  const hit = cacheGet<T>(key);
  if (hit !== undefined) return hit;
  const data = await fn();
  cacheSet(key, data, ttlMs);
  return data;
}
