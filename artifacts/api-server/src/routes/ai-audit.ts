import { Router } from "express";
import { requireAuth, requireRole } from "../lib/auth-middleware.js";
import { query, queryOne, execute } from "../lib/db.js";

const router = Router();

// ═══ TABLE SETUP ═════════════════════════════════════════════════════════════

// Table ai_audit_log is created by init-db.ts at startup

// ═══ ENDPOINTS ═══════════════════════════════════════════════════════════════

// GET /api/ai-audit — list audit entries (paginated)
router.get("/ai-audit", requireAuth, async (req, res) => {
  try {
    const { page, limit: lim, action, actor } = req.query as Record<string, string>;
    const pageNum = Math.max(1, parseInt(page ?? "1", 10) || 1);
    const limitNum = Math.min(100, Math.max(1, parseInt(lim ?? "50", 10) || 50));
    const offset = (pageNum - 1) * limitNum;

    let sql = "SELECT * FROM ai_audit_log WHERE 1=1";
    const params: unknown[] = [];

    if (action) { params.push(action); sql += ` AND action = $${params.length}`; }
    if (actor) { params.push(actor); sql += ` AND actor = $${params.length}`; }

    sql += " ORDER BY created_at DESC";
    params.push(limitNum);
    sql += ` LIMIT $${params.length}`;
    params.push(offset);
    sql += ` OFFSET $${params.length}`;

    const rows = await query(sql, params);

    // Get total count for pagination
    let countSql = "SELECT COUNT(*) as count FROM ai_audit_log WHERE 1=1";
    const countParams: unknown[] = [];
    if (action) { countParams.push(action); countSql += ` AND action = $${countParams.length}`; }
    if (actor) { countParams.push(actor); countSql += ` AND actor = $${countParams.length}`; }
    const totalRow = await queryOne<{ count: string }>(countSql, countParams);
    const total = Number(totalRow?.count ?? 0);

    res.json({
      entries: rows,
      pagination: { page: pageNum, limit: limitNum, total, totalPages: Math.ceil(total / limitNum) },
    });
  } catch (err) {
    res.status(500).json({ error: err instanceof Error ? err.message : "Failed to fetch AI audit log" });
  }
});

// POST /api/ai-audit — log AI decision
router.post("/ai-audit", requireAuth, async (req, res) => {
  try {
    const { action, inputSummary, outputSummary, model, confidence, humanOverride, actor } = req.body as {
      action?: string; inputSummary?: string; outputSummary?: string;
      model?: string; confidence?: number; humanOverride?: boolean; actor?: string;
    };
    if (!action) return res.status(400).json({ error: "action is required" });

    const row = await queryOne(
      `INSERT INTO ai_audit_log (action, input_summary, output_summary, model, confidence, human_override, actor)
       VALUES ($1, $2, $3, $4, $5, $6, $7) RETURNING *`,
      [
        action,
        inputSummary ?? null,
        outputSummary ?? null,
        model ?? null,
        confidence ?? null,
        humanOverride ?? false,
        actor ?? null,
      ]
    );
    res.status(201).json({ entry: row });
  } catch (err) {
    res.status(500).json({ error: err instanceof Error ? err.message : "Failed to log AI audit entry" });
  }
});

export default router;
