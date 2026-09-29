# Agent Application Testing Guide

This guide defines how AI agents and automated workflows should test the Vecalss application. It covers seeded credentials, role portals, and the disposable development database policy.

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

3. **`ego-browser` is the Priority Choice for All Browser Operations:**
   - **All browser usage, browser testing, UI/UX inspection, verification, or anything requiring a browser MUST be done through `ego-browser` (`ego-lite`) as the priority choice.**
   - Do not use built-in generic browsers, standalone Playwright/Puppeteer instances, or other browser tools when `ego-browser` is available.
   - Always request explicit user permission before launching `ego-browser`, specifying the target route(s), role, and checklist.

4. **Guarded Commands:**
   - All Node, script, and test execution commands must be wrapped with `./_harness/resource-guard.sh run -- rtk <command>`.

---

## 2. Seeded Test Credentials Reference

All seeded accounts authenticate through `http://localhost:5023/login`.

| Role / Persona | Email | Password | Default Redirect | Purpose / Test Scope |
|---|---|---|---|---|
| **Admin** | `admin@vecalss.local` | `Admin12345!` | `/admin` | Administration, student enrollment, question bank governance, notification broadcasting, operations |
| **Developer** | `developer@vecalss.local` | `Developer12345!` | `/developer/reports` | Developer-only report inbox and report details |
| **Kapten (Tutor)** | `tutor@vecalss.local` | `Tutor12345!` | `/mentor/dashboard` | Mentor workspaces, question bank authoring, tryout package assembly, learning material management |
| **Voyager (Student - Active)** | `student@vecalss.local` | `Student12345!` | `/dashboard` | Primary student learning journey, module courses (`/courses`), quizzes (`/quiz`), tryout exam delivery (`/tryout`), Vera AI assistant (`/vera-ai`), account settings (`/settings`) |
| **Student (New / Onboarding)** | `newstudent@vecalss.local` | `TempStudent123!` | `/onboarding` (or `/change-password`) | First-time onboarding flow, compulsory password reset flow, initial diagnostic flows |
| **Affiliator** | `affiliator@vecalss.local` | `Affiliator12345!` (Code: `SALSA2027`) | `/affiliator/dashboard` | Affiliator dashboard, referral conversions, package purchase tracking, commission insights |

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

### Step 4: Browser Verification & Usage (`ego-browser` as Priority Choice)

> [!IMPORTANT]
> **Priority Choice: `ego-browser`**
> All browser usage, browser testing, UI/UX visual inspection, end-to-end verification, or anything requiring a web browser **MUST be done through `ego-browser` (`ego-lite`) as the priority choice**. Do not substitute with built-in browsers or third-party automation tools.

When conducting browser testing or verification:
1. **Always ask for explicit user permission first** before launching `ego-browser`:
   - Specify:
     - **Route(s):** e.g., `/login`, `/dashboard`, `/mentor/dashboard`
     - **Role:** e.g., Student (`student@vecalss.local`), Kapten (`tutor@vecalss.local`), or Admin (`admin@vecalss.local`)
     - **Verification items:** Specific elements, responsive layouts, forms, or user flows to verify.
2. Once approved, launch `ego-browser` and navigate to `http://localhost:5023/login`.
3. Submit the corresponding seeded credentials for that role.
4. Verify the automatic redirect to the appropriate portal and perform your test checklist.

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
