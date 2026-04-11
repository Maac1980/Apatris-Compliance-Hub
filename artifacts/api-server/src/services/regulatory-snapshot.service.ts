/**
 * Regulatory Snapshot Service — Stage 8
 * Captures daily point-in-time metrics for trend analysis.
 */

import { query, queryOne, execute } from "../lib/db.js";

export async function createDailySnapshot(): Promise<any> {
  const today = new Date().toISOString().slice(0, 10);

  // Check if already snapped today
  const existing = await queryOne<any>("SELECT id FROM regulatory_snapshots WHERE snapshot_date = $1::date", [today]);
  if (existing) return existing;

  const total = Number((await queryOne<any>("SELECT COUNT(*)::int as c FROM regulatory_updates WHERE status != 'DUPLICATE'"))?.c ?? 0);
  const critical = Number((await queryOne<any>("SELECT COUNT(*)::int as c FROM regulatory_updates WHERE severity = 'CRITICAL' AND status != 'DUPLICATE'"))?.c ?? 0);
  const high = Number((await queryOne<any>("SELECT COUNT(*)::int as c FROM regulatory_updates WHERE severity = 'HIGH' AND status != 'DUPLICATE'"))?.c ?? 0);
  const medium = Number((await queryOne<any>("SELECT COUNT(*)::int as c FROM regulatory_updates WHERE severity = 'MEDIUM' AND status != 'DUPLICATE'"))?.c ?? 0);
  const low = Number((await queryOne<any>("SELECT COUNT(*)::int as c FROM regulatory_updates WHERE severity IN ('LOW','info') AND status != 'DUPLICATE'"))?.c ?? 0);
  const underReview = Number((await queryOne<any>("SELECT COUNT(*)::int as c FROM regulatory_updates WHERE status = 'UNDER_REVIEW'"))?.c ?? 0);
  const approved = Number((await queryOne<any>("SELECT COUNT(*)::int as c FROM regulatory_updates WHERE status = 'APPROVED_FOR_DEPLOYMENT'"))?.c ?? 0);
  const deployed = Number((await queryOne<any>("SELECT COUNT(*)::int as c FROM regulatory_updates WHERE status = 'DEPLOYED'"))?.c ?? 0);
  const avgConf = Number((await queryOne<any>("SELECT COALESCE(AVG(confidence_score),0)::numeric(5,2) as c FROM regulatory_updates WHERE confidence_score > 0"))?.c ?? 0);
  const reviewReq = Number((await queryOne<any>("SELECT COUNT(*)::int as c FROM regulatory_updates WHERE requires_human_review = true AND status NOT IN ('DUPLICATE','ARCHIVED','REJECTED')"))?.c ?? 0);

  const row = await queryOne<any>(
    `INSERT INTO regulatory_snapshots (snapshot_date, total_updates, critical_count, high_count, medium_count, low_count,
      under_review_count, approved_count, deployed_count, avg_confidence, review_required_count)
     VALUES ($1::date,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11) RETURNING *`,
    [today, total, critical, high, medium, low, underReview, approved, deployed, avgConf, reviewReq]
  );

  console.log(`[RegIntel][Snapshot] Daily snapshot: ${total} total, ${critical} critical, ${high} high`);
  return row;
}

export async function getSnapshots(days = 30): Promise<any[]> {
  return query("SELECT * FROM regulatory_snapshots ORDER BY snapshot_date DESC LIMIT $1", [days]);
}

export async function getLatestSnapshot(): Promise<any> {
  return queryOne("SELECT * FROM regulatory_snapshots ORDER BY snapshot_date DESC LIMIT 1");
}
