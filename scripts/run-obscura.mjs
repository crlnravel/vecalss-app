#!/usr/bin/env node

/**
 * Obscura Process Runner & Status Checker for Vecalss
 *
 * Usage:
 *   node scripts/run-obscura.mjs [serve|status|stop]
 */

import { spawn, execSync } from "node:child_process";
import { existsSync } from "node:fs";
import { resolve, join } from "node:path";
import http from "node:http";

const ROOT_DIR = resolve(process.cwd());
const LOCAL_BINARY = join(ROOT_DIR, "obscura");
const PORT = parseInt(process.env.OBSCURA_PORT || "9222", 10);
const HOST = process.env.OBSCURA_HOST || "127.0.0.1";
const ALLOW_PRIVATE_NETWORK = process.env.OBSCURA_ALLOW_PRIVATE_NETWORK !== "0";

function resolveObscuraExecutable() {
  if (existsSync(LOCAL_BINARY)) {
    return LOCAL_BINARY;
  }

  try {
    const whichResult = execSync("which obscura", { stdio: ["pipe", "pipe", "ignore"] })
      .toString()
      .trim();
    if (whichResult && existsSync(whichResult)) {
      return whichResult;
    }
  } catch {
    // not in PATH
  }

  return null;
}

async function checkStatus(port = PORT, host = HOST) {
  return new Promise((resolveResult) => {
    const req = http.get(`http://${host}:${port}/json/version`, { timeout: 2000 }, (res) => {
      let data = "";
      res.on("data", (chunk) => (data += chunk));
      res.on("end", () => {
        try {
          const parsed = JSON.parse(data);
          resolveResult({ ok: true, data: parsed });
        } catch {
          resolveResult({ ok: false, error: "Invalid JSON response" });
        }
      });
    });

    req.on("error", (err) => {
      resolveResult({ ok: false, error: err.message });
    });

    req.on("timeout", () => {
      req.destroy();
      resolveResult({ ok: false, error: "Connection timed out" });
    });
  });
}

async function main() {
  const command = process.argv[2] || "serve";

  if (command === "status") {
    const status = await checkStatus();
    if (status.ok) {
      console.log(`[obscura] Server is UP and healthy on ws://${HOST}:${PORT}`);
      console.log(`[obscura] Browser: ${status.data.Browser}`);
      console.log(`[obscura] Protocol: ${status.data["Protocol-Version"]}`);
      console.log(`[obscura] V8: ${status.data["V8-Version"]}`);
      console.log(`[obscura] CDP Endpoint: ${status.data.webSocketDebuggerUrl || `ws://${HOST}:${PORT}`}`);
      process.exit(0);
    } else {
      console.error(`[obscura] Server is NOT running on http://${HOST}:${PORT} (${status.error})`);
      process.exit(1);
    }
  }

  if (command === "serve") {
    // Check if already running
    const existing = await checkStatus();
    if (existing.ok) {
      console.log(`[obscura] A server is already running and healthy on ws://${HOST}:${PORT}`);
      console.log(`[obscura] Browser: ${existing.data.Browser}`);
      process.exit(0);
    }

    const binary = resolveObscuraExecutable();
    if (!binary) {
      console.error("[obscura] Could not find obscura executable!");
      console.error("  1. Checked local root: " + LOCAL_BINARY);
      console.error("  2. Checked system PATH: obscura");
      console.error("\nTo resolve, you can either:");
      console.error("  - Run via Docker: docker compose -f docker-compose.dev.yml up -d obscura");
      console.error("  - Download binary: https://github.com/h4ckf0r0day/obscura/releases");
      process.exit(1);
    }

    const args = ["serve", "--host", HOST, "--port", String(PORT)];
    if (ALLOW_PRIVATE_NETWORK) {
      args.push("--allow-private-network");
    }

    // Forward any additional flags passed after serve
    const extraArgs = process.argv.slice(3);
    args.push(...extraArgs);

    console.log(`[obscura] Launching ${binary} ${args.join(" ")}`);
    const child = spawn(binary, args, {
      stdio: "inherit",
      env: {
        ...process.env,
        OBSCURA_ALLOW_PRIVATE_NETWORK: "1",
      },
    });

    child.on("error", (err) => {
      console.error(`[obscura] Failed to start process:`, err);
      process.exit(1);
    });

    child.on("exit", (code, signal) => {
      if (signal) {
        console.log(`[obscura] Process terminated by signal ${signal}`);
      } else {
        console.log(`[obscura] Process exited with code ${code}`);
      }
      process.exit(code || 0);
    });

    const cleanup = () => {
      if (!child.killed) {
        child.kill("SIGTERM");
      }
    };

    process.on("SIGINT", cleanup);
    process.on("SIGTERM", cleanup);
  }
}

main().catch((err) => {
  console.error("[obscura] Unhandled error:", err);
  process.exit(1);
});
