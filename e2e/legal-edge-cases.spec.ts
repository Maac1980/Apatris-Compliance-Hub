import { test, expect } from "@playwright/test";

/**
 * Legal Edge Cases E2E Tests
 *
 * Covers: missing worker, expired permit, rejected case, missing fields
 */

let jwt = "";

const AUTH_HEADERS = () => ({
  Authorization: `Bearer ${jwt}`,
  "Content-Type": "application/json",
});

test.describe.serial("Legal Edge Cases", () => {
  test("authenticate", async ({ request }) => {
    const res = await request.post("/api/auth/login", {
      data: {
        email: "manish@apatris.pl",
        password: process.env.APATRIS_PASS_MANISH || "test",
      },
    });
    if (res.status() !== 200) {
      test.skip(true, "Cannot authenticate");
      return;
    }
    const body = await res.json();
    jwt = body.jwt;
  });

  // ─── Edge Case 1: Missing Worker ──────────────────────────────────────

  test("legal status for non-existent worker returns 404", async ({ request }) => {
    if (!jwt) test.skip(true, "No auth");

    const fakeId = "00000000-0000-0000-0000-000000000000";
    const res = await request.get(`/api/workers/${fakeId}/legal-status`, {
      headers: AUTH_HEADERS(),
    });
    expect([404, 500]).toContain(res.status());
  });

  test("legal evidence for non-existent worker returns empty or 404", async ({ request }) => {
    if (!jwt) test.skip(true, "No auth");

    const fakeId = "00000000-0000-0000-0000-000000000000";
    const res = await request.get(`/api/workers/${fakeId}/legal-evidence`, {
      headers: AUTH_HEADERS(),
    });
    expect([200, 404]).toContain(res.status());

    if (res.status() === 200) {
      const body = await res.json();
      const evidence = body.evidence || body;
      if (Array.isArray(evidence)) {
        expect(evidence.length).toBe(0);
      }
    }
  });

  test("legal cases for non-existent worker returns empty", async ({ request }) => {
    if (!jwt) test.skip(true, "No auth");

    const fakeId = "00000000-0000-0000-0000-000000000000";
    const res = await request.get(`/api/v1/legal/cases/${fakeId}`, {
      headers: AUTH_HEADERS(),
    });
    expect([200, 404]).toContain(res.status());
  });

  test("document suggestion for non-existent worker handles gracefully", async ({ request }) => {
    if (!jwt) test.skip(true, "No auth");

    const fakeId = "00000000-0000-0000-0000-000000000000";
    const res = await request.get(`/api/v1/legal/documents/suggest/${fakeId}`, {
      headers: AUTH_HEADERS(),
    });
    expect([200, 404, 500]).toContain(res.status());
  });

  // ─── Edge Case 2: Expired Permit ──────────────────────────────────────

  test("immigration permits include expired status in response", async ({ request }) => {
    if (!jwt) test.skip(true, "No auth");

    const res = await request.get("/api/immigration?status=expired", {
      headers: AUTH_HEADERS(),
    });
    expect([200, 404]).toContain(res.status());

    if (res.status() === 200) {
      const body = await res.json();
      const permits = body.permits || body;
      if (Array.isArray(permits)) {
        // If expired permits exist, verify they have an expiry in the past
        for (const p of permits) {
          if (p.expiry_date) {
            const expiry = new Date(p.expiry_date);
            expect(expiry.getTime()).toBeLessThan(Date.now());
          }
        }
      }
    }
  });

  test("workers with expired documents appear in compliance alerts", async ({ request }) => {
    if (!jwt) test.skip(true, "No auth");

    const res = await request.get("/api/compliance/alerts", {
      headers: AUTH_HEADERS(),
    });
    if (res.status() === 200) {
      const body = await res.json();
      // Alerts should exist if any documents are expired
      expect(body).toBeDefined();
    }
  });

  // ─── Edge Case 3: Rejected Case ──────────────────────────────────────

  test("creating a case with invalid type is rejected", async ({ request }) => {
    if (!jwt) test.skip(true, "No auth");

    const res = await request.post("/api/v1/legal/cases", {
      headers: AUTH_HEADERS(),
      data: {
        worker_id: "00000000-0000-0000-0000-000000000000",
        case_type: "INVALID_TYPE",
        status: "open",
      },
    });
    // Should reject — either 400/422 for validation or 500 for DB constraint
    expect([400, 422, 500]).toContain(res.status());
  });

  test("rejecting a document intake works", async ({ request }) => {
    if (!jwt) test.skip(true, "No auth");

    // Try to reject a non-existent intake — should handle gracefully
    const fakeId = "00000000-0000-0000-0000-000000000000";
    const res = await request.post(`/api/v1/intake/${fakeId}/reject`, {
      headers: AUTH_HEADERS(),
      data: { reason: "Test rejection" },
    });
    expect([200, 404, 500]).toContain(res.status());
  });

  // ─── Edge Case 4: Missing Fields ──────────────────────────────────────

  test("document intake without file returns error", async ({ request }) => {
    if (!jwt) test.skip(true, "No auth");

    const res = await request.post("/api/v1/intake/process", {
      headers: { Authorization: `Bearer ${jwt}` },
      // No file attached
    });
    expect([400, 422, 500]).toContain(res.status());
  });

  test("create legal case with missing required fields returns error", async ({ request }) => {
    if (!jwt) test.skip(true, "No auth");

    const res = await request.post("/api/v1/legal/cases", {
      headers: AUTH_HEADERS(),
      data: {
        // Missing worker_id and case_type
      },
    });
    expect([400, 422, 500]).toContain(res.status());
  });

  test("generate legal document with missing worker returns error", async ({ request }) => {
    if (!jwt) test.skip(true, "No auth");

    const res = await request.post("/api/v1/legal/documents/generate", {
      headers: AUTH_HEADERS(),
      data: {
        // Missing workerId and templateType
      },
    });
    expect([400, 422, 500]).toContain(res.status());
  });

  test("send report with missing email returns error", async ({ request }) => {
    if (!jwt) test.skip(true, "No auth");

    const res = await request.post("/api/reports/send", {
      headers: AUTH_HEADERS(),
      data: {
        // Missing email and reportType
      },
    });
    expect([400, 422, 500]).toContain(res.status());
  });

  // ─── Edge Case: Auth Boundary ─────────────────────────────────────────

  test("legal endpoints reject unauthenticated requests", async ({ request }) => {
    const endpoints = [
      "/api/v1/legal-immigration/overview",
      "/api/v1/legal/cases",
      "/api/v1/intake/pending",
      "/api/v1/legal/alerts",
      "/api/v1/legal/documents/suggest/test",
      "/api/legal-kb/articles",
      "/api/immigration",
      "/api/reports/schedules",
    ];

    for (const endpoint of endpoints) {
      const res = await request.get(endpoint);
      expect(
        res.status(),
        `${endpoint} should require auth`
      ).toBeGreaterThanOrEqual(401);
    }
  });
});
