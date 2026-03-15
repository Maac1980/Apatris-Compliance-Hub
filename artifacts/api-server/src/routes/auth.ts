import { Router } from "express";
import { fetchUserByEmail } from "../lib/airtable.js";

const router = Router();

// POST /auth/login — checks USERS table in Airtable
router.post("/auth/login", async (req, res) => {
  try {
    const { email, password } = req.body as { email?: string; password?: string };

    if (!email || !password) {
      return res.status(400).json({ error: "Email and password are required" });
    }

    const user = await fetchUserByEmail(email.trim().toLowerCase());

    if (!user) {
      return res.status(401).json({ error: "Invalid credentials" });
    }

    const storedPassword = String(user.fields["Password"] ?? "");
    if (storedPassword !== password) {
      return res.status(401).json({ error: "Invalid credentials" });
    }

    const name = String(user.fields["Name"] ?? email.split("@")[0]);
    const role = String(user.fields["Role"] ?? "User");

    return res.json({
      id: user.id,
      email: String(user.fields["Email"] ?? email),
      name,
      role,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Login failed";
    return res.status(500).json({ error: message });
  }
});

export default router;
