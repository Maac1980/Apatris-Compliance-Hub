import { query, execute } from "./db.js";

export interface ComplianceSnapshot {
  date: string;
  total: number;
  compliant: number;
  warning: number;
  critical: number;
  expired: number;
}

function mapRow(row: any): ComplianceSnapshot {
  return {
    date: row.snapshot_date ? new Date(row.snapshot_date).toISOString().split("T")[0] : "",
    total: Number(row.total ?? 0),
    compliant: Number(row.compliant ?? 0),
    warning: Number(row.warning ?? 0),
    critical: Number(row.critical ?? 0),
    expired: Number(row.expired ?? 0),
  };
}

export async function saveSnapshot(snap: ComplianceSnapshot): Promise<void> {
  // Delete existing snapshot for this date, then insert fresh
  await execute("DELETE FROM compliance_snapshots WHERE snapshot_date = $1", [snap.date]);
  await execute(
    `INSERT INTO compliance_snapshots (snapshot_date, total, compliant, warning, critical, expired)
     VALUES ($1, $2, $3, $4, $5, $6)`,
    [snap.date, snap.total, snap.compliant, snap.warning, snap.critical, snap.expired]
  );
}

export async function getSnapshots(days = 30): Promise<ComplianceSnapshot[]> {
  const rows = await query(
    "SELECT * FROM compliance_snapshots ORDER BY snapshot_date DESC LIMIT $1",
    [days]
  );
  // Reverse so oldest first (matches original behavior)
  return rows.map(mapRow).reverse();
}
