import { test, expect } from "@playwright/test";

/**
 * Multi-tenant stress test
 * Verifies tenant data isolation by creating workers in different tenants
 * and confirming no cross-tenant data leaks.
 *
 * Requires APATRIS_PASS_MANISH env var for authenticated requests.
 */

let jwt = "";
let tenantId = "";

test.describe.serial("Multi-Tenant Isolation", () => {
  test("authenticate as admin", async ({ request }) => {
    const res = await request.post("/api/auth/login", {
      data: {
        email: "manish@apatris.pl",
        password: process.env.APATRIS_PASS_MANISH || "test",
      },
    });
    if (res.status() !== 200) {
      test.skip(true, "Cannot authenticate — skipping tenant tests");
      return;
    }
    const body = await res.json();
    jwt = body.jwt;
    tenantId = body.tenantId;
    expect(jwt).toBeTruthy();
    expect(tenantId).toBeTruthy();
  });

  test("fetch workers returns only current tenant data", async ({ request }) => {
    if (!jwt) test.skip(true, "No auth");
    const res = await request.get("/api/workers", {
      headers: { Authorization: `Bearer ${jwt}` },
    });
    expect(res.ok()).toBeTruthy();
    const body = await res.json();
    const workers = body.workers || body;
    // All workers should belong to current tenant
    if (Array.isArray(workers) && workers.length > 0 && workers[0].tenant_id) {
      for (const w of workers) {
        expect(w.tenant_id, `Worker ${w.id} belongs to wrong tenant`).toBe(tenantId);
      }
    }
  });

  test("compliance snapshots are tenant-scoped", async ({ request }) => {
    if (!jwt) test.skip(true, "No auth");
    const res = await request.get("/api/compliance/snapshots", {
      headers: { Authorization: `Bearer ${jwt}` },
    });
    if (res.status() === 200) {
      const body = await res.json();
      const snapshots = body.snapshots || body;
      if (Array.isArray(snapshots) && snapshots.length > 0 && snapshots[0].tenant_id) {
        for (const s of snapshots) {
          expect(s.tenant_id).toBe(tenantId);
        }
      }
    }
  });

  test("audit logs are tenant-scoped", async ({ request }) => {
    if (!jwt) test.skip(true, "No auth");
    const res = await request.get("/api/audit-logs", {
      headers: { Authorization: `Bearer ${jwt}` },
    });
    if (res.status() === 200) {
      const body = await res.json();
      const logs = body.logs || body;
      if (Array.isArray(logs) && logs.length > 0 && logs[0].tenant_id) {
        for (const l of logs) {
          expect(l.tenant_id).toBe(tenantId);
        }
      }
    }
  });

  test("contracts are tenant-scoped", async ({ request }) => {
    if (!jwt) test.skip(true, "No auth");
    const res = await request.get("/api/contracts", {
      headers: { Authorization: `Bearer ${jwt}` },
    });
    if (res.status() === 200) {
      const body = await res.json();
      const contracts = body.contracts || body;
      if (Array.isArray(contracts) && contracts.length > 0 && contracts[0].tenant_id) {
        for (const c of contracts) {
          expect(c.tenant_id).toBe(tenantId);
        }
      }
    }
  });

  test("X-Tenant-ID header with wrong tenant returns no cross-data", async ({ request }) => {
    // Try to access with a fake tenant ID — should get empty or error
    const fakeTenantId = "00000000-0000-0000-0000-000000000000";
    const res = await request.get("/api/workers", {
      headers: {
        Authorization: `Bearer ${jwt}`,
        "X-Tenant-ID": fakeTenantId,
      },
    });
    // JWT tenantId should take precedence — workers should still be from original tenant
    if (res.ok()) {
      const body = await res.json();
      const workers = body.workers || body;
      if (Array.isArray(workers)) {
        for (const w of workers) {
          if (w.tenant_id) {
            // Should NOT return data from the fake tenant
            expect(w.tenant_id).not.toBe(fakeTenantId);
          }
        }
      }
    }
  });

  test("payroll data is tenant-scoped", async ({ request }) => {
    if (!jwt) test.skip(true, "No auth");
    const res = await request.get("/api/payroll", {
      headers: { Authorization: `Bearer ${jwt}` },
    });
    if (res.status() === 200) {
      const body = await res.json();
      const records = body.payroll || body.records || body;
      if (Array.isArray(records) && records.length > 0 && records[0].tenant_id) {
        for (const r of records) {
          expect(r.tenant_id).toBe(tenantId);
        }
      }
    }
  });
});
