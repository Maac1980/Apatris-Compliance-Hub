import { Router } from "express";
import { requireAuth, requireRole } from "../lib/auth-middleware.js";
import { query, queryOne, execute } from "../lib/db.js";

const router = Router();

// ═══════ HOSTELS ═══════

router.get("/housing/hostels", requireAuth, async (req, res) => {
  try {
    const rows = await query(
      `SELECT h.*,
        (SELECT COUNT(*) FROM hostel_rooms r WHERE r.hostel_id = h.id) AS room_count,
        (SELECT COALESCE(SUM(r.current_occupancy), 0) FROM hostel_rooms r WHERE r.hostel_id = h.id) AS total_occupancy,
        (SELECT COALESCE(SUM(r.capacity), 0) FROM hostel_rooms r WHERE r.hostel_id = h.id) AS total_capacity
       FROM hostels h WHERE h.tenant_id = $1 ORDER BY h.name`, [req.tenantId!]);
    res.json({ hostels: rows });
  } catch (err) { res.status(500).json({ error: err instanceof Error ? err.message : "Failed" }); }
});

router.post("/housing/hostels", requireAuth, requireRole("Admin", "Executive", "TechOps"), async (req, res) => {
  try {
    const b = req.body as Record<string, any>;
    if (!b.name) return res.status(400).json({ error: "name required" });
    const row = await queryOne(
      `INSERT INTO hostels (tenant_id, name, address, city, country, type, total_rooms, cost_per_bed_monthly, owner_type)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9) RETURNING *`,
      [req.tenantId!, b.name, b.address ?? null, b.city ?? null, b.country || "PL", b.type || "hostel", b.totalRooms || 0, b.costPerBedMonthly || 0, b.ownerType || "owned"]);
    res.status(201).json({ hostel: row });
  } catch (err) { res.status(500).json({ error: err instanceof Error ? err.message : "Failed" }); }
});

// ═══════ ROOMS ═══════

router.get("/housing/rooms", requireAuth, async (req, res) => {
  try {
    const { hostelId } = req.query as Record<string, string>;
    let sql = "SELECT r.*, h.name AS hostel_name FROM hostel_rooms r LEFT JOIN hostels h ON h.id = r.hostel_id WHERE h.tenant_id = $1";
    const params: unknown[] = [req.tenantId!];
    if (hostelId) { params.push(hostelId); sql += ` AND r.hostel_id = $${params.length}`; }
    sql += " ORDER BY h.name, r.room_number";
    res.json({ rooms: await query(sql, params) });
  } catch (err) { res.status(500).json({ error: err instanceof Error ? err.message : "Failed" }); }
});

router.post("/housing/rooms", requireAuth, requireRole("Admin", "Executive", "TechOps"), async (req, res) => {
  try {
    const b = req.body as Record<string, any>;
    if (!b.hostelId || !b.roomNumber) return res.status(400).json({ error: "hostelId and roomNumber required" });
    const row = await queryOne(
      `INSERT INTO hostel_rooms (hostel_id, room_number, capacity) VALUES ($1,$2,$3) RETURNING *`,
      [b.hostelId, b.roomNumber, b.capacity || 4]);
    res.status(201).json({ room: row });
  } catch (err) { res.status(500).json({ error: err instanceof Error ? err.message : "Failed" }); }
});

// ═══════ ASSIGNMENTS ═══════

router.get("/housing/assignments", requireAuth, async (req, res) => {
  try {
    const rows = await query(
      `SELECT wh.*, h.name AS hostel_name, h.owner_type, hr.room_number
       FROM worker_housing wh
       LEFT JOIN hostels h ON h.id = wh.hostel_id
       LEFT JOIN hostel_rooms hr ON hr.id = wh.room_id
       WHERE wh.tenant_id = $1 ORDER BY wh.created_at DESC`, [req.tenantId!]);
    res.json({ assignments: rows });
  } catch (err) { res.status(500).json({ error: err instanceof Error ? err.message : "Failed" }); }
});

