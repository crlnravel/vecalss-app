# Obscura Headless Browser Guide for AI Agents

This guide documents how AI agents and automated workflows use **Obscura** within the Vecalss repository. It establishes the division of labor between `ego-browser` and `obscura`, details how to run Playwright tests against Obscura over Chrome DevTools Protocol (CDP), and provides standard operating procedures for automated headless browser testing.

---

## 1. Core Principles & Division of Labor

The Vecalss repository operates under a **dual-browser paradigm**:

| Attribute | `ego-browser` (`ego-lite`) | `obscura` |
|---|---|---|
| **Primary Purpose** | Tests requiring **human/user interaction** | **Automated & headless** testing |
| **Execution Mode** | Interactive Chromium with user context & visual canvas | Headless Rust-based browser engine speaking CDP |
| **Agent Autonomy** | **Requires explicit user permission first** | **Full autonomy** under the resource guard |
| **Permission Details** | Must state route(s), role, and checklist | No user confirmation required to run tests |
| **Playwright Integration** | Human-in-the-loop observation / manual debugging | **Default engine** for Playwright (`connectOverCDP`) |
| **Resource Footprint** | Full browser instance | Ultra-lightweight (instant startup, low memory) |
| **Daemon / Port** | Managed by agent environment | Port `9222` (`ws://127.0.0.1:9222`) |

### When to Use What

1. **Use `ego-browser` when:**
   - The test or verification requires **human/user interaction**, visual inspection with the user, or live review.
   - Verifying visual aesthetics, complex interactive animations, responsive layout polish with the user, or inspecting rich client UI states collaboratively.
   - Testing flows that require user-provided OAuth, two-factor auth, or sensitive third-party interactions.
   - **Mandatory Rule:** Always ask for explicit user permission before launching `ego-browser`, specifying route(s), role, and verification checklist.

2. **Use `obscura` when:**
   - The test is **automated**, **headless**, or running as part of a script, CI pipeline, or regression suite.
   - Running Playwright tests, DOM assertions, API/page contract verifications, crawler checks, or smoke tests.
   - Running background checks while authoring server actions, route handlers, or forms.
   - **Playwright Priority:** **Always choose Obscura over Chrome/Chromium** for automated Playwright testing. Do not launch standalone Chromium instances (`chromium.launch()`); connect to Obscura over CDP (`chromium.connectOverCDP()`).

---

## 2. Obscura Engine Overview & Stack Topology

