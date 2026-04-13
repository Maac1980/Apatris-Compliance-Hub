import { test, expect, devices } from "@playwright/test";

const iPhone = devices["iPhone 13"];

test.use({ ...iPhone });

test.describe("Mobile Responsiveness (375px)", () => {

  test("login page renders without horizontal overflow", async ({ page }) => {
    await page.goto("/");
    await page.waitForLoadState("networkidle");
    const body = page.locator("body");
    const bodyWidth = await body.evaluate((el) => el.scrollWidth);
    const viewportWidth = page.viewportSize()?.width || 390;
    // No horizontal overflow
    expect(bodyWidth).toBeLessThanOrEqual(viewportWidth + 5);
  });

  test("workforce app renders at mobile width", async ({ page }) => {
    await page.goto("/workforce/");
    await page.waitForLoadState("networkidle");
    const html = await page.content();
    expect(html).toContain("<div id=\"root\"");
    // No horizontal scroll
    const bodyWidth = await page.locator("body").evaluate((el) => el.scrollWidth);
    const viewportWidth = page.viewportSize()?.width || 390;
    expect(bodyWidth).toBeLessThanOrEqual(viewportWidth + 5);
  });

  test("take mobile screenshots for visual review", async ({ page }) => {
    // Dashboard login
    await page.goto("/");
    await page.waitForLoadState("networkidle");
    await page.screenshot({ path: "e2e/screenshots/mobile-login.png", fullPage: true });

    // Workforce app
    await page.goto("/workforce/");
    await page.waitForLoadState("networkidle");
    await page.screenshot({ path: "e2e/screenshots/mobile-workforce.png", fullPage: true });
  });
});
