/**
 * Multi-tier cache: Upstash Redis (if UPSTASH_REDIS_URL set) → in-memory fallback.
 * For SaaS: Redis gives cross-machine consistency.
 * For single-machine: in-memory is fast and free.
 */

interface CacheEntry<T> {
  data: T;
  expiresAt: number;
}

// ─── In-Memory Store ───────────────────────────────────────────────────────
const store = new Map<string, CacheEntry<unknown>>();
const DEFAULT_TTL_MS = 30_000;
const MAX_ENTRIES = 1000;

// ─── Redis (optional, for multi-machine SaaS) ──────────────────────────────
let redis: {
  get: (key: string) => Promise<string | null>;
  set: (key: string, value: string, opts?: { ex?: number }) => Promise<void>;
  del: (key: string) => Promise<void>;
  keys: (pattern: string) => Promise<string[]>;
} | null = null;

const REDIS_URL = process.env.UPSTASH_REDIS_URL;
const REDIS_TOKEN = process.env.UPSTASH_REDIS_TOKEN;

if (REDIS_URL && REDIS_TOKEN) {
  // Lazy-init Upstash REST client (no dependencies needed)
  const baseUrl = REDIS_URL.replace(/\/$/, "");
  const headers = { Authorization: `Bearer ${REDIS_TOKEN}`, "Content-Type": "application/json" };

  redis = {
    async get(key: string) {
      const res = await fetch(`${baseUrl}/get/${encodeURIComponent(key)}`, { headers });
      const json = await res.json() as { result: string | null };
      return json.result;
    },
    async set(key: string, value: string, opts?: { ex?: number }) {
      const args = opts?.ex ? `/${encodeURIComponent(key)}/${encodeURIComponent(value)}/EX/${opts.ex}` : `/${encodeURIComponent(key)}/${encodeURIComponent(value)}`;
      await fetch(`${baseUrl}/set${args}`, { headers });
    },
    async del(key: string) {
      await fetch(`${baseUrl}/del/${encodeURIComponent(key)}`, { headers });
    },
    async keys(pattern: string) {
      const res = await fetch(`${baseUrl}/keys/${encodeURIComponent(pattern)}`, { headers });
      const json = await res.json() as { result: string[] };
      return json.result ?? [];
    },
  };
  console.log("[cache] Upstash Redis connected");
} else {
  console.log("[cache] Using in-memory cache (set UPSTASH_REDIS_URL + UPSTASH_REDIS_TOKEN for Redis)");
}

// ─── Public API (same interface regardless of backend) ──────────────────────

export function cacheGet<T>(key: string): T | undefined {
  // In-memory only (sync path for hot reads)
  const entry = store.get(key);
  if (!entry) return undefined;
  if (Date.now() > entry.expiresAt) {
    store.delete(key);
    return undefined;
  }
  return entry.data as T;
}

export function cacheSet<T>(key: string, data: T, ttlMs = DEFAULT_TTL_MS): void {
  if (store.size >= MAX_ENTRIES) {
    const firstKey = store.keys().next().value;
    if (firstKey) store.delete(firstKey);
  }
  store.set(key, { data, expiresAt: Date.now() + ttlMs });

  // Write-through to Redis (non-blocking)
  if (redis) {
    redis.set(`apatris:${key}`, JSON.stringify(data), { ex: Math.ceil(ttlMs / 1000) }).catch(() => {});
  }
}

export function cacheInvalidate(pattern: string): void {
  for (const key of store.keys()) {
    if (key.includes(pattern)) store.delete(key);
  }

  // Invalidate in Redis (non-blocking)
  if (redis) {
    redis.keys(`apatris:*${pattern}*`).then(keys => {
      for (const k of keys) redis!.del(k).catch(() => {});
    }).catch(() => {});
  }
}

export function cacheClear(): void {
  store.clear();
}

/**
 * Cache-through helper for async functions.
 * Checks in-memory first, then Redis, then calls fn().
 */
export async function cached<T>(key: string, fn: () => Promise<T>, ttlMs = DEFAULT_TTL_MS): Promise<T> {
  // L1: in-memory
  const memHit = cacheGet<T>(key);
  if (memHit !== undefined) return memHit;

  // L2: Redis
  if (redis) {
    try {
      const redisVal = await redis.get(`apatris:${key}`);
      if (redisVal) {
        const parsed = JSON.parse(redisVal) as T;
        cacheSet(key, parsed, ttlMs); // warm L1
        return parsed;
      }
    } catch { /* Redis miss or error — fall through */ }
  }

  // L3: source
  const data = await fn();
  cacheSet(key, data, ttlMs);
  return data;
}
