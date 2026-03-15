import { Router } from "express";

const router = Router();

// ── Static 3-user list ─────────────────────────────────────────────────────
// Emails are set here; passwords come from Replit Secrets (APATRIS_PASS_1/2/3)
// Update emails below when provided, then restart the API server.
const USERS = [
  {
    email: (process.env.APATRIS_EMAIL_1 || "user1@apatris.com").toLowerCase(),
    name:  process.env.APATRIS_NAME_1  || "User 1",
    role:  process.env.APATRIS_ROLE_1  || "Admin",
    passEnvKey: "APATRIS_PASS_1",
  },
  {
    email: (process.env.APATRIS_EMAIL_2 || "user2@apatris.com").toLowerCase(),
    name:  process.env.APATRIS_NAME_2  || "User 2",
    role:  process.env.APATRIS_ROLE_2  || "Manager",
    passEnvKey: "APATRIS_PASS_2",
  },
  {
    email: (process.env.APATRIS_EMAIL_3 || "user3@apatris.com").toLowerCase(),
    name:  process.env.APATRIS_NAME_3  || "User 3",
    role:  process.env.APATRIS_ROLE_3  || "Viewer",
    passEnvKey: "APATRIS_PASS_4",
  },
];

// POST /auth/login
router.post("/auth/login", async (req, res) => {
  try {
    const { email, password } = req.body as { email?: string; password?: string };

    if (!email || !password) {
      return res.status(400).json({ error: "Email and password are required" });
    }

    const normalizedEmail = email.trim().toLowerCase();
    const user = USERS.find((u) => u.email === normalizedEmail);

    if (!user) {
      return res.status(401).json({ error: "Invalid credentials" });
    }

    const storedPassword = process.env[user.passEnvKey];
    if (!storedPassword || storedPassword !== password) {
      return res.status(401).json({ error: "Invalid credentials" });
    }

    return res.json({
      email: user.email,
      name: user.name,
      role: user.role,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Login failed";
    return res.status(500).json({ error: message });
  }
});

export default router;
