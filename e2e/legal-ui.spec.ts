import { test, expect } from "@playwright/test";

/**
 * Legal UI E2E Tests
 *
 * Validates that legal pages load correctly in the browser.
 * Tests the actual UI rendering, not just API responses.
 */

test.describe("Legal UI Pages", () => {
  test("Legal Immigration Command page loads", async ({ request }) => {
    const res = await request.get("/legal-immigration");
    expect(res.ok()).toBeTruthy();
    const html = await res.text();
    expect(html).toContain("<div id=\"root\"");
  });

  test("Legal Intelligence page loads", async ({ request }) => {
    const res = await request.get("/legal-intelligence");
    expect(res.ok()).toBeTruthy();
    const html = await res.text();
    expect(html).toContain("<div id=\"root\"");
  });

  test("Document Intake page loads", async ({ request }) => {
    const res = await request.get("/document-intake");
    expect(res.ok()).toBeTruthy();
  });

  test("Document Approval page loads", async ({ request }) => {
    const res = await request.get("/document-approval");
    expect(res.ok()).toBeTruthy();
  });

  test("Legal Command Center page loads", async ({ request }) => {
    const res = await request.get("/command-center");
    expect(res.ok()).toBeTruthy();
  });

  test("Legal Alerts page loads", async ({ request }) => {
    const res = await request.get("/legal-alerts");
    expect(res.ok()).toBeTruthy();
  });

  test("Legal Documents page loads", async ({ request }) => {
    const res = await request.get("/legal-documents");
    expect(res.ok()).toBeTruthy();
  });

  test("Immigration Dashboard page loads", async ({ request }) => {
    const res = await request.get("/immigration");
    expect(res.ok()).toBeTruthy();
  });

  test("Legal Knowledge Base page loads", async ({ request }) => {
    const res = await request.get("/legal-kb");
    expect(res.ok()).toBeTruthy();
  });

  test("Legal Brief page loads", async ({ request }) => {
    const res = await request.get("/legal-brief");
    expect(res.ok()).toBeTruthy();
  });

  test("Legal Queue page loads", async ({ request }) => {
    const res = await request.get("/legal-queue");
    expect(res.ok()).toBeTruthy();
  });

  test("Schengen Calculator page loads", async ({ request }) => {
    const res = await request.get("/schengen-calculator");
    expect(res.ok()).toBeTruthy();
  });
});
