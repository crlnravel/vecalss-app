# Agent Application Testing Guide

This guide defines how AI agents and automated workflows should test the PTN Pro application. It covers seeded credentials, role portals, and the disposable development database policy.

---

## 1. Core Principles for AI Agents

1. **Login with Seeded Credentials:**
   - Do **not** spend time registering new accounts or inventing ad hoc users for testing.
   - Use the pre-configured seeded credentials detailed below.
   - Every role authenticates via the single `/login` page; the application automatically routes each user to their designated home path via `getDefaultHomePath`.

2. **Development Data is Disposable:**
   - The local development database (`vecalss_dev` on port `55432`) is **ephemeral and 100% disposable**.
   - Agents are explicitly permitted and encouraged to **remove, truncate, delete, reset, or mutate existing data in the development database whenever they want or need to** (e.g., preparing a clean state for test cases, reproducing edge cases, or resetting fixtures).
   - **No backups or snapshots are required:** Do not waste effort creating `.dump` files or archival tables before deleting dev data.
   - Whenever you need to restore the standard baseline data, run `./_harness/resource-guard.sh run -- rtk pnpm db:seed`.

3. **Dual Browser Strategy (`ego-browser` vs `obscura`):**
   - **`ego-browser` (`ego-lite`) for User Interaction:** Dedicated priority choice for browser testing that **requires human/user interaction**, visual inspection with the user, or live review. Always request explicit user permission before launching `ego-browser`, specifying the target route(s), role, and checklist.
   - **`obscura` for Automated & Playwright Testing:** Dedicated headless browser engine for all **automated, headless, and Playwright tests**. Choose Obscura over Chrome/Chromium (`chromium.connectOverCDP('http://127.0.0.1:9222')`). Runs autonomously under the resource guard without requiring user confirmation.
   - Read the complete reference: [`docs/agent-obscura-guide.md`](file:///Users/ravel/Work/Freelance/Vecalss/vecalss-app/docs/agent-obscura-guide.md).

4. **Guarded Commands:**
   - All Node, script, and test execution commands must be wrapped with `./_harness/resource-guard.sh run -- rtk <command>`.

---

## 2. Seeded Test Credentials Reference

All seeded accounts authenticate through `http://localhost:5023/login`.

| Role / Persona | Email | Password | Default Redirect | Purpose / Test Scope |
|---|---|---|---|---|
| **Admin** | `admin@vecalss.local` | `Admin12345!` + verification code (see below) | `/mfa`, then `/admin` | Administration, student enrollment, question bank governance, notification broadcasting, operations |
| **Developer** | `developer@vecalss.local` | `Developer12345!` + verification code (see below) | `/mfa`, then `/developer/reports` | Developer-only report inbox and report details |
| **Kapten (Tutor)** | `tutor@vecalss.local` | `Tutor12345!` | `/mentor/dashboard` | Mentor workspaces, question bank authoring, tryout package assembly, learning material management |
| **Voyager (Student - Active)** | `student@vecalss.local` | `Student12345!` | `/dashboard` | Primary student learning journey, module courses (`/courses`), quizzes (`/quiz`), tryout exam delivery (`/tryout`), Vera AI assistant (`/vera-ai`), account settings (`/settings`) |
| **Student (New / Onboarding)** | `newstudent@vecalss.local` | `TempStudent123!` | `/onboarding` (or `/change-password`) | First-time onboarding flow, compulsory password reset flow, initial diagnostic flows |
| **Affiliator** | `affiliator@vecalss.local` | `Affiliator12345!` (Code: `SALSA2027`) | `/affiliator/dashboard` | Affiliator dashboard, referral conversions, package purchase tracking, commission insights |

### Admin and developer sign-in needs a verification code

Admin and developer accounts require two-step verification. After the password, `/mfa` asks for a 6-digit code; until it is entered the session is signed in but carries no admin or developer role (every guarded page redirects to `/mfa`). A code is asked for again 12 hours after the last one. There is no setting that skips this.

The seeded local admin and developer accounts share a fixed, publicly documented test secret, planted by `pnpm db:seed` only when `DATABASE_URL` points at this machine (the same rule as the default seed passwords). To get the current code:

```bash
./_harness/resource-guard.sh run -- rtk node scripts/mfa-code.mjs          # current code
./_harness/resource-guard.sh run -- rtk node scripts/mfa-code.mjs --next   # the following 30-second code
```

A code works once: use `--next` (or wait for the next 30-second step) if you need a second one right away. Ten fixed recovery codes are also seeded for these accounts: `RC00-SEED-TEST` through `RC09-SEED-TEST` (each works once; `pnpm db:seed` restores them).

Seeding and signing in need the MFA key ring in the environment (`MFA_KEY_RING`, `MFA_ACTIVE_KEY_ID`, see `.env.example`; put them in both `.env` and `.env.local`, because scripts read `.env` and Next.js reads both). Without a usable key ring the seed plants no factor and admin/developer access stays closed. If several worktrees share one local database, they must share the same key ring, or an account sealed by one worktree will not open in another.

The debug account switcher does not skip this: switching to an admin or developer account lands on `/mfa` like a normal sign-in. Tutor, student and affiliator accounts are unaffected.

To enroll or reset a factor (for example to test first-time enrollment), run the operator script, then enter the code it prints at `/mfa`:

```bash
./_harness/resource-guard.sh run -- rtk node scripts/mfa-reset.mjs --email admin@vecalss.local --operator "Your Name" --reason "testing enrollment" --yes
```

This removes the account's factor and recovery codes and signs it out everywhere. Run `pnpm db:seed` afterwards to restore the standard test factor.

### Paid access (built, switched off)

Students can be required to hold a running package before they use the learning pages, actions and Vera. That is controlled by `PAID_ACCESS_ENFORCED` and is **off unless it is set to `1`, `true`, `on` or `yes`**, so nothing changes for students by default. Admins grant, extend, pause, resume and revoke access from the student detail page (`/admin/enrollment/<student id>`, section "Paket belajar"); every change needs a written reason, is recorded in an append-only history and the audit log, and uses database time.

- `student@vecalss.local` is seeded with a running package (`SNBT-INTENSIF-2027`, until 28 Jun 2027), so it keeps access with the switch on. The other seeded students have no package, so with the switch on they land on `/akses-paket`.
- To try the denial locally, start the app with `PAID_ACCESS_ENFORCED=1` and revoke the seeded student's access from the admin page. The history rows stay (they are append-only); restore the account with an `UPDATE billing_accounts ...` back to the seed values.
- Full Access plans need `FULL_ACCESS_ENDS_ON_UTBK` / `FULL_ACCESS_ENDS_ON_MANDIRI` (YYYY-MM-DD). They are not defaulted; the admin form disables those plans until they are set.

### Additional Cohort Students (Multi-User & Leaderboard Tests)

For testing multi-student scenarios, batch rankings, cohorts, and tryout participant states, the following students are also pre-seeded with password `Student12345!`:

| Email | Full Name | Fixture State |
|---|---|---|
| `dimas@vecalss.local` | Dimas Saputra | Completed course progress fixture |
| `leila@vecalss.local` | Leila Maheswari | Second completed course progress fixture |
| `nabila@vecalss.local` | Nabila Putri | Pending status fixture |
| `fajar@vecalss.local` | Fajar Nugroho | Rejected status fixture |
| `salma@vecalss.local` | Salma Maharani | Revoked status fixture |
| `arya@vecalss.local` | Arya Wibowo | Active cohort participant |
| `intan@vecalss.local` | Intan Permata | Active cohort participant |
| `kevin@vecalss.local` | Kevin Halim | Active cohort participant |
| `putri@vecalss.local` | Putri Anggraeni | Active cohort participant |
| `rangga@vecalss.local` | Rangga Maulana | Active cohort participant |
| `syifa@vecalss.local` | Syifa Nuraini | Active cohort participant |

> [!NOTE]
> System preview accounts like `admin-student-preview@vecalss.local` are reserved system fixtures with disabled login (`managed-preview-disabled`) used for admin live preview. Do not attempt direct login on preview fixtures.

---

## 3. Managing the Disposable Dev Database

Agents have full autonomy to clear or restore local data at any time.

### Restoring Fresh Seed Data
To wipe the database schema and regenerate the complete suite of demo accounts, cohorts, learning materials, question banks, and tryouts:

```bash
./_harness/resource-guard.sh run -- rtk pnpm db:seed
```
*(This automatically runs `pnpm db:reset` followed by `node prisma/seed.mjs`)*

### Wiping All Data (Clean Slate)
To completely reset migrations and empty all tables:

```bash
./_harness/resource-guard.sh run -- rtk pnpm db:reset
```

### Removing Specific Existing Data During Tests
When writing or executing tests, you do not need to preserve existing records in `vecalss_dev`. You may freely execute targeted deletions via Prisma scripts or SQL queries:

```ts
// Example: Removing existing test data before running an assertion
await prisma.packagePurchase.deleteMany({});
await prisma.quizAttempt.deleteMany({ where: { studentId } });
```

### Dedicated Integration Test Database (`vera_test`)
For isolated integration test suites (such as Vera AI tests), use the dedicated disposable database preconfigured in Docker Compose:
- Database URL: `postgresql://vecalss:vecalss@127.0.0.1:55432/vera_test?schema=public`
- Redis URL: `redis://127.0.0.1:56379/15`

---

## Email (password reset)

`/forgot-password` sends the reset link by email through Resend (`lib/email/`). Outside production the link is also shown on screen, as before, so you never need an inbox to test a reset.

- Variables (see `.env.example`): `RESEND_API_KEY` (send-only), `EMAIL_FROM`, optional `EMAIL_REPLY_TO`, and for local work `EMAIL_DEV_REDIRECT`.
- Outside production nothing is sent unless `EMAIL_DEV_REDIRECT` is set. When it is, every message goes to that address instead of the real recipient and the subject names the intended one (`[Uji untuk student@vecalss.local] ...`). Seeded `@vecalss.local` accounts can therefore be tested without mailing anyone. Use `delivered@resend.dev` with the default `onboarding@resend.dev` sender; that sender cannot deliver anywhere else.
- Without `RESEND_API_KEY` or `EMAIL_FROM` the request still works; the email is skipped and one log line says why.
- Requests are limited to 3 per email address and 10 per client address in 15 minutes (kept in Postgres). Over the limit, the page shows the same message and sends nothing. To reset while testing: `DELETE FROM password_reset_requests;`.
- The page shows the same message for registered and unregistered addresses. Tests stub `fetch` (`pnpm test:password-reset-email`); they never call Resend.

---

## 4. How to Test the Application

### Step 1: Ensure Local Services Are Running
```bash
# Start PostgreSQL (55432) and Redis (56379)
docker compose -f docker-compose.dev.yml up -d

# Verify services are healthy
docker compose -f docker-compose.dev.yml ps
```

### Step 2: Seed or Reset Database (As Needed)
```bash
./_harness/resource-guard.sh run -- rtk pnpm db:seed
```

### Step 3: Run the Development Server
```bash
./_harness/resource-guard.sh run -- rtk pnpm dev
```
The server runs at `http://localhost:5023`. Note: keep a maximum of one dev server instance running, and shut it down before handoff.

### Step 4: Browser Verification & Testing (Dual Strategy)

#### Option 4A: `ego-browser` (When User Interaction / Live Review is Needed)
> [!IMPORTANT]
> **Requires Explicit User Permission First**
> Use `ego-browser` (`ego-lite`) when verification requires human interaction, live visual inspection with the user, or complex user-driven UI audits.

1. **Always ask for explicit user permission first** before launching `ego-browser`:
   - Specify:
     - **Route(s):** e.g., `/login`, `/dashboard`, `/mentor/dashboard`
     - **Role:** e.g., Student (`student@vecalss.local`), Kapten (`tutor@vecalss.local`), or Admin (`admin@vecalss.local`)
     - **Verification items:** Specific elements, responsive layouts, forms, or user flows to verify.
2. Once approved, launch `ego-browser` and navigate to `http://localhost:5023/login`.
3. Submit the corresponding seeded credentials for that role.
4. Verify the automatic redirect to the appropriate portal and perform your test checklist.

#### Option 4B: `obscura` (Automated Headless & Playwright Testing)
> [!TIP]
> **Autonomous Execution**
> Use `obscura` for automated, non-interactive, headless browser testing and Playwright test suites. Obscura is preferred over Chrome/Chromium. No user confirmation is required.

1. Ensure the Obscura server is running:
   ```bash
   rtk pnpm obscura:status
   # If down, start with: pnpm obscura:serve
   ```
2. Run automated browser tests using Playwright connected via CDP (`lib/testing/obscura.ts`):
   ```bash
   ./_harness/resource-guard.sh run -- rtk pnpm test:obscura-smoke
   ```
3. Read [`docs/agent-obscura-guide.md`](file:///Users/ravel/Work/Freelance/Vecalss/vecalss-app/docs/agent-obscura-guide.md) for code recipes, fixtures, and CDP APIs.

### Step 5: Automated Domain Tests
Select the named test script relevant to the feature being tested:
```bash
# Example domain tests:
./_harness/resource-guard.sh run -- rtk pnpm test:materi-resource-contract
./_harness/resource-guard.sh run -- rtk pnpm test:tryout-workflow-projection
./_harness/resource-guard.sh run -- rtk pnpm test:admin-operations
./_harness/resource-guard.sh run -- rtk pnpm test:notifications-db
```

### Step 6: Code Quality & Completion Check
Before declaring completion on any feature or fix:
```bash
# Linting
./_harness/resource-guard.sh run -- rtk pnpm lint

# Production build & verification gate
./_harness/resource-guard.sh run -- rtk pnpm verify
```
