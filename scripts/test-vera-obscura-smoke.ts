/**
 * Headless smoke test for the Vera workspace, driven through Obscura as the Voyager (student) account. The whole run is one guarded
 * command: the dev server starts here with VERA_MOCK_MODEL=1, the browser checks run against it, and the server stops before the
 * command exits. Obscura must already be serving CDP. Set OBSCURA_CDP_TOKEN when the server requires one, and VERA_SMOKE_LOG_DIR to keep
 * the full dev-server and browser logs.
 *
 * Usage:
 *   OBSCURA_CDP_TOKEN=... VERA_SMOKE_LOG_DIR=... ./_harness/resource-guard.sh run -- rtk pnpm test:vera-obscura-smoke
 */
import "dotenv/config";
import assert from "node:assert/strict";
import { spawn, type ChildProcess } from "node:child_process";
import { writeFileSync } from "node:fs";
import { join } from "node:path";

import type { Page } from "playwright-core";

import { isObscuraRunning, withObscuraPage } from "../lib/testing/obscura";

// The smoke test writes rows through the app, so it runs only against the disposable local dev database.
if (!/@(127\.0\.0\.1|localhost):55432\//.test(process.env.DATABASE_URL ?? "")) {
  throw new Error("test:vera-obscura-smoke only runs against the local dev database on 127.0.0.1:55432.");
}

const PORT = 5023;
/** How this script reaches the dev server. */
const LOCAL_URL = `http://127.0.0.1:${PORT}`;
/** How the browser reaches it. Obscura runs in Docker on macOS, where the host is host.docker.internal. */
const BROWSER_URL = process.env.VERA_SMOKE_BROWSER_URL ?? `http://host.docker.internal:${PORT}`;
/** Where the full dev-server and browser logs go, when set. */
const LOG_DIR = process.env.VERA_SMOKE_LOG_DIR;

/** The sample text the dev stand-in streams, from lib/vera/dev-model.ts. */
const MOCK_ANSWER = "Ini jawaban contoh dari mode uji lokal.";
/** The title the stand-in gives a session. The first answer saves it in after(). */
const MOCK_TITLE = "Percakapan uji lokal";
const RENAMED_TITLE = "Smoke test Vera";

const devLog: string[] = [];
const browserLog: string[] = [];

function startDevServer() {
  // The dev server gets the mock model and the local database. NODE_OPTIONS is dropped, since the unit-test scripts set it to react-server.
  const env: NodeJS.ProcessEnv = { ...process.env, VERA_MOCK_MODEL: "1", DATABASE_URL: process.env.DATABASE_URL };
  delete env.NODE_OPTIONS;
  // A process group, so stopping the server also stops the pnpm, Next and worker processes it started.
  const child = spawn("pnpm", ["dev", "--hostname", "0.0.0.0"], { env, detached: true, stdio: ["ignore", "pipe", "pipe"] });
  const keep = (chunk: Buffer) => {
    devLog.push(chunk.toString());
  };
  child.stdout?.on("data", keep);
  child.stderr?.on("data", keep);
  return child;
}

async function waitUntilServing(child: ChildProcess) {
  const deadline = Date.now() + 5 * 60_000;
  while (Date.now() < deadline) {
    if (child.exitCode !== null) throw new Error(`The dev server exited with code ${child.exitCode}.`);
    try {
      const response = await fetch(`${LOCAL_URL}/login`, { signal: AbortSignal.timeout(120_000) });
      if (response.ok) break;
    } catch {
      // Not listening yet, or still compiling the first request.
    }
    await new Promise((resolve) => setTimeout(resolve, 2_000));
    if (Date.now() >= deadline) throw new Error("The dev server did not answer on /login within five minutes.");
  }
  // Compile the pages the browser will open first, so the browser's own waits are not spent on compilation.
  for (const path of ["/dashboard", "/vera-ai"]) {
    await fetch(`${LOCAL_URL}${path}`, { redirect: "manual", signal: AbortSignal.timeout(180_000) }).catch(() => undefined);
  }
}

async function stopDevServer(child: ChildProcess) {
  if (child.pid === undefined || child.exitCode !== null) return;
  const group = -child.pid;
  process.kill(group, "SIGTERM");
  await new Promise<void>((resolve) => {
    const timer = setTimeout(() => {
      try {
        process.kill(group, "SIGKILL");
      } catch {
        // The group is already gone.
      }
      resolve();
    }, 15_000);
    child.once("exit", () => {
      clearTimeout(timer);
      resolve();
    });
  });
}

/** Records what the browser reports: console errors, page errors, failed requests, and every login-related or failing response. */
function watchBrowser(page: Page) {
  page.on("console", (message) => {
    if (message.type() === "error" || message.type() === "warning") {
      browserLog.push(`[console ${message.type()}] ${message.text()}\n`);
    }
  });
  page.on("pageerror", (error) => browserLog.push(`[pageerror] ${error.message}\n`));
  page.on("requestfailed", (request) => browserLog.push(`[requestfailed] ${request.method()} ${request.url()}\n`));
  page.on("response", (response) => {
    const url = response.url();
    if (response.status() >= 400 || url.includes("/login")) {
      browserLog.push(`[response ${response.status()}] ${response.request().method()} ${url}\n`);
    }
  });
}

