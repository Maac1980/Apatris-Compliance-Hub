import { Router } from "express";
import {
  listCoordinators, addCoordinator, updateCoordinator, removeCoordinator
} from "../lib/coordinators-db.js";

const router = Router();

// GET /api/site-coordinators
router.get("/site-coordinators", async (req, res) => {
  try {
    const list = (await listCoordinators(req.tenantId!)).map(({ passwordHash: _, ...c }) => c);
    res.json({ coordinators: list });
  } catch (err) {
    res.status(500).json({ error: err instanceof Error ? err.message : "Failed" });
  }
});

// POST /api/site-coordinators
router.post("/site-coordinators", async (req, res) => {
  try {
    const { name, email, password, assignedSite, alertEmail } = req.body as Record<string, string>;
    if (!name || !email || !password || !assignedSite) {
      return res.status(400).json({ error: "name, email, password, assignedSite are required" });
    }
    const coord = await addCoordinator({ name, email, password, assignedSite, alertEmail: alertEmail || email }, req.tenantId!);
    const { passwordHash: _, ...safe } = coord;
    return res.status(201).json(safe);
  } catch (err) {
    return res.status(400).json({ error: err instanceof Error ? err.message : "Failed" });
  }
});

// PATCH /api/site-coordinators/:id
router.patch("/site-coordinators/:id", async (req, res) => {
  try {
    const updates = req.body as Record<string, string>;
    const coord = await updateCoordinator(req.params.id, updates, req.tenantId!);
    const { passwordHash: _, ...safe } = coord;
    res.json(safe);
  } catch (err) {
    res.status(400).json({ error: err instanceof Error ? err.message : "Failed" });
  }
});

// DELETE /api/site-coordinators/:id
router.delete("/site-coordinators/:id", async (req, res) => {
  try {
    await removeCoordinator(req.params.id, req.tenantId!);
    res.json({ success: true });
  } catch (err) {
    res.status(400).json({ error: err instanceof Error ? err.message : "Failed" });
  }
});

export default router;
