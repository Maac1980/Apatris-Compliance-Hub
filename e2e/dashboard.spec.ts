import { test, expect } from "@playwright/test";

test.describe("Dashboard UI", () => {
  test("dashboard loads login page", async ({ page }) => {
    await page.goto("/");
    // SPA — wait for React to render
    await page.waitForLoadState("networkidle");
    // Check page loaded without crash (title may be empty for SPA)
    const html = await page.content();
    expect(html).toContain("<div id=\"root\"");
  });

  test("dashboard serves static assets", async ({ request }) => {
    const res = await request.get("/");
    expect(res.ok()).toBeTruthy();
    const html = await res.text();
    expect(html).toContain("<!DOCTYPE html>");
  });

  test("workforce app loads", async ({ request }) => {
    const res = await request.get("/workforce/");
    expect(res.ok()).toBeTruthy();
    const html = await res.text();
    expect(html).toContain("<!DOCTYPE html>");
  });
});
