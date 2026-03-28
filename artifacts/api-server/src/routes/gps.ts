import { Router } from "express";
import { requireAuth, requireRole } from "../lib/auth-middleware.js";
import { query, queryOne, execute } from "../lib/db.js";
import { getWorkerConsents } from "../lib/gdpr.js";
import { validateBody, GpsCheckinSchema, GpsCheckoutSchema } from "../lib/validate.js";

const router = Router();

// Haversine formula: distance between two GPS points in meters
function haversineMeters(lat1: number, lng1: number, lat2: number, lng2: number): number {
  const R = 6371000; // Earth radius in meters
  const dLat = (lat2 - lat1) * Math.PI / 180;
  const dLng = (lng2 - lng1) * Math.PI / 180;
  const a = Math.sin(dLat / 2) ** 2 + Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) * Math.sin(dLng / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

// ═══ SITE GEOFENCES ════════════════════════════════════════════════════════

// GET /api/geofences — list all site geofences
router.get("/geofences", requireAuth, async (req, res) => {
  try {
    const rows = await query(
      "SELECT * FROM site_geofences WHERE tenant_id = $1 ORDER BY site_name",
      [req.tenantId!]
    );
    res.json({ geofences: rows });
  } catch (err) {
    res.status(500).json({ error: err instanceof Error ? err.message : "Failed to fetch geofences" });
  }
});

// POST /api/geofences — create a geofence
router.post("/geofences", requireAuth, requireRole("Admin", "Executive", "TechOps"), async (req, res) => {
  try {
    const { siteName, latitude, longitude, radiusMeters, address } = req.body as {
      siteName?: string; latitude?: number; longitude?: number; radiusMeters?: number; address?: string;
    };
    if (!siteName || latitude === undefined || longitude === undefined) {
      return res.status(400).json({ error: "siteName, latitude, longitude are required" });
    }
    const row = await queryOne(
      `INSERT INTO site_geofences (tenant_id, site_name, latitude, longitude, radius_meters, address)
       VALUES ($1,$2,$3,$4,$5,$6) RETURNING *`,
      [req.tenantId!, siteName, latitude, longitude, radiusMeters ?? 200, address ?? null]
    );
    res.status(201).json({ geofence: row });
  } catch (err) {
    res.status(500).json({ error: err instanceof Error ? err.message : "Failed to create geofence" });
  }
});

// PATCH /api/geofences/:id
router.patch("/geofences/:id", requireAuth, requireRole("Admin", "Executive", "TechOps"), async (req, res) => {
  try {
    const body = req.body as Record<string, unknown>;
    const fieldMap: Record<string, string> = {
      siteName: "site_name", latitude: "latitude", longitude: "longitude",
      radiusMeters: "radius_meters", address: "address", isActive: "is_active",
    };
    const sets: string[] = [];
    const vals: unknown[] = [];
    let idx = 1;
    for (const [key, col] of Object.entries(fieldMap)) {
      if (body[key] !== undefined) { sets.push(`${col} = $${idx++}`); vals.push(body[key]); }
    }
    if (sets.length === 0) return res.status(400).json({ error: "No fields to update" });
    sets.push("updated_at = NOW()");
    vals.push(req.params.id, req.tenantId!);
    const row = await queryOne(
      `UPDATE site_geofences SET ${sets.join(", ")} WHERE id = $${idx} AND tenant_id = $${idx + 1} RETURNING *`,
      vals
    );
    if (!row) return res.status(404).json({ error: "Geofence not found" });
    res.json({ geofence: row });
  } catch (err) {
    res.status(500).json({ error: err instanceof Error ? err.message : "Update failed" });
  }
});

// ═══ CHECK-IN / CHECK-OUT ══════════════════════════════════════════════════

// POST /api/gps/checkin — worker checks in (auto-detects site from GPS)
router.post("/gps/checkin", requireAuth, validateBody(GpsCheckinSchema), async (req, res) => {
  try {
    const { workerId, workerName, latitude, longitude } = req.body as {
      workerId?: string; workerName?: string; latitude?: number; longitude?: number;
    };
    if (!workerId || !workerName || latitude === undefined || longitude === undefined) {
      return res.status(400).json({ error: "workerId, workerName, latitude, longitude are required" });
    }

    // Find matching geofence
    const geofences = await query<{
      id: string; site_name: string; latitude: number; longitude: number; radius_meters: number;
    }>(
      "SELECT * FROM site_geofences WHERE tenant_id = $1 AND is_active = TRUE",
      [req.tenantId!]
    );

    let matchedGeofence: typeof geofences[0] | null = null;
    let closestDistance = Infinity;

    for (const gf of geofences) {
      const dist = haversineMeters(latitude, longitude, gf.latitude, gf.longitude);
      if (dist < gf.radius_meters && dist < closestDistance) {
        matchedGeofence = gf;
        closestDistance = dist;
      }
    }

    // Check for existing open check-in
    const openCheckin = await queryOne(
      "SELECT id, site_name FROM gps_checkins WHERE worker_id = $1 AND tenant_id = $2 AND check_out_at IS NULL",
      [workerId, req.tenantId!]
    );
    if (openCheckin) {
      return res.status(409).json({ error: `Already checked in at ${(openCheckin as any).site_name}. Check out first.` });
    }

    // Verify GPS tracking consent (GDPR)
    const consents = await getWorkerConsents(workerId, req.tenantId!);
    const gpsConsent = consents.find(c => c.consentType === "gps_tracking" && c.granted && !c.revokedAt);
    if (!gpsConsent) {
      return res.status(403).json({
        error: "GPS tracking consent required. Worker must grant 'gps_tracking' consent before check-in.",
        consentRequired: "gps_tracking",
      });
    }

    const siteName = matchedGeofence?.site_name ?? "Unknown Site";
    const isAnomaly = !matchedGeofence;
    const anomalyReason = isAnomaly ? `GPS location (${latitude}, ${longitude}) not within any registered geofence` : null;

    const row = await queryOne(
      `INSERT INTO gps_checkins (tenant_id, worker_id, worker_name, site_geofence_id, site_name, check_in_lat, check_in_lng, is_anomaly, anomaly_reason)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9) RETURNING *`,
      [req.tenantId!, workerId, workerName, matchedGeofence?.id ?? null, siteName, latitude, longitude, isAnomaly, anomalyReason]
    );

    res.status(201).json({
      checkin: row,
      matchedSite: matchedGeofence ? { id: matchedGeofence.id, name: matchedGeofence.site_name, distance: Math.round(closestDistance) } : null,
      isAnomaly,
    });
  } catch (err) {
    res.status(500).json({ error: err instanceof Error ? err.message : "Check-in failed" });
  }
});

// POST /api/gps/checkout — worker checks out
router.post("/gps/checkout", requireAuth, validateBody(GpsCheckoutSchema), async (req, res) => {
  try {
    const { workerId, latitude, longitude } = req.body as {
      workerId?: string; latitude?: number; longitude?: number;
    };
    if (!workerId || latitude === undefined || longitude === undefined) {
      return res.status(400).json({ error: "workerId, latitude, longitude are required" });
    }

    const openCheckin = await queryOne<{ id: string; check_in_at: string; site_name: string; site_geofence_id: string | null }>(
      "SELECT id, check_in_at, site_name, site_geofence_id FROM gps_checkins WHERE worker_id = $1 AND tenant_id = $2 AND check_out_at IS NULL",
      [workerId, req.tenantId!]
    );
    if (!openCheckin) {
      return res.status(404).json({ error: "No open check-in found for this worker" });
    }

    const checkInTime = new Date(openCheckin.check_in_at);
    const durationMinutes = Math.round((Date.now() - checkInTime.getTime()) / 60000);

    // Check if checkout location is anomalous (far from check-in site)
    let isAnomaly = false;
    let anomalyReason: string | null = null;
    if (openCheckin.site_geofence_id) {
      const gf = await queryOne<{ latitude: number; longitude: number; radius_meters: number }>(
        "SELECT latitude, longitude, radius_meters FROM site_geofences WHERE id = $1",
        [openCheckin.site_geofence_id]
      );
      if (gf) {
        const dist = haversineMeters(latitude, longitude, gf.latitude, gf.longitude);
        if (dist > gf.radius_meters * 3) { // 3x radius tolerance for checkout
          isAnomaly = true;
          anomalyReason = `Checkout location ${Math.round(dist)}m from site (expected within ${gf.radius_meters * 3}m)`;
        }
      }
    }

    const row = await queryOne(
      `UPDATE gps_checkins SET check_out_lat = $1, check_out_lng = $2, check_out_at = NOW(), duration_minutes = $3,
       is_anomaly = CASE WHEN is_anomaly THEN TRUE ELSE $4 END,
       anomaly_reason = CASE WHEN anomaly_reason IS NOT NULL THEN anomaly_reason ELSE $5 END
       WHERE id = $6 RETURNING *`,
      [latitude, longitude, durationMinutes, isAnomaly, anomalyReason, openCheckin.id]
    );

    res.json({ checkout: row, durationMinutes });
  } catch (err) {
    res.status(500).json({ error: err instanceof Error ? err.message : "Check-out failed" });
  }
});

// GET /api/gps/active — who is currently on site
router.get("/gps/active", requireAuth, async (req, res) => {
  try {
    const rows = await query(
      `SELECT g.*, sg.latitude as site_lat, sg.longitude as site_lng
       FROM gps_checkins g LEFT JOIN site_geofences sg ON g.site_geofence_id = sg.id
       WHERE g.tenant_id = $1 AND g.check_out_at IS NULL ORDER BY g.check_in_at DESC`,
      [req.tenantId!]
    );
    res.json({ active: rows, count: rows.length });
  } catch (err) {
    res.status(500).json({ error: err instanceof Error ? err.message : "Failed to fetch active check-ins" });
  }
});

// GET /api/gps/history — check-in history
router.get("/gps/history", requireAuth, async (req, res) => {
  try {
    const { workerId, siteName, date } = req.query as Record<string, string>;
    let sql = "SELECT * FROM gps_checkins WHERE tenant_id = $1";
    const params: unknown[] = [req.tenantId!];
    if (workerId) { params.push(workerId); sql += ` AND worker_id = $${params.length}`; }
    if (siteName) { params.push(`%${siteName}%`); sql += ` AND site_name ILIKE $${params.length}`; }
    if (date) { params.push(date); sql += ` AND check_in_at::date = $${params.length}::date`; }
    sql += " ORDER BY check_in_at DESC LIMIT 200";
    const rows = await query(sql, params);
    res.json({ checkins: rows, count: rows.length });
  } catch (err) {
    res.status(500).json({ error: err instanceof Error ? err.message : "Failed to fetch history" });
  }
});

// GET /api/gps/anomalies — flagged anomalous check-ins
router.get("/gps/anomalies", requireAuth, requireRole("Admin", "Executive", "TechOps"), async (req, res) => {
  try {
    const rows = await query(
      "SELECT * FROM gps_checkins WHERE tenant_id = $1 AND is_anomaly = TRUE ORDER BY created_at DESC LIMIT 100",
      [req.tenantId!]
    );
    res.json({ anomalies: rows, count: rows.length });
  } catch (err) {
    res.status(500).json({ error: err instanceof Error ? err.message : "Failed to fetch anomalies" });
  }
});

export default router;
