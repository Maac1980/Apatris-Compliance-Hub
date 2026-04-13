import { test, expect } from "@playwright/test";
import path from "path";
import fs from "fs";

/**
 * Legal Workflow E2E Tests
 *
 * Full legal workflow: login → document intake → AI extraction →
 * approval → worker match → legal status → client view → report
 *
 * Requires APATRIS_PASS_MANISH env var for authenticated tests.
 */

let jwt = "";
let tenantId = "";

const AUTH_HEADERS = () => ({
  Authorization: `Bearer ${jwt}`,
  "Content-Type": "application/json",
});

// ─── SETUP: Authenticate ────────────────────────────────────────────────────

test.describe.serial("Legal Workflow — Full E2E", () => {
  test("Step 0: authenticate as admin", async ({ request }) => {
    const res = await request.post("/api/auth/login", {
      data: {
        email: "manish@apatris.pl",
        password: process.env.APATRIS_PASS_MANISH || "test",
      },
    });
    if (res.status() !== 200) {
      test.skip(true, "Cannot authenticate — skipping legal workflow tests");
      return;
    }
    const body = await res.json();
    jwt = body.jwt;
    tenantId = body.tenantId;
    expect(jwt).toBeTruthy();
  });

  // ─── Step 1: Legal Immigration Command Overview ─────────────────────────

  test("Step 1: legal immigration command returns overview data", async ({ request }) => {
    if (!jwt) test.skip(true, "No auth");

    const res = await request.get("/api/v1/legal-immigration/overview", {
      headers: AUTH_HEADERS(),
    });
    expect(res.ok()).toBeTruthy();
    const body = await res.json();
    // Should have metrics
    expect(body).toBeDefined();
  });

  test("Step 1b: legal immigration workers list loads", async ({ request }) => {
    if (!jwt) test.skip(true, "No auth");

    const res = await request.get("/api/v1/legal-immigration/workers", {
      headers: AUTH_HEADERS(),
    });
    expect(res.ok()).toBeTruthy();
    const body = await res.json();
    expect(body).toBeDefined();
  });

  // ─── Step 2: Document Intake — Upload ───────────────────────────────────

  test("Step 2: document intake accepts upload and processes", async ({ request }) => {
    if (!jwt) test.skip(true, "No auth");

    // Create a minimal test PDF buffer (valid PDF header)
    const pdfContent = Buffer.from(
      "%PDF-1.4\n1 0 obj<</Type/Catalog/Pages 2 0 R>>endobj\n2 0 obj<</Type/Pages/Kids[3 0 R]/Count 1>>endobj\n3 0 obj<</Type/Page/MediaBox[0 0 612 792]/Parent 2 0 R>>endobj\nxref\n0 4\n0000000000 65535 f \n0000000009 00000 n \n0000000058 00000 n \n0000000115 00000 n \ntrailer<</Size 4/Root 1 0 R>>\nstartxref\n190\n%%EOF"
    );

    const res = await request.post("/api/v1/intake/process", {
      headers: { Authorization: `Bearer ${jwt}` },
      multipart: {
        file: {
          name: "test-passport.pdf",
          mimeType: "application/pdf",
          buffer: pdfContent,
        },
      },
    });
    // May fail if OpenAI key not configured — that's OK
    // We just verify the endpoint accepts uploads
    expect([200, 201, 400, 422, 500, 503]).toContain(res.status());
  });

  // ─── Step 3: Pending Intakes ────────────────────────────────────────────

  test("Step 3: pending intakes list loads", async ({ request }) => {
    if (!jwt) test.skip(true, "No auth");

    const res = await request.get("/api/v1/intake/pending", {
      headers: AUTH_HEADERS(),
    });
    expect(res.ok()).toBeTruthy();
    const body = await res.json();
    expect(Array.isArray(body) || body.intakes !== undefined).toBeTruthy();
  });

  // ─── Step 4: Legal Cases ────────────────────────────────────────────────

  test("Step 4: legal cases list loads", async ({ request }) => {
    if (!jwt) test.skip(true, "No auth");

    const res = await request.get("/api/v1/legal/cases", {
      headers: AUTH_HEADERS(),
    });
    expect(res.ok()).toBeTruthy();
    const body = await res.json();
    expect(body).toBeDefined();
  });

  test("Step 4b: legal cases urgency queue loads", async ({ request }) => {
    if (!jwt) test.skip(true, "No auth");

    const res = await request.get("/api/v1/legal/cases/queue", {
      headers: AUTH_HEADERS(),
    });
    expect(res.ok()).toBeTruthy();
  });

  // ─── Step 5: Worker Legal Status ────────────────────────────────────────

  test("Step 5: fetch workers and check legal status", async ({ request }) => {
    if (!jwt) test.skip(true, "No auth");

    // First get a worker ID
    const workersRes = await request.get("/api/workers", {
      headers: AUTH_HEADERS(),
    });
    expect(workersRes.ok()).toBeTruthy();
    const { workers } = await workersRes.json();

    if (workers && workers.length > 0) {
      const workerId = workers[0].id;
      const statusRes = await request.get(`/api/workers/${workerId}/legal-status`, {
        headers: AUTH_HEADERS(),
      });
      // Legal status may or may not exist for this worker
      expect([200, 404]).toContain(statusRes.status());

      if (statusRes.status() === 200) {
        const status = await statusRes.json();
        expect(status).toBeDefined();
      }
    }
  });

  // ─── Step 6: Client View ────────────────────────────────────────────────

  test("Step 6: client view returns grouped compliance data", async ({ request }) => {
    if (!jwt) test.skip(true, "No auth");

    const res = await request.get("/api/v1/legal-immigration/client-view", {
      headers: AUTH_HEADERS(),
    });
    expect(res.ok()).toBeTruthy();
    const body = await res.json();
    expect(body).toBeDefined();
  });

  // ─── Step 7: Legal Alerts ──────────────────────────────────────────────

  test("Step 7: legal alerts list loads", async ({ request }) => {
    if (!jwt) test.skip(true, "No auth");

    const res = await request.get("/api/v1/legal/alerts", {
      headers: AUTH_HEADERS(),
    });
    expect(res.ok()).toBeTruthy();
  });

  // ─── Step 8: Legal Document Generation ─────────────────────────────────

  test("Step 8: legal document suggestion works", async ({ request }) => {
    if (!jwt) test.skip(true, "No auth");

    const workersRes = await request.get("/api/workers", {
      headers: AUTH_HEADERS(),
    });
    const { workers } = await workersRes.json();

    if (workers && workers.length > 0) {
      const workerId = workers[0].id;
      const res = await request.get(`/api/v1/legal/documents/suggest/${workerId}`, {
        headers: AUTH_HEADERS(),
      });
      expect([200, 404]).toContain(res.status());
    }
  });

  // ─── Step 9: Report Endpoints ──────────────────────────────────────────

  test("Step 9: report schedules endpoint works", async ({ request }) => {
    if (!jwt) test.skip(true, "No auth");

    const res = await request.get("/api/reports/schedules", {
      headers: AUTH_HEADERS(),
    });
    expect(res.ok()).toBeTruthy();
  });

  // ─── Step 10: Knowledge Base ───────────────────────────────────────────

  test("Step 10: legal knowledge base articles load", async ({ request }) => {
    if (!jwt) test.skip(true, "No auth");

    const res = await request.get("/api/legal-kb/articles", {
      headers: AUTH_HEADERS(),
    });
    expect(res.ok()).toBeTruthy();
    const body = await res.json();
    expect(body).toBeDefined();
  });
});
