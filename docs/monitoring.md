# Monitoring

Vecalss has three internal checks. An external uptime service watches the production readiness route.

| Route | Who calls it | What it returns |
| --- | --- | --- |
| `/api/health` | Container health checks | `{ "ok": true }`. Fast, with no instance details. |
| `/api/health/ready` | External uptime service | `{ "database": "up" \| "down", "redis": "up" \| "down" }`. HTTP 200 when both are up, 503 otherwise. Each check waits at most 2 seconds. |
| `/api/cron/daily-maintenance` | Vercel cron, once a day | The daily job (see below). It needs `Authorization: Bearer <CRON_SECRET>`. |

### External uptime service settings

- **URL to watch:** `https://<production-domain>/api/health/ready`
- **Interval:** every 1 to 5 minutes.
- **Alert:** email to the owner's address, which is the same address as `MAINTENANCE_ALERT_EMAIL`.
- **Expected response:** HTTP 200. Anything else counts as down.

Set up the uptime account yourself. The app does not create it.

### Daily maintenance job

Vercel runs the job at 19:00 UTC, which is 02:00 WIB. Hobby allows one cron run per day.

Each run does these things:

1. Checks the database and Redis, with the same up/down results as the readiness route.
2. Deletes security logs older than 90 days: login attempts, password-reset requests, MFA failed attempts, and sessions that ended or expired. It works in bounded batches and never touches `audit_logs`.
3. Counts edit leases that expired more than a day ago and were never released. The count is only reported.
4. Payments: resolves orders still open past their 15-minute payment window by asking the payment provider for the payment's status, then works through the payment outbox (alerts and receipts that did not go out right after the request). Both steps are safe to repeat. If this step fails, the owner is emailed like any other failure.

5. Evidence retention (MS-10): scrubs IP and device evidence past 12 months and deletes order families, cases, blocks and intents past their periods, never anything under a hold or still needed by a retained row. It works in bounded batches through functions owned by a separate role and writes one row per class to `retention_runs`. A row it could not remove counts as a failure.
6. Production role check (only when `NODE_ENV=production`): asks the database whether the connected role can alter schema or delete evidence, and emails the owner with what it found if so. Details: [evidence-retention-ops.md](./evidence-retention-ops.md).

Steps 5 and 6 run last, and each fails on its own, so a problem there never stops the steps above.

If any step fails, the owner gets one email per day and failure set. The email lists the failed steps and contains no error text. Outside production the mailer's `EMAIL_DEV_REDIRECT` rule applies.

### Environment variables

- `CRON_SECRET`: the bearer token Vercel sends to the cron route. If it is unset, the route refuses every request.
- `MAINTENANCE_ALERT_EMAIL`: the owner's address for failure emails.
- `MIGRATE_DATABASE_URL`: the schema owner's connection string, used by `prisma migrate deploy`; falls back to `DATABASE_URL`. In production `DATABASE_URL` is the restricted login (see [evidence-retention-ops.md](./evidence-retention-ops.md)).
