/**
 * Shared API utilities for the Apatris dashboard.
 * Centralises auth headers, list extraction, snake→camel conversion,
 * and safe JSON parsing so every page uses the same patterns.
 */

// ── Auth headers ────────────────────────────────────────────────────────────
export function authHeaders(): Record<string, string> {
  const token = localStorage.getItem("apatris_jwt");
  return token
    ? { Authorization: `Bearer ${token}`, "Content-Type": "application/json" }
    : { "Content-Type": "application/json" };
}

export const BASE = import.meta.env.BASE_URL;

// ── Extract array from any API response shape ───────────────────────────────
// Handles: raw array, { key: [...] }, nested wrapper, or error shape
export function extractList<T = Record<string, unknown>>(
  json: unknown,
  ...keys: string[]
): T[] {
  if (Array.isArray(json)) return json as T[];
  if (json && typeof json === "object") {
    const obj = json as Record<string, unknown>;
    // Try explicit keys first
    for (const k of keys) {
      if (Array.isArray(obj[k])) return obj[k] as T[];
    }
    // Try common wrapper keys
    for (const k of ["data", "items", "rows", "results", "list"]) {
      if (Array.isArray(obj[k])) return obj[k] as T[];
    }
    // Try the first array-valued property
    for (const v of Object.values(obj)) {
      if (Array.isArray(v)) return v as T[];
    }
  }
  return [];
}

// ── Snake_case → camelCase conversion ───────────────────────────────────────
const CAMEL_CACHE = new Map<string, string>();

function snakeToCamel(s: string): string {
  let c = CAMEL_CACHE.get(s);
  if (c !== undefined) return c;
  c = s.replace(/_([a-z])/g, (_, ch) => ch.toUpperCase());
  CAMEL_CACHE.set(s, c);
  return c;
}

/** Convert all snake_case keys in an object to camelCase (shallow). */
export function camelizeKeys<T = Record<string, unknown>>(
  row: Record<string, unknown>,
): T {
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(row)) {
    out[snakeToCamel(k)] = v;
  }
  return out as T;
}

/** Convert all camelCase keys to snake_case (shallow). */
export function snakeizeKeys(obj: Record<string, unknown>): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(obj)) {
    const sk = k.replace(/[A-Z]/g, (ch) => `_${ch.toLowerCase()}`);
    out[sk] = v;
  }
  return out;
}

// ── Fetch + extract list in one call ────────────────────────────────────────
export async function fetchList<T = Record<string, unknown>>(
  url: string,
  ...keys: string[]
): Promise<T[]> {
  const res = await fetch(`${BASE}${url}`, { headers: authHeaders() });
  if (!res.ok) return [];
  const json = await res.json();
  return extractList<T>(json, ...keys);
}

// ── Safe JSON field parsing ─────────────────────────────────────────────────
export function safeParseArray(val: unknown): unknown[] {
  if (Array.isArray(val)) return val;
  if (typeof val === "string") {
    try {
      const parsed = JSON.parse(val);
      return Array.isArray(parsed) ? parsed : [];
    } catch {
      return [];
    }
  }
  return [];
}

export function safeParseObject(val: unknown): Record<string, unknown> | null {
  if (val && typeof val === "object" && !Array.isArray(val)) return val as Record<string, unknown>;
  if (typeof val === "string") {
    try {
      const parsed = JSON.parse(val);
      return parsed && typeof parsed === "object" && !Array.isArray(parsed) ? parsed : null;
    } catch {
      return null;
    }
  }
  return null;
}

// ── Safe date formatting ────────────────────────────────────────────────────
export function formatDate(val: unknown, locale = "en-GB"): string {
  if (!val) return "—";
  const d = new Date(val as string);
  return isNaN(d.getTime()) ? "—" : d.toLocaleDateString(locale);
}
