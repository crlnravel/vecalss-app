import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { randomBytes } from "node:crypto";
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

import pg from "pg";

import {
  assertNotMerchantEnvironment,
  decideReset,
  isLoopbackHost,
  MerchantEnvironmentError,
  MissingMarkTableError,
} from "../lib/retention/environment-guard.mjs";
import { deleteStudentEnrollment } from "../lib/admin/enrollment/service";
import { createRuntimeLogin, ownerClient, ownerQuery, ownerUrl } from "./retention-test-kit";
import { cleanUp, paidOrder, prisma, setupAuthority } from "./refund-test-kit";

/**
 * MS-10 phase A, the reset guard. A database marked as the merchant environment
 * makes db:reset, db:seed, every seed script and the cleanup scripts refuse; an
 * unmarked database (local, staging) behaves as before; the guard fails closed
 * when the mark cannot be read; the mark itself is a single append-only row the
 * runtime role cannot write. User deletion cannot remove or orphan evidence.
 *
 * The mark is permanent, so the scripts are run against a scratch database that
 * this suite creates and drops, never against the dev database. Local only.
 */

const checks: string[] = [];
const pass = (name: string) => checks.push(name);

const ROOT = fileURLToPath(new URL("..", import.meta.url));

function runNode(args: string[], databaseUrl: string, extra: Record<string, string> = {}) {
  const result = spawnSync(process.execPath, args, {
    cwd: ROOT,
    encoding: "utf8",
    env: { ...process.env, DATABASE_URL: databaseUrl, MIGRATE_DATABASE_URL: "", ...extra },
    timeout: 60_000,
  });
  return { output: `${result.stdout}${result.stderr}`, status: result.status };
}

function urlFor(database: string, base = ownerUrl()) {
  const url = new URL(base);
  url.pathname = `/${database}`;
  return url.toString();
}

