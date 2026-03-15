import { Router } from "express";

const router = Router();

// Exactly two authorised accounts.
// Emails are hardcoded; passwords live in Replit Secrets (never in source code).
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

    // Email not in the allowed list
    if (!user) {
      return res
        .status(403)
        .json({ error: "Access Denied: Contact Administrator." });
    }

    // Email found — check password against secret
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