### What is Obscura?
[Obscura](https://github.com/h4ckf0r0day/obscura) is an open-source, ultra-fast headless browser engine written in Rust:
- **V8 JavaScript Runtime:** Executes modern client-side JavaScript via Google V8 isolates.
- **Chrome DevTools Protocol (CDP):** Exposes standard CDP endpoints over WebSockets (`ws://127.0.0.1:9222`).
- **Resource Efficiency:** Consumes a fraction of the CPU and memory of full headless Chrome, with near-instantaneous startup.
- **Anti-Detection & Stealth:** Built-in TLS fingerprint randomization and tracker blocking (`--stealth`).
- **Private Network Security:** By default, Obscura blocks access to loopback (`localhost`) to prevent SSRF. For local testing against `http://localhost:5023`, the `--allow-private-network` flag (or `OBSCURA_ALLOW_PRIVATE_NETWORK=1`) is strictly required.

### Supported CDP & Playwright Features
- ✓ `page.goto`, `page.reload`, `page.goBack`, `page.goForward`
- ✓ `page.evaluate`, `page.evaluateHandle`
- ✓ `page.click`, `page.type`, `page.fill`, `page.focus`
- ✓ `page.waitForSelector`, `page.waitForFunction`, `page.waitForNavigation`
- ✓ `page.cookies`, `page.setCookie`, `context.cookies`
- ✓ `page.setRequestInterception`, request blocking and header modification
- ✓ `page.screenshot` (viewport, full-page, and element clip)
- ✓ `page.pdf` (raster-backed print output)
- ✗ *Unsupported:* Service workers, `page.video()` (video recording).
- ✗ *Unsupported:* Playwright's proprietary `chromium.connect()` wire protocol (always use `chromium.connectOverCDP()`).

---

## 3. Stack Setup & Execution

### Port and Environment Variables

Defined in `.env.example`:
```env
# Obscura CDP WebSocket endpoint for Playwright tests
OBSCURA_WS_ENDPOINT=ws://127.0.0.1:9222
OBSCURA_PORT=9222
OBSCURA_ALLOW_PRIVATE_NETWORK=1
```

### Option A: Local Binary Execution (Recommended for Dev)

A pre-built native binary can be placed in the project root (`./obscura`). The repository includes a helper runner:

```bash
# Check if Obscura server is running and healthy
pnpm obscura:status

# Start Obscura server (binds 127.0.0.1:9222 with --allow-private-network)
pnpm obscura:serve
```

When started, the daemon logs:
```
[obscura] Server is UP and healthy on ws://127.0.0.1:9222
[obscura] Browser: Chrome/145.0.0.0
[obscura] Protocol: 1.3
[obscura] V8: 14.5.0.0
[obscura] CDP Endpoint: ws://127.0.0.1:9222/devtools/browser
```

### Option B: Docker Compose Service

Obscura is also integrated as a service in `docker-compose.dev.yml`:

```yaml
  obscura:
    image: h4ckf0r0day/obscura:latest
    command: ["serve", "--host", "0.0.0.0", "--port", "9222", "--allow-private-network"]
    ports:
      - "127.0.0.1:9222:9222"
    restart: unless-stopped
```

To manage the Docker container:
```bash
# Start Obscura in Docker Compose alongside Postgres and Redis
docker compose -f docker-compose.dev.yml up -d obscura

# Stop the Obscura container
docker compose -f docker-compose.dev.yml stop obscura
```

> [!NOTE]
> When running Obscura inside Docker, network requests to `http://localhost:5023` from inside the container resolve to the container itself. Use `http://host.docker.internal:5023` or prefer the local binary runner for testing against Next.js on macOS host loopback.

---

## 4. Testing with Playwright & Obscura

The repository provides a shared helper in [`lib/testing/obscura.ts`](file:///Users/ravel/Work/Freelance/Vecalss/vecalss-app/lib/testing/obscura.ts) that handles CDP connection, error diagnostics, and clean context teardown.

### Reusable Helper Overview

```ts
import {
  isObscuraRunning,
  connectObscura,
  withObscuraPage,
  loginWithSeededUser,
} from "@/lib/testing/obscura";
```

### Pattern 1: Scoped Execution with `withObscuraPage`

`withObscuraPage` automatically connects over CDP, allocates a page, and ensures that the page, context, and browser connection are closed when the test completes or errors:

```ts
import assert from "node:assert/strict";
import { withObscuraPage } from "@/lib/testing/obscura";

await withObscuraPage(async (page) => {
  await page.goto("http://localhost:5023/login", { waitUntil: "domcontentloaded" });

  const title = await page.title();
  assert.ok(title.includes("Vecalss"), "Page title should contain Vecalss");

  const emailField = await page.$('input[type="email"]');
  assert.ok(emailField !== null, "Email input should exist");
});
```

### Pattern 2: Authenticated Tests with Seeded Credentials

Combine Obscura with `loginWithSeededUser` to test authenticated user flows without registering new accounts:

```ts
import assert from "node:assert/strict";
import { withObscuraPage, loginWithSeededUser } from "@/lib/testing/obscura";

// Test Kapten / Tutor portal flow
await withObscuraPage(async (page) => {
  await loginWithSeededUser(page, "tutor");

  // Verify redirect to mentor dashboard
  assert.ok(page.url().includes("/mentor/dashboard"));

  // Check portal elements
  const heading = await page.textContent("h1");
  assert.ok(heading?.length > 0);
});
```

Available roles in `loginWithSeededUser`:
- `"admin"` (`admin@vecalss.local` → `/admin`)
- `"tutor"` (`tutor@vecalss.local` → `/mentor/dashboard`)
- `"student"` (`student@vecalss.local` → `/dashboard`)
- `"newstudent"` (`newstudent@vecalss.local` → `/onboarding`)
- `"affiliator"` (`affiliator@vecalss.local` → `/affiliator/dashboard`)
- `"developer"` (`developer@vecalss.local` → `/developer/reports`)

### Pattern 3: Direct `playwright-core` CDP Connection

If writing standalone Playwright scripts:

```ts
import { chromium } from "playwright-core";

// 1. Connect over CDP (NOT chromium.connect!)
const browser = await chromium.connectOverCDP(
  process.env.OBSCURA_WS_ENDPOINT || "http://127.0.0.1:9222"
);

// 2. Open context & page
const context = await browser.newContext({ viewport: { width: 1280, height: 800 } });
const page = await context.newPage();

// 3. Execute actions
await page.goto("http://localhost:5023/login");
await page.fill('input[type="email"]', "student@vecalss.local");
await page.fill('input[type="password"]', "Student12345!");
await page.click('button[type="submit"]');

// 4. Teardown
await context.close();
await browser.close();
```

---

## 5. Standard Operating Procedure (SOP) for Agents

When an agent needs to perform testing or verification, follow these steps:

```
[Need to test application]
         │
         ▼
Does the test need USER interaction
or collaborative visual audit?
    ├── YES ──► Request user permission ──► Launch ego-browser
    │           (Route, Role, Checklist)
    │
    └── NO  ──► Choose OBSCURA (Autonomous, no confirmation needed)
                │
                ▼
         Check if Obscura is UP:
         rtk pnpm obscura:status
                ├── UP   ──► Proceed to test
                └── DOWN ──► Start daemon: pnpm obscura:serve (background)
                │
                ▼
         Run test via Resource Guard:
         ./_harness/resource-guard.sh run -- rtk pnpm <test-script>
                │
                ▼
         Clean up background daemons before handoff
```

### Running the Smoke Test

To verify that Obscura and Playwright are properly connected to the local Next.js server:

```bash
# 1. Verify Next.js dev server is running on port 5023
curl -sI http://localhost:5023/login

# 2. Check Obscura status (or start if down)
rtk pnpm obscura:status

# 3. Run the guarded smoke test
./_harness/resource-guard.sh run -- rtk pnpm test:obscura-smoke
```

---

## 6. Troubleshooting & Common Pitfalls

### 1. `Connection refused (127.0.0.1:9222)`
- **Cause:** Obscura server is not running.
- **Fix:** Start it with `pnpm obscura:serve` or `docker compose -f docker-compose.dev.yml up -d obscura`. Verify with `pnpm obscura:status`.

### 2. `403 Forbidden` / Localhost Blocked
- **Cause:** Obscura blocks loopback and private network fetches by default as an SSRF prevention measure.
- **Fix:** Ensure `--allow-private-network` is supplied to `obscura serve`, or set `OBSCURA_ALLOW_PRIVATE_NETWORK=1`. The `pnpm obscura:serve` script enables this automatically.

### 3. Using `chromium.connect()` Instead of `connectOverCDP()`
- **Error:** Connection hangs or fails with handshake error.
- **Cause:** `chromium.connect()` speaks Playwright's custom protocol. Obscura implements standard Chrome DevTools Protocol.
- **Fix:** Always use `chromium.connectOverCDP()`.

### 4. Attempting `page.video()`
- **Error:** Video recording is not supported in Obscura.
- **Fix:** Do not pass `recordVideo` in `browser.newContext()` options. Use `page.screenshot()` for visual evidence.

### 5. Running Standalone Chrome Alongside Obscura
- **Rule:** Do not launch headless Chrome/Chromium binaries via Playwright when Obscura is available. Obscura is lighter, uses less host memory, and preserves system resources under the repository resource guard.
