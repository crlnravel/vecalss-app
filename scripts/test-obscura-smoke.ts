/**
 * Smoke test for Obscura Headless Browser & Playwright Integration
 *
 * Usage:
 *   ./_harness/resource-guard.sh run -- rtk pnpm test:obscura-smoke
 */

import assert from "node:assert/strict";
import { isObscuraRunning, withObscuraPage } from "../lib/testing/obscura";

const BASE_URL = process.env.APP_BASE_URL || "http://localhost:5023";

async function main() {
  console.log("[test:obscura-smoke] Checking Obscura CDP availability...");
  const running = await isObscuraRunning();

  if (!running) {
    console.error("[test:obscura-smoke] Obscura is not currently running.");
    console.error("  Start it with: pnpm obscura:serve");
    console.error("  Or in background: ./_harness/resource-guard.sh run -- pnpm obscura:serve &");
    process.exit(1);
  }

  console.log("[test:obscura-smoke] Obscura is running. Connecting Playwright over CDP...");

  await withObscuraPage(async (page) => {
    console.log(`[test:obscura-smoke] Navigating to ${BASE_URL}/login ...`);
    await page.goto(`${BASE_URL}/login`, { waitUntil: "domcontentloaded", timeout: 15_000 });

    const title = await page.title();
    console.log(`[test:obscura-smoke] Page title: "${title}"`);
    assert.ok(title.includes("Vecalss"), `Expected title to contain "Vecalss", got "${title}"`);

    const hasEmail = (await page.$('input[type="email"], input[name="email"]')) !== null;
    assert.ok(hasEmail, "Expected email input field to exist on login page");

    const hasPassword = (await page.$('input[type="password"], input[name="password"]')) !== null;
    assert.ok(hasPassword, "Expected password input field to exist on login page");

    console.log("[test:obscura-smoke] ✓ Form elements verified on login page.");
  });

  console.log("[test:obscura-smoke] ✓ Obscura Playwright smoke test passed successfully!");
}

main().catch((err) => {
  console.error("[test:obscura-smoke] ✗ Test failed with error:", err);
  process.exit(1);
});
