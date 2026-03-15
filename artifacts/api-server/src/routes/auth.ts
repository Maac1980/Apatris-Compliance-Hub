import { Router } from "express";
import { findCoordinatorByEmail, verifyCoordinatorPassword } from "../lib/site-coordinators.js";

const router = Router();

const ALLOWED_USERS = [
  {
    email: "manish@apatris.pl",
    name: "Manish",
    role: "Admin",
    passEnvKey: "APATRIS_PASS_MANISH",
  },
  {
    email: "akshay@apatris.pl",
    name: "Akshay",
    role: "Admin",
    passEnvKey: "APATRIS_PASS_AKSHAY",
  },
];

// POST /api/auth/login
router.post("/auth/login", async (req, res) => {
  try {
    const { email, password } = req.body as { email?: string; password?: string };

    if (!email || !password) {
      return res.status(400).json({ error: "Email and password are required" });
    }

    const normalizedEmail = email.trim().toLowerCase();
    const user = ALLOWED_USERS.find((u) => u.email === normalizedEmail);

    if (user) {
      const storedPassword = process.env[user.passEnvKey];
      if (!storedPassword || storedPassword !== password) {
        return res.status(401).json({ error: "Invalid credentials" });
      }
      return res.json({ email: user.email, name: user.name, role: user.role });
    }

    // Check site coordinator accounts
    const coordinator = findCoordinatorByEmail(normalizedEmail);
    if (coordinator) {
      if (!verifyCoordinatorPassword(coordinator, password)) {
        return res.status(401).json({ error: "Invalid credentials" });
      }
      return res.json({
        email: coordinator.email,
        name: coordinator.name,
        role: "Coordinator",
        assignedSite: coordinator.assignedSite,
      });
    }

    return res.status(403).json({ error: "Access Denied: Contact Administrator." });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Login failed";
    return res.status(500).json({ error: message });
  }
});

export default router;