async function main() {
  const scratch = `retention_guard_${randomBytes(4).toString("hex")}`;
  const marked = `${scratch}_marked`;
  const admin = new pg.Client({ connectionString: urlFor("postgres") });
  await admin.connect();

  try {
    await admin.query(`CREATE DATABASE ${scratch}`);
    await admin.query(`CREATE DATABASE ${marked}`);
    // The same shape as the migration's table, in the scratch databases only.
    for (const database of [marked]) {
      const client = new pg.Client({ connectionString: urlFor(database) });
      await client.connect();
      await client.query(`CREATE TABLE environment_marks (
        id integer NOT NULL DEFAULT 1 PRIMARY KEY, environment varchar(20) NOT NULL, marked_by varchar(120) NOT NULL,
        note varchar(500) NOT NULL, marked_at timestamptz NOT NULL DEFAULT now(),
        CONSTRAINT environment_marks_singleton_check CHECK (id = 1 AND environment = 'merchant'))`);
      await client.end();
    }
    const unmarkedWithTable = `${scratch}_open`;
    await admin.query(`CREATE DATABASE ${unmarkedWithTable}`);
    {
      const client = new pg.Client({ connectionString: urlFor(unmarkedWithTable) });
      await client.connect();
      await client.query(`CREATE TABLE environment_marks (
        id integer NOT NULL DEFAULT 1 PRIMARY KEY, environment varchar(20) NOT NULL, marked_by varchar(120) NOT NULL,
        note varchar(500) NOT NULL, marked_at timestamptz NOT NULL DEFAULT now(),
        CONSTRAINT environment_marks_singleton_check CHECK (id = 1 AND environment = 'merchant'))`);
      await client.end();
    }

    // ---- Unmarked databases behave as before ------------------------------------------------------------------------------------------------
    for (const database of [scratch, unmarkedWithTable, "retention_guard_does_not_exist"]) {
      const result = runNode(["scripts/check-environment-mark.mjs", "db:reset"], urlFor(database));
      assert.equal(result.status, 0, `an unmarked database (${database}) lets the reset start: ${result.output}`);
    }
    const devCheck = runNode(["scripts/check-environment-mark.mjs", "db:reset"], ownerUrl());
    assert.equal(devCheck.status, 0, "the local dev database is not marked, so the normal local flow is unchanged");
    assert.equal((await ownerQuery("SELECT 1 FROM environment_marks")).length, 0, "and this suite never marked it");
    pass("an unmarked database, one without the table yet, and one that does not exist all let the reset start; the local dev database is unmarked");

    // ---- MS-19 H-02: a missing mark table is not an unmarked database, unless the database is on this machine ------------------------------------------
    const remote = "postgresql://owner:pw@ep-merchant-pooler.example.neon.tech/neondb?sslmode=require";
    for (const host of ["127.0.0.1", "localhost", "[::1]", "LOCALHOST"]) assert.equal(isLoopbackHost(`postgresql://u:p@${host}:5432/db`), true, host);
    for (const host of ["ep-x.neon.tech", "10.0.0.5", "127.0.0.1.example.com", "db.internal"]) assert.equal(isLoopbackHost(`postgresql://u:p@${host}/db`), false, host);
    assert.equal(isLoopbackHost("not a url"), false);
    assert.deepEqual(decideReset({ connectionString: urlFor("anything"), env: {}, state: "no_table" }), { allow: true }, "a loopback database with no mark table still resets");
    assert.deepEqual(decideReset({ connectionString: remote, env: {}, state: "unmarked" }), { allow: true }, "a remote database with the table and no row is unmarked");
    assert.deepEqual(decideReset({ connectionString: remote, env: {}, state: "no_database" }), { allow: true }, "a database that does not exist holds nothing");
    assert.equal(decideReset({ connectionString: remote, env: {}, state: "marked" }).allow, false, "a marked database refuses");
    assert.equal(decideReset({ connectionString: urlFor("anything"), env: {}, state: "marked" }).allow, false, "…on this machine too");
    const noTable = decideReset({ connectionString: remote, env: {}, state: "no_table" });
    assert.equal(noTable.allow, false, "a remote database with no mark table refuses");
    assert.equal(noTable.reason, "no_mark_table");
    for (const override of ["", "other_db", "NEONDB", "neondb ", undefined]) {
      const wrong = decideReset({ connectionString: remote, env: { ALLOW_RESET_WITHOUT_MARK: override }, state: "no_table" });
      assert.equal(wrong.allow, override === "neondb ", `override ${JSON.stringify(override)} ${override === "neondb " ? "(trimmed) names the database" : "does not name the database"}`);
    }
    assert.equal(decideReset({ connectionString: remote, env: { ALLOW_RESET_WITHOUT_MARK: "neondb" }, state: "no_table" }).allow, true, "the explicit override that names the database works");
    assert.equal(decideReset({ connectionString: remote, env: { ALLOW_RESET_WITHOUT_MARK: "neondb" }, state: "marked" }).allow, false, "the override never beats a mark");
    // Through the guard itself, with a stand-in reader instead of a connection.
    const readAs = (state: string) => async () => ({ mark: state === "marked" ? { environment: "merchant" } : null, state });
    await assert.rejects(assertNotMerchantEnvironment("db:reset", { DATABASE_URL: remote }, { read: readAs("no_table") }), (error: unknown) => error instanceof MissingMarkTableError && error.message.includes("ALLOW_RESET_WITHOUT_MARK=neondb") && !error.message.includes("pw@"));
    await assertNotMerchantEnvironment("db:reset", { ALLOW_RESET_WITHOUT_MARK: "neondb", DATABASE_URL: remote }, { read: readAs("no_table") });
    await assertNotMerchantEnvironment("db:reset", { DATABASE_URL: urlFor("anything") }, { read: readAs("no_table") });
    await assert.rejects(assertNotMerchantEnvironment("db:reset", { ALLOW_RESET_WITHOUT_MARK: "neondb", DATABASE_URL: remote }, { read: readAs("marked") }), MerchantEnvironmentError);
    // Either connection string is checked, and the override must name each database that lacks the table.
    await assert.rejects(
      assertNotMerchantEnvironment("db:reset", { ALLOW_RESET_WITHOUT_MARK: "neondb", DATABASE_URL: urlFor("local_one"), MIGRATE_DATABASE_URL: remote.replace("/neondb", "/other") }, { read: readAs("no_table") }),
      MissingMarkTableError,
    );
    await assert.rejects(assertNotMerchantEnvironment("db:reset", { DATABASE_URL: remote }, { read: async () => { throw new Error("boom"); } }), /could not be read/u, "still fails closed when the read fails");
    // Driven through the script with a database that cannot be reached: it refuses and never prints the connection string.
    const fake = runNode(["scripts/check-environment-mark.mjs", "db:reset"], "postgresql://owner:fakepassword@127.0.0.1:1/neondb");
    assert.notEqual(fake.status, 0);
    assert.equal(fake.output.includes("fakepassword"), false);
    pass("a missing mark table resets on this machine only; elsewhere it refuses unless the override names the database, a mark always refuses, and a failed read still refuses");

    // ---- The mark script ---------------------------------------------------------------------------------------------------------------------------
    const markUrl = urlFor(unmarkedWithTable);
    const dry = runNode(["scripts/mark-merchant-environment.mjs", "--database", unmarkedWithTable, "--note", "Peluncuran produksi pertama"], markUrl);
    assert.equal(dry.status, 0);
    assert.match(dry.output, /Dry run/u);
    assert.equal(runNode(["scripts/check-environment-mark.mjs", "x"], markUrl).status, 0, "a dry run marks nothing");
    const wrongName = runNode(["scripts/mark-merchant-environment.mjs", "--database", "another_db", "--note", "Peluncuran produksi pertama", "--yes"], markUrl);
    assert.notEqual(wrongName.status, 0, "the database name must be typed correctly");
    const shortNote = runNode(["scripts/mark-merchant-environment.mjs", "--database", unmarkedWithTable, "--note", "ya", "--yes"], markUrl);
    assert.notEqual(shortNote.status, 0, "a reason is required");
    assert.equal(runNode(["scripts/check-environment-mark.mjs", "x"], markUrl).status, 0, "neither refusal marked anything");
    const done = runNode(["scripts/mark-merchant-environment.mjs", "--database", unmarkedWithTable, "--note", "Peluncuran produksi pertama", "--yes"], markUrl);
    assert.equal(done.status, 0, done.output);
    assert.match(done.output, /Marked/u);
    assert.equal(runNode(["scripts/mark-merchant-environment.mjs", "--database", unmarkedWithTable, "--note", "Peluncuran produksi pertama", "--yes"], markUrl).status, 0);
    assert.match(runNode(["scripts/mark-merchant-environment.mjs", "--database", unmarkedWithTable, "--note", "Peluncuran produksi pertama", "--yes"], markUrl).output, /Already marked/u, "marking twice changes nothing");
    assert.equal(done.output.includes(markUrl), false, "the script never prints the connection string");
    pass("the mark script is dry by default, needs the database name and a reason, and marks once");

    // ---- A marked database refuses ---------------------------------------------------------------------------------------------------------------------
    {
      const client = new pg.Client({ connectionString: urlFor(marked) });
      await client.connect();
      await client.query("INSERT INTO environment_marks (environment, marked_by, note) VALUES ('merchant', 'uji', 'basis data uji yang ditandai')");
      await client.end();
    }
    const refusals: Array<[string, string[]]> = [
      ["db:reset", ["scripts/check-environment-mark.mjs", "db:reset"]],
      ["db:seed", ["prisma/seed.mjs"]],
      ["db:seed --staging", ["prisma/seed-staging.mjs"]],
      ["db:seed-assessment", ["prisma/seed-assessment.mjs"]],
      ["db:seed-mentors", ["prisma/seed-mentors.mjs"]],
      ["db:seed-question-bank-organization", ["prisma/seed-question-bank-organization.mjs"]],
      ["db:seed-materi", ["prisma/seed-materi.mjs"]],
      ["db:seed-huge", ["prisma/seed-huge.mjs"]],
      ["local preview reset", ["scripts/reset-and-seed-local-preview-db.mjs", "--dry-run"]],
      ["assessment prototype reset", ["scripts/guard-assessment-prototype-reset.mjs", "--apply"]],
    ];
    for (const [label, args] of refusals) {
      const result = runNode(args, urlFor(marked));
      assert.notEqual(result.status, 0, `${label} must refuse on a marked database`);
      assert.match(result.output, /merchant environment|lingkungan merchant/u, `${label} says why it refused: ${result.output.slice(0, 200)}`);
    }
    // The same through MIGRATE_DATABASE_URL (what Prisma would migrate), even when DATABASE_URL is local and unmarked.
    const viaMigrate = runNode(["scripts/check-environment-mark.mjs", "db:reset"], urlFor(scratch), { MIGRATE_DATABASE_URL: urlFor(marked) });
    assert.notEqual(viaMigrate.status, 0, "a marked MIGRATE_DATABASE_URL refuses even when DATABASE_URL is unmarked");
    const viaApp = runNode(["scripts/check-environment-mark.mjs", "db:reset"], urlFor(marked), { MIGRATE_DATABASE_URL: urlFor(scratch) });
    assert.notEqual(viaApp.status, 0, "and so does a marked DATABASE_URL");
    for (const result of [viaMigrate, viaApp]) assert.equal(result.output.includes(urlFor(marked)), false, "a refusal never prints the connection string");
    pass("db:reset, db:seed, every seed script, the preview reset and the assessment reset all refuse on a marked database, through either connection string");

    // ---- Fail closed ----------------------------------------------------------------------------------------------------------------------------------------
    const unreachable = new URL(ownerUrl());
    unreachable.port = "1";
    const closed = runNode(["scripts/check-environment-mark.mjs", "db:reset"], unreachable.toString());
    assert.notEqual(closed.status, 0, "when the mark cannot be read, the script does not run blind");
    assert.match(closed.output, /could not be read/u);
    assert.equal(closed.output.includes(unreachable.password), false);
    pass("when the mark cannot be read the guard refuses instead of running blind");

    // ---- The scripts are wired in, and nothing that deletes data is left outside the guard ----------------------------------------------------------------
    const scripts = JSON.parse(readFileSync(join(ROOT, "package.json"), "utf8")).scripts as Record<string, string>;
    assert.match(scripts["db:reset"], /^node scripts\/check-environment-mark\.mjs db:reset && prisma migrate reset/u, "db:reset checks the mark before Prisma starts");
    assert.match(scripts["db:seed"], /^pnpm db:reset && /u, "db:seed goes through db:reset");
    const GUARDED_LIBRARIES = new Set([
      "prisma/seed-mfa.mjs", // called by the seeds, which are guarded
      "scripts/mfa-reset.mjs", // the operator's MFA recovery tool: real accounts need it, and it deletes only factors
    ]);
    const unguarded: string[] = [];
    for (const dir of ["prisma", "scripts"]) {
      for (const name of readdirSync(join(ROOT, dir))) {
        if (!/\.mjs$/u.test(name) || name.startsWith("test-")) continue;
        const rel = `${dir}/${name}`;
        const source = readFileSync(join(ROOT, rel), "utf8");
        if (/DELETE FROM|TRUNCATE TABLE|deleteMany|migrate reset/u.test(source) && !source.includes("assertNotMerchantEnvironment") && !GUARDED_LIBRARIES.has(rel)) unguarded.push(rel);
      }
    }
    assert.deepEqual(unguarded, [], "every script that deletes data checks the environment mark first (or is on the reviewed list)");
    pass("db:reset is guarded before Prisma starts, and no other script that deletes data is outside the guard");

    // ---- The mark in the real schema ---------------------------------------------------------------------------------------------------------------------------
    const owner = await ownerClient();
    try {
      await owner.query("BEGIN");
      await owner.query("INSERT INTO environment_marks (environment, marked_by, note) VALUES ('merchant', 'uji', 'diuji lalu dibatalkan')");
      for (const sql of ["UPDATE environment_marks SET note = 'diubah'", "DELETE FROM environment_marks", "TRUNCATE environment_marks"]) {
        await owner.query("SAVEPOINT s");
        await assert.rejects(owner.query(sql), (error: unknown) => (error as { code?: string }).code === "55000", sql);
        await owner.query("ROLLBACK TO SAVEPOINT s");
      }
      await assert.rejects(owner.query("INSERT INTO environment_marks (id, environment, marked_by, note) VALUES (2, 'merchant', 'uji', 'baris kedua')"), (error: unknown) => (error as { code?: string }).code === "23514");
    } finally {
      await owner.query("ROLLBACK").catch(() => undefined);
      await owner.end();
    }
    const login = await createRuntimeLogin("guard");
    try {
      const runtime = await login.client();
      try {
        for (const sql of ["INSERT INTO environment_marks (environment, marked_by, note) VALUES ('merchant', 'uji', 'tidak boleh')", "DELETE FROM environment_marks", "UPDATE environment_marks SET note = 'x'"]) {
          await assert.rejects(runtime.query(sql), (error: unknown) => (error as { code?: string }).code === "42501", sql);
        }
        assert.equal((await runtime.query("SELECT count(*)::int AS n FROM environment_marks")).rows[0].n, 0, "the runtime role can read the mark");
      } finally {
        await runtime.end();
      }
    } finally {
      await login.drop();
    }
    assert.equal((await ownerQuery("SELECT 1 FROM environment_marks")).length, 0, "the dev database is still unmarked");
    pass("the mark is one append-only row: no edit, delete or truncate, only id 1, and the runtime role can read it and cannot write it");

    // ---- User deletion cannot remove or orphan evidence ----------------------------------------------------------------------------------------------------------------
    const authority = await setupAuthority();
    const order = await paidOrder();
    const before = {
      events: await prisma.paymentEvent.count({ where: { orderId: order.id } }),
      ledger: await prisma.billingAccessEvent.count({ where: { studentId: order.buyerId } }),
      order: await prisma.paymentOrder.count({ where: { id: order.id } }),
      receipts: await prisma.paymentReceipt.count({ where: { orderId: order.id } }),
      reservations: await prisma.riskReservation.count({ where: { orderId: order.id } }),
    };
    assert.ok(before.order === 1 && before.events >= 1 && before.receipts === 1 && before.ledger >= 1);

    // The only deletion path in the product is a soft delete: the account is closed, the row and its evidence stay.
    await deleteStudentEnrollment({ actorUserId: authority.otherId, userId: order.buyerId });
    const closed2 = await prisma.user.findUniqueOrThrow({ where: { id: order.buyerId } });
    assert.ok(closed2.softDeletedAt, "the account is soft-deleted");
    assert.deepEqual(
      {
        events: await prisma.paymentEvent.count({ where: { orderId: order.id } }),
        ledger: await prisma.billingAccessEvent.count({ where: { studentId: order.buyerId } }),
        order: await prisma.paymentOrder.count({ where: { id: order.id } }),
        receipts: await prisma.paymentReceipt.count({ where: { orderId: order.id } }),
        reservations: await prisma.riskReservation.count({ where: { orderId: order.id } }),
      },
      before,
      "soft-deleting the buyer leaves every evidence row in place",
    );

    // A hard delete is refused by the foreign keys, for the owner and for the runtime login alike.
    const ownerSide = await ownerClient();
    try {
      await assert.rejects(ownerSide.query("DELETE FROM users WHERE id = $1", [order.buyerId]), (error: unknown) => (error as { code?: string }).code === "23503");
    } finally {
      await ownerSide.end();
    }
    const runtimeLogin = await createRuntimeLogin("userdelete");
    try {
      const runtime = await runtimeLogin.client();
      try {
        await assert.rejects(runtime.query("DELETE FROM users WHERE id = $1", [order.buyerId]), (error: unknown) => (error as { code?: string }).code === "23503");
        await assert.rejects(runtime.query("TRUNCATE users CASCADE"), (error: unknown) => (error as { code?: string }).code === "42501");
      } finally {
        await runtime.end();
      }
    } finally {
      await runtimeLogin.drop();
    }
    assert.equal(await prisma.paymentOrder.count({ where: { id: order.id } }), 1);
    assert.ok(await prisma.user.findUnique({ where: { id: order.buyerId } }), "no deletion path removed the buyer");
    pass("user deletion is a soft delete that leaves all evidence in place; a hard delete is refused by the foreign keys for the owner and the runtime role, and TRUNCATE CASCADE is refused");
  } finally {
    await cleanUp().catch(() => undefined);
    await prisma.$disconnect().catch(() => undefined);
    for (const name of [scratch, marked, `${scratch}_open`]) await admin.query(`DROP DATABASE IF EXISTS ${name} WITH (FORCE)`).catch(() => undefined);
    await admin.end();
  }

  console.log(`retention reset guard: ${checks.length} checks passed`);
  for (const name of checks) console.log(` - ${name}`);
}

main().catch(async (error) => {
  console.error(error);
  process.exitCode = 1;
});
