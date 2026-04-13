import { test, expect } from "@playwright/test";

test.describe("API Endpoints (unauthenticated)", () => {
  test("GET /api/healthz returns ok", async ({ request }) => {
    const res = await request.get("/api/healthz");
    expect(res.ok()).toBeTruthy();
  });

  test("protected endpoints return 401 without auth", async ({ request }) => {
    const protectedRoutes = [
      "/api/workers",
      "/api/payroll",
      "/api/compliance/alerts",
      "/api/documents",
      "/api/contracts",
      "/api/analytics/overview",
      "/api/hours",
      "/api/gps/checkins",
      "/api/audit-logs",
    ];

    for (const route of protectedRoutes) {
      const res = await request.get(route);
      expect(res.status(), `${route} should require auth`).toBeGreaterThanOrEqual(401);
    }
  });

  test("non-existent API route returns 404", async ({ request }) => {
    const res = await request.get("/api/this-does-not-exist");
    expect(res.status()).toBe(404);
  });
});