router.post("/housing/assignments", requireAuth, requireRole("Admin", "Executive", "TechOps"), async (req, res) => {
  try {
    const b = req.body as Record<string, any>;
    if (!b.workerId || !b.workerName || !b.hostelId || !b.roomId) return res.status(400).json({ error: "workerId, workerName, hostelId, roomId required" });

    // Get hostel cost
    const hostel = await queryOne<Record<string, any>>("SELECT cost_per_bed_monthly, owner_type FROM hostels WHERE id = $1", [b.hostelId]);
    const cost = hostel?.owner_type === "owned" ? 0 : Number(hostel?.cost_per_bed_monthly ?? 0);

    const row = await queryOne(
      `INSERT INTO worker_housing (tenant_id, worker_id, worker_name, hostel_id, room_id, cost_per_month, check_in_date)
       VALUES ($1,$2,$3,$4,$5,$6,$7) RETURNING *`,
      [req.tenantId!, b.workerId, b.workerName, b.hostelId, b.roomId, cost, b.checkInDate || new Date().toISOString().slice(0, 10)]);

    // Update room occupancy
    await execute("UPDATE hostel_rooms SET current_occupancy = current_occupancy + 1 WHERE id = $1", [b.roomId]);

    res.status(201).json({ assignment: row });
  } catch (err) { res.status(500).json({ error: err instanceof Error ? err.message : "Failed" }); }
});

router.patch("/housing/assignments/:id", requireAuth, requireRole("Admin", "Executive", "TechOps"), async (req, res) => {
  try {
    const b = req.body as Record<string, unknown>;
    if (b.status === "checked_out") {
      const assignment = await queryOne<Record<string, any>>("SELECT room_id FROM worker_housing WHERE id = $1", [req.params.id]);
      const row = await queryOne(
        "UPDATE worker_housing SET status = 'checked_out', check_out_date = CURRENT_DATE WHERE id = $1 AND tenant_id = $2 RETURNING *",
        [req.params.id, req.tenantId!]);
      if (assignment?.room_id) await execute("UPDATE hostel_rooms SET current_occupancy = GREATEST(0, current_occupancy - 1) WHERE id = $1", [assignment.room_id]);
      return res.json({ assignment: row });
    }
    const fieldMap: Record<string, string> = { roomId: "room_id", hostelId: "hostel_id", costPerMonth: "cost_per_month", status: "status" };
    const sets: string[] = []; const vals: unknown[] = []; let idx = 1;
    for (const [k, c] of Object.entries(fieldMap)) { if (b[k] !== undefined) { sets.push(`${c} = $${idx++}`); vals.push(b[k]); } }
    if (!sets.length) return res.status(400).json({ error: "No fields" });
    vals.push(req.params.id, req.tenantId!);
    const row = await queryOne(`UPDATE worker_housing SET ${sets.join(", ")} WHERE id = $${idx} AND tenant_id = $${idx + 1} RETURNING *`, vals);
    res.json({ assignment: row });
  } catch (err) { res.status(500).json({ error: err instanceof Error ? err.message : "Failed" }); }
});

// ═══════ SUMMARY ═══════

router.get("/housing/summary", requireAuth, async (req, res) => {
  try {
    const tenantId = req.tenantId!;
    const hostels = await query<Record<string, any>>(
      `SELECT h.id, h.name, h.owner_type, h.cost_per_bed_monthly,
        COALESCE(SUM(r.capacity), 0) AS total_capacity,
        COALESCE(SUM(r.current_occupancy), 0) AS total_occupancy
       FROM hostels h LEFT JOIN hostel_rooms r ON r.hostel_id = h.id
       WHERE h.tenant_id = $1 GROUP BY h.id`, [tenantId]);

    const monthlyCost = await queryOne<Record<string, any>>(
      `SELECT COALESCE(SUM(wh.cost_per_month), 0) AS total FROM worker_housing wh
       JOIN hostels h ON h.id = wh.hostel_id
       WHERE wh.tenant_id = $1 AND wh.status = 'active' AND h.owner_type = 'third_party'`, [tenantId]);

    const unhoused = await queryOne<Record<string, any>>(
      `SELECT COUNT(*) AS count FROM workers w WHERE w.tenant_id = $1
       AND NOT EXISTS (SELECT 1 FROM worker_housing wh WHERE wh.worker_id = w.id AND wh.status = 'active')`, [tenantId]);

    const capacityAlerts = hostels.filter(h => {
      const cap = Number(h.total_capacity);
      const occ = Number(h.total_occupancy);
      return cap > 0 && occ / cap >= 0.9;
    }).map(h => ({ hostelId: h.id, name: h.name, occupancy: `${h.total_occupancy}/${h.total_capacity}` }));

    res.json({
      totalHostels: hostels.length,
      ownedHostels: hostels.filter(h => h.owner_type === "owned").length,
      thirdPartyHostels: hostels.filter(h => h.owner_type === "third_party").length,
      monthlyThirdPartyCost: Number(monthlyCost?.total ?? 0),
      unhousedWorkers: Number(unhoused?.count ?? 0),
      capacityAlerts,
    });
  } catch (err) { res.status(500).json({ error: err instanceof Error ? err.message : "Failed" }); }
});

export default router;
