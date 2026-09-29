/**
 * Obscura Headless Browser Playwright Integration Helper for Vecalss
 *
 * This module connects Playwright to the lightweight, Rust-based Obscura browser
 * engine via Chrome DevTools Protocol (CDP).
 *
 * Priority Policy:
 * - ego-browser: Used for manual UI/UX verification or tests requiring human interaction.
 * - obscura: Used for all automated, headless, background, and Playwright tests.
 * - Obscura is preferred over Chrome/Chromium for headless automation.
 */

import { chromium, type Browser, type BrowserContext, type Page } from "playwright-core";
import * as http from "node:http";

export const DEFAULT_OBSCURA_ENDPOINT = "http://127.0.0.1:9222";

export interface ObscuraConnectionOptions {
  /**
   * CDP HTTP or WebSocket endpoint.
   * Defaults to process.env.OBSCURA_WS_ENDPOINT, process.env.OBSCURA_CDP_URL, or 'http://127.0.0.1:9222'
   */
  endpoint?: string;

  /**
   * Timeout in milliseconds for establishing the CDP connection.
   * Defaults to 10,000ms.
   */
  timeoutMs?: number;

  /**
   * Default viewport dimensions.
   * Defaults to 1280x800.
   */
  viewport?: { width: number; height: number } | null;
}

/**
 * Returns the configured Obscura CDP endpoint URL.
 */
export function getObscuraCdpEndpoint(overrideEndpoint?: string): string {
  if (overrideEndpoint) return overrideEndpoint;
  return (
    process.env.OBSCURA_WS_ENDPOINT ||
    process.env.OBSCURA_CDP_URL ||
    DEFAULT_OBSCURA_ENDPOINT
  );
}

/**
 * Probes the Obscura CDP server to verify it is running and responsive.
 */
export async function isObscuraRunning(
  endpoint = getObscuraCdpEndpoint(),
  timeoutMs = 2000
): Promise<boolean> {
  return new Promise((resolve) => {
    try {
      const url = new URL(endpoint);
      const host = url.hostname || "127.0.0.1";
      const port = url.port || "9222";

      const req = http.get(
        `http://${host}:${port}/json/version`,
        { timeout: timeoutMs },
        (res) => {
          if (res.statusCode && res.statusCode >= 200 && res.statusCode < 300) {
            resolve(true);
          } else {
            resolve(false);
          }
          res.resume();
        }
      );

      req.on("error", () => resolve(false));
      req.on("timeout", () => {
        req.destroy();
        resolve(false);
      });
    } catch {
      resolve(false);
    }
  });
}

/**
 * Connects Playwright to a running Obscura CDP instance.
 *
 * NOTE: Always use chromium.connectOverCDP(). Playwright's native `connect()`
 * uses Playwright's proprietary wire protocol which Obscura intentionally does not implement.
 */
export async function connectObscura(
  options: ObscuraConnectionOptions = {}
): Promise<{ browser: Browser; context: BrowserContext; page: Page }> {
  const endpoint = getObscuraCdpEndpoint(options.endpoint);
  const timeoutMs = options.timeoutMs ?? 10_000;
  const viewport = options.viewport === undefined ? { width: 1280, height: 800 } : options.viewport;

  const running = await isObscuraRunning(endpoint, 2000);
  if (!running) {
    throw new Error(
      `[obscura] Cannot connect: Obscura CDP server is not responding at ${endpoint}.\n` +
      `Start the server with: pnpm obscura:serve or docker compose -f docker-compose.dev.yml up -d obscura`
    );
  }

  const browser = await chromium.connectOverCDP(endpoint, {
    timeout: timeoutMs,
  });

  const context = await browser.newContext(
    viewport ? { viewport } : undefined
  );
  const page = await context.newPage();

  return { browser, context, page };
}

/**
 * Safe scoped execution runner with automatic resource cleanup.
 *
 * Example:
 * ```ts
 * await withObscuraPage(async (page) => {
 *   await page.goto("http://localhost:5023/login");
 *   expect(await page.title()).toContain("Vecalss");
 * });
 * ```
 */
export async function withObscuraPage<T>(
  callback: (page: Page, context: BrowserContext, browser: Browser) => Promise<T>,
  options: ObscuraConnectionOptions = {}
): Promise<T> {
  const { browser, context, page } = await connectObscura(options);

  try {
    return await callback(page, context, browser);
  } finally {
    try {
      await page.close();
    } catch {
      // ignore page cleanup failure
    }
    try {
      await context.close();
    } catch {
      // ignore context cleanup failure
    }
    try {
      await browser.close();
    } catch {
      // ignore browser disconnect failure
    }
  }
}

/**
 * Seeded test account credentials from docs/agent-app-testing-guide.md
 */
export const SEEDED_CREDENTIALS = {
  admin: {
    email: "admin@vecalss.local",
    password: "Admin12345!",
    expectedHomePath: "/admin",
  },
  tutor: {
    email: "tutor@vecalss.local",
    password: "Tutor12345!",
    expectedHomePath: "/mentor/dashboard",
  },
  student: {
    email: "student@vecalss.local",
    password: "Student12345!",
    expectedHomePath: "/dashboard",
  },
  newstudent: {
    email: "newstudent@vecalss.local",
    password: "TempStudent123!",
    expectedHomePath: "/onboarding",
  },
  affiliator: {
    email: "affiliator@vecalss.local",
    password: "Affiliator12345!",
    expectedHomePath: "/affiliator/dashboard",
  },
  developer: {
    email: "developer@vecalss.local",
    password: "Developer12345!",
    expectedHomePath: "/developer/reports",
  },
} as const;

export type SeededRole = keyof typeof SEEDED_CREDENTIALS;

/**
 * Convenience helper to log in a seeded persona via Obscura.
 */
export async function loginWithSeededUser(
  page: Page,
  role: SeededRole,
  baseUrl = process.env.APP_BASE_URL || "http://localhost:5023"
): Promise<void> {
  const creds = SEEDED_CREDENTIALS[role];
  if (!creds) {
    throw new Error(`[obscura] Unknown role '${role}'. Available: ${Object.keys(SEEDED_CREDENTIALS).join(", ")}`);
  }

  await page.goto(`${baseUrl}/login`, { waitUntil: "domcontentloaded" });
  await page.fill('input[type="email"], input[name="email"]', creds.email);
  await page.fill('input[type="password"], input[name="password"]', creds.password);
  await page.click('button[type="submit"]');
  await page.waitForURL(`**${creds.expectedHomePath}*`, { timeout: 15_000 });
}
