/**
 * Headless smoke test for the Vera workspace, driven through Obscura as the Voyager (student) account. The whole run is one guarded
 * command: the dev server starts here with VERA_MOCK_MODEL=1, the browser checks run against it, and the server stops before the
 * command exits. Obscura must already be serving CDP. Set OBSCURA_CDP_TOKEN when the server requires one.
 *
 * Usage:
 *   OBSCURA_CDP_TOKEN=... ./_harness/resource-guard.sh run -- rtk pnpm test:vera-obscura-smoke
 */
import "dotenv/config";
import assert from "node:assert/strict";
import { spawn, type ChildProcess } from "node:child_process";

import type { Page } from "playwright-core";

import { isObscuraRunning, loginWithSeededUser, withObscuraPage } from "../lib/testing/obscura";

// The smoke test writes rows through the app, so it runs only against the disposable local dev database.
if (!/@(127\.0\.0\.1|localhost):55432\//.test(process.env.DATABASE_URL ?? "")) {
  throw new Error("test:vera-obscura-smoke only runs against the local dev database on 127.0.0.1:55432.");
}

const PORT = 5023;
/** How this script reaches the dev server. */
const LOCAL_URL = `http://127.0.0.1:${PORT}`;
/** How the browser reaches it. Obscura runs in Docker on macOS, where the host is host.docker.internal. */
const BROWSER_URL = process.env.VERA_SMOKE_BROWSER_URL ?? `http://host.docker.internal:${PORT}`;

/** The sample text the dev stand-in streams, from lib/vera/dev-model.ts. */
const MOCK_ANSWER = "Ini jawaban contoh dari mode uji lokal.";
/** The title the stand-in gives a session. The first answer saves it in after(). */
const MOCK_TITLE = "Percakapan uji lokal";
const RENAMED_TITLE = "Smoke test Vera";

function startDevServer() {
  // The dev server gets the mock model and the local database. NODE_OPTIONS is dropped, since the unit-test scripts set it to react-server.
  const env: NodeJS.ProcessEnv = { ...process.env, VERA_MOCK_MODEL: "1", DATABASE_URL: process.env.DATABASE_URL };
  delete env.NODE_OPTIONS;
  // A process group, so stopping the server also stops the pnpm, Next and worker processes it started.
  const child = spawn("pnpm", ["dev", "--hostname", "0.0.0.0"], { env, detached: true, stdio: ["ignore", "pipe", "pipe"] });
  const log: string[] = [];
  const keep = (chunk: Buffer) => {
    log.push(chunk.toString());
    if (log.length > 400) log.splice(0, log.length - 400);
  };
  child.stdout?.on("data", keep);
  child.stderr?.on("data", keep);
  return { child, log };
}

async function waitUntilServing(child: ChildProcess) {
  const deadline = Date.now() + 5 * 60_000;
  while (Date.now() < deadline) {
    if (child.exitCode !== null) throw new Error(`The dev server exited with code ${child.exitCode}.`);
    try {
      const response = await fetch(`${LOCAL_URL}/login`, { signal: AbortSignal.timeout(120_000) });
      if (response.ok) return;
    } catch {
      // Not listening yet, or still compiling the first request.
    }
    await new Promise((resolve) => setTimeout(resolve, 2_000));
  }
  throw new Error("The dev server did not answer on /login within five minutes.");
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

async function runBrowserChecks() {
  await withObscuraPage(async (page: Page) => {
    await loginWithSeededUser(page, "student", BROWSER_URL);
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

    // 2. The first answer names the session on the server. After a reload, the sidebar shows that name.
    await page.reload({ waitUntil: "domcontentloaded" });
    await page.getByText(MOCK_TITLE).first().waitFor({ timeout: 30_000 });

    // 3. Typing @ opens the source menu.
    await composer.fill("@");
    await page.getByRole("listbox", { name: "Sumber Vera" }).waitFor({ timeout: 15_000 });
    await page.keyboard.press("Escape");
    await composer.fill("");

    // 4. A Studio run saves a document, and the list shows it.
    await page.getByRole("tab", { name: "Studio" }).click();
    const cards = page.locator('ul[aria-label="Dokumen tersimpan"] > li');
    const before = await cards.count();
    await page.getByRole("button", { name: "Buat" }).first().click();
    await page.getByText("Dokumen tersimpan. Lihat di daftar di bawah.").waitFor({ timeout: 120_000 });
    assert.equal(await cards.count(), before + 1, "The Studio run adds one saved document to the list");

    // 5. The session can be renamed from the sidebar.
    await page.getByRole("tab", { name: "Chat" }).click();
    await page.getByRole("button", { name: `Aksi untuk sesi ${MOCK_TITLE}` }).click();
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
  const { child, log } = startDevServer();
  try {
    await waitUntilServing(child);
    await runBrowserChecks();
    console.log(
      "Vera Obscura smoke passed: streamed answer, credit footer, @ menu, saved session title, saved Studio document, session rename.",
    );
  } catch (error) {
    console.error(log.join("").split("\n").slice(-40).join("\n"));
    throw error;
  } finally {
    await stopDevServer(child);
  }
}

await main();