/** What the page looks like now, with cookie names but never cookie values. */
async function describePage(page: Page) {
  const cookies = await page.context().cookies();
  const text = await page.locator("body").innerText({ timeout: 5_000 }).catch(() => "");
  return `url=${page.url()} cookies=${cookies.map((cookie) => cookie.name).join(",") || "none"} body="${text.slice(0, 400).replace(/\s+/g, " ")}"`;
}

async function logIn(page: Page) {
  try {
    await page.goto(`${BROWSER_URL}/login`, { waitUntil: "load", timeout: 180_000 });
    await page.fill('input[type="email"]', "student@vecalss.local");
    await page.fill('input[type="password"]', "Student12345!");
    await page.click('button[type="submit"]');
    await page.waitForURL(/\/dashboard/, { timeout: 120_000 });
  } catch (error) {
    throw new Error(`Login did not reach /dashboard: ${(error as Error).message.split("\n")[0]} | ${await describePage(page)}`);
  }
}

async function runBrowserChecks() {
  await withObscuraPage(async (page: Page) => {
    watchBrowser(page);
    await logIn(page);
    await page.goto(`${BROWSER_URL}/vera-ai?c=new`, { waitUntil: "domcontentloaded", timeout: 120_000 });
    const composer = page.getByLabel("Tulis pertanyaan untuk Vera");
    await composer.waitFor({ timeout: 120_000 });

    // 1. A message streams its answer, and the answer shows what it cost.
    const sawStop = page
      .getByRole("button", { name: "Hentikan jawaban" })
      .waitFor({ state: "visible", timeout: 60_000 })
      .then(() => true, () => false);
    await composer.fill("Jelaskan cara membaca hasil Kuis saya.");
    await page.getByRole("button", { name: "Kirim pesan" }).click();
    await page.getByText(MOCK_ANSWER).waitFor({ timeout: 120_000 });
    assert.equal(await sawStop, true, "The answer streams: the stop control shows while it is being written");
    await page.getByText(/\d+,\d kredit/).first().waitFor({ timeout: 30_000 });

    // 2. The first answer names the session on the server. After a reload, the conversation list in the right panel lists that name.
    await page.reload({ waitUntil: "domcontentloaded" });
    await page.getByText(MOCK_TITLE).first().waitFor({ timeout: 30_000 });

    // 3. Typing @ opens the source menu.
    await composer.fill("@");
    await page.getByRole("listbox", { name: "Sumber Vera" }).waitFor({ timeout: 15_000 });
    await page.keyboard.press("Escape");
    await composer.fill("");

    // 4. A Studio card sends its request into the chat. The answer is saved as a document, its card says so, and its button opens the document.
    // "Sesi baru" opens the start screen, and its Analisis Kelemahan card opens the options.
    await page.getByRole("button", { name: "Sesi baru" }).click();
    await page.getByRole("button", { name: "Analisis Kelemahan" }).click();
    await page.getByRole("button", { name: "Buat" }).click();
    await page.getByText("Tersimpan", { exact: true }).waitFor({ timeout: 120_000 });
    await page.getByRole("button", { name: "Buka dokumen", exact: true }).click();
    await page.getByRole("dialog").getByText("Analisis Kelemahan", { exact: true }).waitFor({ timeout: 30_000 });
    await page.keyboard.press("Escape");

    // 5. The session can be renamed from its row menu in the conversation list.
    await page.locator("li", { hasText: MOCK_TITLE }).getByRole("button", { name: "Opsi percakapan" }).click();
    await page.getByText("Ganti nama").click();
    const nameInput = page.getByLabel("Nama sesi");
    await nameInput.fill(RENAMED_TITLE);
    await nameInput.press("Enter");
    await page.getByText(RENAMED_TITLE).first().waitFor({ timeout: 15_000 });
  });
}

async function main() {
  if (!(await isObscuraRunning())) {
    throw new Error(
      "Obscura is not serving CDP. Start it first (docs/agent-obscura-guide.md), and set OBSCURA_CDP_TOKEN if the server requires one.",
    );
  }
  const child = startDevServer();
  try {
    await waitUntilServing(child);
    await runBrowserChecks();
    console.log(
      "Vera Obscura smoke passed: streamed answer, credit footer, @ menu, saved session title, saved Studio document, session rename.",
    );
  } catch (error) {
    const lines = devLog.join("").split("\n").filter((line) => /Blocked|cross-origin|403|error|warn/i.test(line));
    console.error(`Dev-server lines of interest:\n${lines.slice(-30).join("\n")}`);
    throw error;
  } finally {
    await stopDevServer(child);
    if (LOG_DIR) {
      writeFileSync(join(LOG_DIR, "dev-server.log"), devLog.join(""));
      writeFileSync(join(LOG_DIR, "browser.log"), browserLog.join(""));
    }
  }
}

await main();
