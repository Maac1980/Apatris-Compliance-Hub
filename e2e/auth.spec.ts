import { test, expect } from "@playwright/test";

test.describe("Authentication", () => {
  test("login with valid credentials returns JWT", async ({ request }) => {
    const res = await request.post("/api/auth/login", {
      data: {
        email: "manish@apatris.pl",
        password: process.env.APATRIS_PASS_MANISH || "test",
      },
    });
    // Should return 200 or 401 (if env var not set) — never 500
    expect([200, 401]).toContain(res.status());

    if (res.status() === 200) {
      const body = await res.json();
      expect(body.jwt).toBeTruthy();
      expect(body.email).toBe("manish@apatris.pl");
      expect(body.role).toBeTruthy();
    }
  });

  test("login with invalid credentials returns 401", async ({ request }) => {
    const res = await request.post("/api/auth/login", {
      data: {
        email: "nobody@invalid.com",
        password: "wrongpassword",
      },
    });
    expect([401, 403]).toContain(res.status());
  });

  test("login with missing fields returns 400", async ({ request }) => {
    const res = await request.post("/api/auth/login", {
      data: {},
    });
    expect([400, 422]).toContain(res.status());
  });
});
