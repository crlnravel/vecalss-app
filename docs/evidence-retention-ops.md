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

   Reusing a login that already exists is checked first. If it is a member of any
   role other than `vecalss_runtime` (above all `vecalss_retention`), or owns any
   table or other object, the script lists that and changes nothing, not even the
   password. `--revoke-extra` removes extra role memberships; it never moves
   ownership, so a login that owns something needs a new name. At the end the
   script connects as the login and runs `retention_role_check()`; it reports
   success only when that passes. Before the migrations exist the check cannot
   run, and the script says so: run it again after migrating.
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

A database that has no `environment_marks` table at all is **not** treated as
unmarked, because a merchant database whose table was dropped would look the same.
On this machine (a loopback host) such a database can still be reset. Anywhere else
the reset refuses, unless the owner is sure it is a throwaway database and says so,
naming it: `ALLOW_RESET_WITHOUT_MARK=<database name> pnpm db:reset`. The override
never beats a mark.

## Adding a table later

A new table starts with **no access for the app's role**: there are no default
privileges for future tables (MS-19). The migration that creates it must finish
with `SELECT public.retention_apply_runtime_grants();`, which gives an ordinary
table full read and write, and an evidence table only what its registry row allows.
If the table holds evidence, add it to `evidence_tables` in the same migration
first, with the columns the runtime may UPDATE.

The helper refuses to run while a table whose name starts with `payment_`,
`refund_`, `risk_`, `fraud_`, `retention_`, `receipt_`, `fulfillment_`, `dispute_`,
`billing_`, `legal_`, `environment_` or `checkout_` is neither in `evidence_tables`
nor on its short reviewed list of ordinary tables (`billing_accounts`,
`risk_flags`). So a forgotten registration stops the migration instead of opening
the table. `pnpm test:retention-roles` enforces the same rule for every table in
the schema and the database.

## Changing a period

Add a new register version in a migration (never edit version 1). The financial
floor of 6 calendar months is enforced by the table. The maintenance functions
use the newest version the next time they run. Start events live in the functions
and in the `start_rule` text; changing a start event is a code review, not a
data change.

## Holds

Place a hold on the order page (`/admin/fraud/orders/<id>`), as the owner with the
second factor and a written reason. A hold on an order, a buyer or a case stops
the scrub and the delete until it is released.

The app cannot release a hold. Only the owner can, on the owner's database login,
from the owner's computer:

```sh
pnpm retention:release-hold -- --hold <hold id> --reason "<why, 10 to 500 characters>"
```

The command connects with `MIGRATE_DATABASE_URL` (else `DATABASE_URL`), records
the `FRAUD_OWNER_EMAIL` account as the one who released it, writes an audit row,
and refuses to run if the connected role is the app's runtime login. A release is
one-way; to hold the same thing again, place a new hold. The order page lists each
open hold with the hold id and this command.

Whenever a retention run scrubs or deletes anything, the daily job emails
`MAINTENANCE_ALERT_EMAIL` with the counts per class (never record contents), so an
unexpected deletion is noticed the day it happens.

## Things to know

- **Registration consent (MS-21).** `registration_consents` is a registered evidence table
  (class `registration_consent`): the app can add rows and never change or remove them. It has
  no retention rule yet, because the owner has not decided how long it is kept once an account is
  gone, and an unlisted class is kept, never deleted. Add a rule in a new register version when
  that is decided. Unverified signups never reach this table: they are deleted by the daily job
  after 7 days, with their verification links. Signup attempts (`registration_attempts`) are a
  security log, removed after 90 days with the others.
- **Refund approval and transfer authorization.** Owner-only approval and
  second-factor verification are enforced by the application, not by the
  database. The database checks refund-state consistency, the balance cap,
  eligibility and the required history event, but it cannot verify the owner's
  identity or second factor. Someone with the runtime database credential could
  fabricate an approval or manual-transfer confirmation that satisfies those
  checks. The daily owner summary lists counts and case references for recent
  approvals, completions and confirmed manual transfers so unexpected actions
  can be noticed.
- What a compromised app can and cannot do (the threat model). The app's runtime
  login can **place** holds, and it can call the cleanup functions, which only act
  on records already past their period (12 months for IP and device data, 2 years
  for cases, 10 years for financial records) and not under a hold. It **cannot
  release a hold**, because it has no UPDATE on the release columns, so it cannot
  defeat a hold the owner placed. Placing a hold needs no database proof of who
  the owner is; the owner-only rule for placing is enforced in the application,
  like the other owner actions, so a compromised app can place holds that the
  owner then has to release. The owner's own login can do everything the
  migration role can, and is not restricted by this design.
- The delete path also removes the `package_purchases` summary and the checkout
  intent of an expired order family, and nothing else outside it: users, the
  access ledger and `audit_logs` stay.
- 10 years is the G4 decision and still needs the accountant's confirmation.
