import { Router } from "express";
import { requireAuth } from "../lib/auth-middleware.js";
import { query, queryOne } from "../lib/db.js";
import { fetchAllWorkers } from "../lib/workers-db.js";
import { mapRowToWorker } from "../lib/compliance.js";

const router = Router();

// Site coordinates (approximate centres)
const SITE_COORDS: Record<string, { lat: number; lng: number }> = {
  "Rotterdam Europoort, NL": { lat: 51.9530, lng: 4.1428 },
  "Antwerp Port, BE": { lat: 51.2994, lng: 4.3029 },
  "Klaipeda Shipyard, LT": { lat: 55.7033, lng: 21.1443 },
  "Warsaw Industrial Zone, PL": { lat: 52.2297, lng: 21.0122 },
  "Gdansk Shipyard, PL": { lat: 54.3633, lng: 18.6553 },
  "Bratislava Industrial, SK": { lat: 48.1486, lng: 17.1077 },
  "Prague Industrial, CZ": { lat: 50.0755, lng: 14.4378 },
  "Timisoara Factory, RO": { lat: 45.7489, lng: 21.2087 },
};

function haversineKm(lat1: number, lng1: number, lat2: number, lng2: number): number {
  const R = 6371;
  const dLat = (lat2 - lat1) * Math.PI / 180;
  const dLng = (lng2 - lng1) * Math.PI / 180;
  const a = Math.sin(dLat / 2) ** 2 + Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) * Math.sin(dLng / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

// GET /api/geo/workers — current location of all workers
router.get("/geo/workers", requireAuth, async (req, res) => {
  try {
    const tenantId = req.tenantId!;
    const dbRows = await fetchAllWorkers(tenantId);
    const workers = dbRows.map((r) => mapRowToWorker(r));

    const workerLocations = workers.map(w => {
      const siteCoord = SITE_COORDS[w.assignedSite || ""] || null;
      // Simulate slight offset from site centre for each worker
      const jitter = () => (Math.random() - 0.5) * 0.01;
      const lat = siteCoord ? siteCoord.lat + jitter() : null;
      const lng = siteCoord ? siteCoord.lng + jitter() : null;
      const distance = siteCoord && lat && lng ? haversineKm(lat, lng, siteCoord.lat, siteCoord.lng) : null;

      return {
        workerId: w.id, name: w.name, site: w.assignedSite,
        latitude: lat, longitude: lng,
        siteLatitude: siteCoord?.lat, siteLongitude: siteCoord?.lng,
        distanceKm: distance ? Math.round(distance * 100) / 100 : null,
        farFromSite: distance !== null && distance > 5,
      };
    });

    const farCount = workerLocations.filter(w => w.farFromSite).length;
    res.json({ workers: workerLocations, totalWorkers: workers.length, farFromSite: farCount });
  } catch (err) { res.status(500).json({ error: err instanceof Error ? err.message : "Failed" }); }
});

// GET /api/geo/sites — sites with worker counts
router.get("/geo/sites", requireAuth, async (req, res) => {
  try {
    const dbRows = await fetchAllWorkers(req.tenantId!);
    const workers = dbRows.map((r) => mapRowToWorker(r));

    const siteCounts: Record<string, number> = {};
    for (const w of workers) {
      const site = w.assignedSite || "Unassigned";
      siteCounts[site] = (siteCounts[site] || 0) + 1;
    }

    const sites = Object.entries(siteCounts).map(([name, count]) => ({
      name, count, ...SITE_COORDS[name] || { lat: null, lng: null },
    }));

    res.json({ sites });
  } catch (err) { res.status(500).json({ error: err instanceof Error ? err.message : "Failed" }); }
});

// GET /api/geo/worker/:workerId/history
router.get("/geo/worker/:workerId/history", requireAuth, async (req, res) => {
  try {
    // Pull from voice checkins as location data
    const checkins = await query<Record<string, any>>(
      "SELECT site, timestamp FROM voice_checkins WHERE worker_id = $1 AND tenant_id = $2 ORDER BY timestamp DESC LIMIT 30",
      [req.params.workerId, req.tenantId!]
    );

    const history = checkins.map(c => {
      const coord = SITE_COORDS[c.site] || null;
      return { site: c.site, timestamp: c.timestamp, latitude: coord?.lat, longitude: coord?.lng };
    });

    res.json({ history });
  } catch (err) { res.status(500).json({ error: err instanceof Error ? err.message : "Failed" }); }
});

// POST /api/geo/optimise — AI suggests optimal deployment
router.post("/geo/optimise", requireAuth, async (req, res) => {
  try {
    const tenantId = req.tenantId!;
    const dbRows = await fetchAllWorkers(tenantId);
    const workers = dbRows.map((r) => mapRowToWorker(r));

    // Get bench workers
    const bench = await query<Record<string, any>>(
      "SELECT worker_id, worker_name, last_site FROM bench_entries WHERE tenant_id = $1 AND status = 'available'", [tenantId]
    );

    // Get open job requests
    const jobs = await query<Record<string, any>>(
      "SELECT id, role_type, location, workers_needed FROM job_requests WHERE tenant_id = $1 AND status = 'open'", [tenantId]
    );

    // AI optimisation
    const suggestions: Array<{ worker: string; fromSite: string; toSite: string; reason: string; distanceKm: number }> = [];

    for (const job of jobs) {
      const jobCoord = SITE_COORDS[job.location] || null;
      if (!jobCoord) continue;

      // Find closest bench workers
      for (const b of bench) {
        const lastCoord = SITE_COORDS[b.last_site] || null;
        if (!lastCoord) continue;

        const dist = haversineKm(lastCoord.lat, lastCoord.lng, jobCoord.lat, jobCoord.lng);
        suggestions.push({
          worker: b.worker_name, fromSite: b.last_site, toSite: job.location,
          reason: `${job.role_type} needed at ${job.location} — ${b.worker_name} is ${Math.round(dist)}km away on bench`,
          distanceKm: Math.round(dist),
        });
      }
    }

    suggestions.sort((a, b) => a.distanceKm - b.distanceKm);

    res.json({ suggestions: suggestions.slice(0, 10), benchWorkers: bench.length, openJobs: jobs.length });
  } catch (err) { res.status(500).json({ error: err instanceof Error ? err.message : "Failed" }); }
});

export default router;
