# Database and Environment Guide for AI Agents

This guide documents the database and runtime environments available in the Vecalss repository, specifically designed for AI agents and developers.

---

## 1. Environment Topology Overview

The project operates under a pre-release model with three defined tiers:

| Environment | Database Provider | Redis Provider | Status | Data Sensitivity | Agent Data Retrieval |
|---|---|---|---|---|---|
| **Local (dev)** | Docker Compose (`postgres:16-alpine`) | Docker Compose (`redis:7-alpine`) | **Active** | Synthetic fixtures / Demo seed | **Allowed** (full access) |
| **Staging** | **Neon** (Serverless PostgreSQL) | Hosted / Cloud Redis (or local test redis) | **Active (Disposable)** | Non-sensitive staging data (disposable) | **Allowed** (safe to retrieve) |
| **Production** | *Not provisioned* | *Not provisioned* | **Not Available** | N/A | **N/A (Fail closed)** |

---

## 2. Local Environment (`dev`)

The local environment is containerized using Docker Compose. All local development, unit tests, contract checks, and schema authoring target this stack.

### Docker Compose Services

Defined in `docker-compose.dev.yml`:
- **PostgreSQL**: `postgres:16-alpine`
  - Host Port: `55432` (internal `5432`)
  - Primary Database: `vecalss_dev`
  - User / Password: `vecalss` / `vecalss`
  - Initialization: Automatically runs `docker/postgres/init/00-create-vera-test.sql` to provision the `vera_test` disposable database for integration tests.
  - Healthcheck: `pg_isready -U vecalss -d vecalss_dev`
- **Redis**: `redis:7-alpine`
  - Host Port: `56379` (internal `6379`)
  - Appendonly persistence enabled.
  - Healthcheck: `redis-cli ping`

### Managing Docker Containers

```bash
# Start local DB and Redis in the background
docker compose -f docker-compose.dev.yml up -d

# Check service status and health
docker compose -f docker-compose.dev.yml ps

# Stop local services
docker compose -f docker-compose.dev.yml down
```

### Local Environment Variables (`.env.local` / `.env`)

```env
DATABASE_URL=postgresql://vecalss:vecalss@127.0.0.1:55432/vecalss_dev?schema=public
REDIS_URL=redis://127.0.0.1:56379/0

# Dedicated disposable database for Vera integration tests
VERA_DISPOSABLE_DATABASE_URL=postgresql://vecalss:vecalss@127.0.0.1:55432/vera_test?schema=public
VERA_DISPOSABLE_REDIS_URL=redis://127.0.0.1:56379/15
VERA_DISPOSABLE_DB_ACK=1
```

### Local Database Policy (Pre-Release Phase)

- **Disposable & Ephemeral:** Local database state can be reset and reseeded at any time.
- **No Backups Required:** Do not create manual snapshots, dump files (`.dump`), or legacy table preservation bridges.
- **Reset & Seed Routine:**
  ```bash
  # Reset schema and reseed standard demo accounts/fixtures
  ./_harness/resource-guard.sh run -- rtk pnpm db:reset
  ./_harness/resource-guard.sh run -- rtk pnpm db:seed
  ```
- **Authoring Migrations:**
  All new migrations MUST be authored and tested against the local environment:
  ```bash
  ./_harness/resource-guard.sh run -- rtk pnpm exec prisma migrate dev --name <migration_name>
  ./_harness/resource-guard.sh run -- rtk pnpm db:generate
  ```

---

## 3. Staging Environment (`staging`)

The staging environment uses **Neon** (Serverless PostgreSQL at `neon.tech`) for cloud-hosted evaluation and multi-user pre-release testing.

### Key Characteristics

- **Host Platform:** Neon Serverless PostgreSQL.
- **Connection Format:** Standard Neon connection string:
  ```
  postgresql://[user]:[password]@[neon-hostname].neon.tech/[dbname]?sslmode=require
  ```
- **Data Sensitivity:**
  > [!NOTE]
  > **Neon staging does NOT contain sensitive personal information or sensitive PII.**
  > It is populated with pre-release fixtures, test content, and synthetic accounts.

- **Staging Database is Disposable for Now:**
  > [!IMPORTANT]
  > **Even the staging database is disposable for now.**
  > Because the project is in active pre-release development, staging data is purely ephemeral. There is **no requirement to preserve legacy data or create database backups/dumps** for staging. If schema updates or feature iterations require resetting, recreating, or re-seeding staging, that is fully acceptable.

### AI Agent Retrieval & Inspection Policy

- **Retrieval is Fully Permitted:** AI agents **are allowed to inspect, query, fetch, and retrieve data** from the Neon staging database.
- Agents may use Prisma, direct query scripts, or migration status inspectors against Neon staging to:
  1. Inspect the applied schema and verify table states.
  2. Read sample records or taxonomy hierarchies when verifying domain behaviors.
  3. Diagnose data discrepancies or test failures in staging.
- **Precaution:** Avoid committing raw staging connection credentials to git or public documentation. Staging connection strings belong in environment configurations.

### Applying Migrations to Staging

Migrations in staging are deployed forward using Prisma's deployment runner. When evolving schemas, forward migrations are applied cleanly.

```bash
# Check migration status on Staging
DATABASE_URL="<neon-staging-url>" ./_harness/resource-guard.sh run -- rtk pnpm exec prisma migrate status

# Deploy pending migrations forward to Staging
DATABASE_URL="<neon-staging-url>" ./_harness/resource-guard.sh run -- rtk pnpm exec prisma migrate deploy
```

---

## 4. Production Environment (`production`)

> [!WARNING]
> **Production is currently NOT AVAILABLE.**
> Vecalss is in active pre-release development. No production infrastructure, database cluster, or live user store is provisioned.

### Agent Rules for Production:

1. **Fail Closed:** If a command, script, or task refers to "production" database operations, fail closed and notify the user that production is not yet available.
2. **Do Not Synthesize:** Never attempt to connect to, infer credentials for, or execute migrations against an imagined production database.

---

## 5. Summary Matrix for AI Agents

| Task | Local (`dev`) | Staging (`neon`) | Production |
|---|---|---|---|
| **Start Services** | `docker compose -f docker-compose.dev.yml up -d` | Managed by Neon cloud | Not available |
| **Connection String** | `postgresql://vecalss:vecalss@127.0.0.1:55432/vecalss_dev?schema=public` | `postgresql://...neon.tech/...?sslmode=require` | Not available |
| **Agent Can Read/Retrieve Data?** | **Yes** (full access) | **Yes** (non-sensitive, disposable data) | **No** (unprovisioned) |
| **Create New Migrations** | `prisma migrate dev --name <name>` | Prohibited (author locally only) | Not available |
| **Apply Existing Migrations** | Automatic with `migrate dev` or `prisma migrate deploy` | `prisma migrate deploy` | Not available |
| **Reset / Reseed** | `pnpm db:reset` / `pnpm db:seed` | Allowed when needed (disposable for now) | Not available |
| **Resource Guard Requirement** | Mandatory (`./_harness/resource-guard.sh run -- rtk ...`) | Mandatory (`./_harness/resource-guard.sh run -- rtk ...`) | N/A |
