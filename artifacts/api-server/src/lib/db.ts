import pkg from "pg";
const { Pool } = pkg;

// Detect if SSL should be used — Replit's built-in PostgreSQL uses sslmode=disable
const dbUrl = process.env["NEON_DATABASE_URL"] ?? process.env["DATABASE_URL"] ?? "";
if (!dbUrl && process.env.NODE_ENV === "production") {
  console.error("[FATAL] Neither NEON_DATABASE_URL nor DATABASE_URL is set in production. Database operations will fail.");
}
const useSSL = dbUrl.includes("sslmode=disable") || dbUrl.includes("sslmode=prefer")
  ? false
  : process.env["NODE_ENV"] === "production"
    ? { rejectUnauthorized: false }
    : false;

export const pool = new Pool({
  connectionString: dbUrl || undefined,
  ssl: useSSL,
  max: 20,                      // Scale for multi-tenant SaaS
  min: 2,                       // Keep 2 warm connections
  idleTimeoutMillis: 30_000,
  connectionTimeoutMillis: 5_000,
  allowExitOnIdle: false,       // Keep pool alive
});

pool.on("error", (err) => {
  console.error("[DB] Unexpected pool client error:", err.message);
});

export async function query<T = Record<string, unknown>>(
  sql: string,
  params?: unknown[]
): Promise<T[]> {
  const client = await pool.connect();
  try {
    const result = await client.query(sql, params);
    return result.rows as T[];
  } finally {
    client.release();
  }
}

export async function queryOne<T = Record<string, unknown>>(
  sql: string,
  params?: unknown[]
): Promise<T | null> {
  const rows = await query<T>(sql, params);
  return rows[0] ?? null;
}

export async function execute(sql: string, params?: unknown[]): Promise<void> {
  await query(sql, params);
}
