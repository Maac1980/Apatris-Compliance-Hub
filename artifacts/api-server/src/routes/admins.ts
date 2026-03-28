import { Router } from "express";
import {
  fetchAdmins,
  updateAdmin,
} from "../lib/admins-db.js";

const router = Router();

// GET /api/admins
// Returns all admin profiles. Auto-creates and seeds the table on first call.
router.get("/admins", async (_req, res) => {
  try {
    const admins = await fetchAdmins();
    return res.json({ admins });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Failed to fetch admins";
    return res.status(500).json({ error: message });
  }
});

// PATCH /api/admins/:id
// Updates email and/or phone for a specific admin record.
router.patch("/admins/:id", async (req, res) => {
  try {
    const { id } = req.params;
    const { email, phone } = req.body as { email?: string; phone?: string };

    if (email === undefined && phone === undefined) {
      return res.status(400).json({ error: "Provide at least one field to update" });
    }

    const updated = await updateAdmin(id, { email, phone });
    return res.json({ admin: updated });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Failed to update admin";
    return res.status(500).json({ error: message });
  }
});

export default router;
