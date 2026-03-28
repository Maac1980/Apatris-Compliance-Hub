import pkg from "pg";
const { Pool } = pkg;

// Detect if SSL should be used — Replit's built-in PostgreSQL uses sslmode=disable
const dbUrl = process.env["DATABASE_URL"] ?? "";
const useSSL = dbUrl.includes("sslmode=disable") || dbUrl.includes("sslmode=prefer")
  ? false
  : process.env["NODE_ENV"] === "production"
    ? { rejectUnauthorized: false }
    : false;

export const pool = new Pool({
  connectionString: dbUrl || undefined,
  ssl: useSSL,
  max: 10,
  idleTimeoutMillis: 30_000,
  connectionTimeoutMillis: 5_000,
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
