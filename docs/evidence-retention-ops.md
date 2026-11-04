# Evidence retention: operations note

For the owner. The design is in [`payments.md`](./payments.md#evidence-retention-and-immutability-ms-10-phase-a).
Production does not exist yet; these are the steps for when it does (and for
Neon staging if it should be tested there first). Nothing here needs a password
in a migration, in git, or in chat.

## What has to exist

- Two NOLOGIN roles, `vecalss_retention` (owns the maintenance functions) and
  `vecalss_runtime` (holds the app's privileges). The migration creates them when
  the migration user can create roles (the Neon default owner can). If it cannot,
  `scripts/setup-runtime-role.mjs` creates them first.
- One login role for the app, a member of `vecalss_runtime` only.
- Vercel's `DATABASE_URL` pointing at that login, and `MIGRATE_DATABASE_URL` kept
  on the schema owner for `prisma migrate deploy`.

## Create the login on Neon, then switch Vercel

1. Apply the migrations as the owner, as today (`prisma migrate deploy`, direct
   connection, `MIGRATE_DATABASE_URL` or `DATABASE_URL`). Migration
   `20261106090000_evidence_retention` creates the roles, tables, functions and
   grants. It works for a non-superuser owner: the owner is made a member of
   `vecalss_retention` so it can hand the functions over, and nothing in it needs
   superuser. If Neon refuses `CREATE ROLE` for the owner, run step 2's script
   first.
2. Choose a long random password (at least 24 characters) and keep it in your
   password manager. Run, on your machine, with the owner's connection string:

   ```sh
   RUNTIME_DB_PASSWORD='<the password>' pnpm db:setup-runtime-role -- --login vecalss_app --yes
   ```

   Without `--yes` it only says what it would do. It never prints the password,
   and it prints the connection string with the password left out.
3. Build the app's connection string from that output, put the password in, and
   set it as `DATABASE_URL` in Vercel (Production). Use Neon's pooled host for the
   app, as before. Set `MIGRATE_DATABASE_URL` to the owner's direct connection
   wherever migrations run.
4. Redeploy. The next daily maintenance run checks the connected role (only when
   `NODE_ENV=production`) and emails `MAINTENANCE_ALERT_EMAIL` if it can alter
   schema or delete evidence. No email means the role passed.
5. Rotate the password by running step 2 again and updating Vercel.

Neon may not allow some `GRANT` or `ALTER FUNCTION ... OWNER` forms for a
non-superuser owner. If the migration stops on one, send the exact error; do not
change roles by hand. This was designed and tested on a local superuser, so the
non-superuser path still needs a first real run on Neon staging.

## Mark the environment at go-live

When the database holds real merchant data, once:

```sh
pnpm env:mark-merchant -- --database <the database name> --note "Peluncuran produksi" --yes
```

It runs as the schema owner and refuses unless `--database` matches the database
it would mark. After that `db:reset`, `db:seed`, the seed scripts and the cleanup
scripts refuse to run there. The mark is a single append-only row: nothing in the
product can change or remove it, and only a deliberate owner act in SQL (disabling
its trigger) can. Do not mark staging or local databases.

## Adding a table later

A new table works for the app straight away. If it holds evidence, add it to
`evidence_tables` in the same migration (with the columns the runtime may
UPDATE) and finish with `SELECT public.retention_apply_runtime_grants();`.
`pnpm test:retention-roles` fails when a table with an immutability trigger or a
payment-evidence name is missing from the registry.

## Changing a period

Add a new register version in a migration (never edit version 1). The financial
floor of 6 calendar months is enforced by the table. The maintenance functions
use the newest version the next time they run. Start events live in the functions
and in the `start_rule` text; changing a start event is a code review, not a
data change.

## Holds

Place and release holds on the order page (`/admin/fraud/orders/<id>`), as the
owner with the second factor and a written reason. A hold on an order, a buyer or
a case stops the scrub and the delete until released.

## Things to know

- The database cannot tell who the owner is. Anything connected as the app's role
  could write a hold row directly; the owner-only rule is enforced in the
  application, like the other owner actions.
- The delete path also removes the `package_purchases` summary and the checkout
  intent of an expired order family, and nothing else outside it: users, the
  access ledger and `audit_logs` stay.
- 10 years is the G4 decision and still needs the accountant's confirmation.
