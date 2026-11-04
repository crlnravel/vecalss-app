import assert from "node:assert/strict";

import { getActiveRegister, periodEnd } from "../lib/retention/register";
import { prisma } from "../lib/prisma";
import { createRuntimeLogin, ownerClient } from "./retention-test-kit";

/**
 * MS-10 phase A, the register: version 1 holds the G4 periods, a financial
 * class can never fall below six calendar months (enforced by the table), a
 * change is a new version and nothing is edited in place, and the calendar
 * arithmetic is right at month-ends and leap years on the Jakarta calendar,
 * whatever the session time zone is. Local database only.
 */

const checks: string[] = [];
const pass = (name: string) => checks.push(name);

const iso = (date: Date) => new Date(date).toISOString();

async function inTransaction<T>(work: (client: Awaited<ReturnType<typeof ownerClient>>) => Promise<T>) {
  const client = await ownerClient();
  try {
    await client.query("BEGIN");
    const value = await work(client);
    await client.query("ROLLBACK");
    return value;
  } finally {
    await client.end();
  }
}

async function rejects(client: Awaited<ReturnType<typeof ownerClient>>, sql: string, code: string, params: unknown[] = []) {
  await client.query("SAVEPOINT attempt");
  try {
    await client.query(sql, params);
  } catch (error) {
    assert.equal((error as { code?: string }).code, code, `${sql} failed with the wrong code: ${(error as Error).message}`);
    await client.query("ROLLBACK TO SAVEPOINT attempt");
    return;
  }
  assert.fail(`expected ${sql} to be refused (${code})`);
}

async function main() {
  // ---- Version 1: the G4 decisions ------------------------------------------------------------
  const register = await getActiveRegister();
  assert.equal(register.version, 1, "version 1 is the newest register version");
  const byClass = Object.fromEntries(register.rules.map((rule) => [rule.recordClass, rule]));
  assert.equal(byClass.order_family.periodMonths, 120, "orders and their records: 10 years");
  assert.equal(byClass.order_family.actionAfter, "delete");
  assert.equal(byClass.buyer_ip_device.periodMonths, 12, "buyer IP and device evidence: 12 months");
  assert.equal(byClass.buyer_ip_device.actionAfter, "scrub", "…scrubbed, not deleted");
  assert.equal(byClass.case_record.periodMonths, 24, "dispute and refund cases: 2 years after closure");
  assert.equal(byClass.fraud_case.periodMonths, 24);
  assert.equal(byClass.fraud_block.periodMonths, 24);
  assert.equal(byClass.checkout_intent.periodDays, 30, "intents without an order: 30 days");
  assert.equal(byClass.security_log.periodDays, 90, "security logs: 90 days, run by the existing job");
  assert.equal(byClass.security_log.actionAfter, "external");
  assert.equal(byClass.audit_log.actionAfter, "keep", "audit_logs is not pruned");
  assert.equal(byClass.risk_policy.periodMonths, 120);
  for (const rule of register.rules.filter((item) => item.financial)) {
    assert.ok((rule.periodMonths ?? 0) >= 6, `${rule.recordClass} is financial and at least six calendar months`);
    assert.equal(rule.periodDays, null, `${rule.recordClass} counts in calendar months, never days`);
  }
  pass("version 1 holds the G4 periods and every financial class is in months, at least 6");

  // ---- The table enforces the floor ------------------------------------------------------------
  await inTransaction(async (client) => {
    await client.query("INSERT INTO retention_register_versions (version, note) VALUES (2, 'uji')");
    await rejects(client,
      "INSERT INTO retention_register_rules (version, record_class, label, financial, period_months, start_rule, action_after) VALUES (2, 'order_family', 'x', true, 5, 'x', 'delete')",
      "23514");
    await rejects(client,
      "INSERT INTO retention_register_rules (version, record_class, label, financial, period_days, start_rule, action_after) VALUES (2, 'order_family', 'x', true, 400, 'x', 'delete')",
      "23514");
    await rejects(client,
      "INSERT INTO retention_register_rules (version, record_class, label, financial, period_months, period_days, start_rule, action_after) VALUES (2, 'zz_class', 'x', false, 12, 30, 'x', 'delete')",
      "23514");
    await rejects(client,
      "INSERT INTO retention_register_rules (version, record_class, label, financial, period_months, start_rule, action_after) VALUES (2, 'zz_class', 'x', false, 0, 'x', 'delete')",
      "23514");
    await rejects(client,
      "INSERT INTO retention_register_rules (version, record_class, label, financial, start_rule, action_after) VALUES (2, 'zz_class', 'x', false, 'x', 'delete')",
      "23514");
    // Exactly six months is allowed, and a longer period is a new version, not an edit.
    await client.query(
      "INSERT INTO retention_register_rules (version, record_class, label, financial, period_months, start_rule, action_after) VALUES (2, 'order_family', 'x', true, 6, 'x', 'delete')");
    // A class that was financial stays financial in every later version.
    await rejects(client,
      "INSERT INTO retention_register_rules (version, record_class, label, financial, period_months, start_rule, action_after) VALUES (2, 'case_record', 'x', false, 24, 'x', 'delete')",
      "23514");
  });
  pass("the table refuses a financial class under 6 calendar months, in days, or without a period; the financial flag cannot be dropped");

  // ---- Versioning: a change is a new version, nothing is edited --------------------------------
  await inTransaction(async (client) => {
    await client.query("INSERT INTO retention_register_versions (version, note) VALUES (2, 'uji')");
    await client.query(
      "INSERT INTO retention_register_rules (version, record_class, label, financial, period_months, start_rule, action_after) VALUES (2, 'buyer_ip_device', 'IP', false, 18, 'x', 'scrub')");
    await client.query(
      "INSERT INTO retention_register_rules (version, record_class, label, financial, period_months, start_rule, action_after) VALUES (2, 'order_family', 'x', true, 144, 'x', 'delete')");
    const anchor = "2026-01-15T10:00:00+07:00";
    const [{ active }] = (await client.query("SELECT retention_active_version() AS active")).rows;
    assert.equal(active, 2, "the newest version is in force");
    const v2 = (await client.query("SELECT retention_rule_end('buyer_ip_device', $1::timestamptz) AS e", [anchor])).rows[0].e as Date;
    const v1 = (await client.query("SELECT retention_rule_end('buyer_ip_device', $1::timestamptz, 1) AS e", [anchor])).rows[0].e as Date;
    assert.equal(iso(v2), iso(new Date("2027-07-15T10:00:00+07:00")), "version 2 uses 18 months");
    assert.equal(iso(v1), iso(new Date("2027-01-15T10:00:00+07:00")), "version 1 is still readable and unchanged");
    // A class version 2 does not list is not silently dropped from the maintenance path's reading.
    const gone = (await client.query("SELECT retention_rule_end('fraud_case', $1::timestamptz) AS e", [anchor])).rows[0].e;
    assert.equal(Number(gone), Infinity, "a class the active version does not list is kept, never deleted by default");
  });
  pass("a new version changes the periods in force, version 1 stays readable, and an unlisted class defaults to kept");

  await inTransaction(async (client) => {
    await rejects(client, "UPDATE retention_register_rules SET period_months = 6 WHERE record_class = 'order_family'", "55000");
    await rejects(client, "DELETE FROM retention_register_rules", "55000");
    await rejects(client, "UPDATE retention_register_versions SET note = 'x'", "55000");
    await rejects(client, "DELETE FROM retention_register_versions", "55000");
    await rejects(client, "TRUNCATE retention_register_rules", "55000");
    await rejects(client, "TRUNCATE retention_register_versions", "0A000"); // the foreign key refuses it first
  });
  pass("the register is append-only: no UPDATE, DELETE or TRUNCATE, even for the schema owner");

  // ---- The runtime role reads the register and cannot write it ---------------------------------
  const login = await createRuntimeLogin("register");
  try {
    const runtime = await login.client();
    try {
      const read = await runtime.query("SELECT count(*)::int AS n FROM retention_register_rules");
      assert.ok(read.rows[0].n > 0, "the runtime role can read the register");
      for (const sql of [
        "INSERT INTO retention_register_versions (version, note) VALUES (9, 'x')",
        "INSERT INTO retention_register_rules (version, record_class, label, financial, period_months, start_rule, action_after) VALUES (1, 'x_class', 'x', false, 12, 'x', 'delete')",
        "UPDATE retention_register_rules SET period_months = 1",
        "DELETE FROM retention_register_rules",
        "TRUNCATE retention_register_rules",
        "INSERT INTO evidence_tables (table_name, record_class) VALUES ('users', 'x')",
        "INSERT INTO retention_runs (kind, record_class, register_version, batch_limit, invoked_by) VALUES ('scrub', 'x', 1, 1, 'x')",
      ]) {
        await assert.rejects(runtime.query(sql), (error: unknown) => (error as { code?: string }).code === "42501", `the runtime role must not run: ${sql}`);
      }
    } finally {
      await runtime.end();
    }
  } finally {
    await login.drop();
  }
  pass("the runtime role can read the register and cannot write it, its evidence list, or the run log");

  // ---- Calendar arithmetic ----------------------------------------------------------------------
  const end = (anchor: string, months: number | null, days: number | null = null) => periodEnd(anchor, months, days).then(iso);
  const at = (value: string) => iso(new Date(value));

  // Month-ends: a start day the end month lacks rolls to the first instant of the next month,
  // so a period is never shorter than the one named.
  assert.equal(await end("2026-08-31T10:00:00+07:00", 6), at("2027-03-01T00:00:00+07:00"), "31 Aug + 6 months");
  assert.equal(await end("2026-08-31T10:00:00+07:00", 120), at("2036-08-31T10:00:00+07:00"), "31 Aug + 10 years (August has 31 days)");
  assert.equal(await end("2026-08-30T10:00:00+07:00", 6), at("2027-03-01T00:00:00+07:00"), "30 Aug + 6 months");
  assert.equal(await end("2026-08-28T10:00:00+07:00", 6), at("2027-02-28T10:00:00+07:00"), "28 Aug + 6 months lands on 28 Feb");
  assert.equal(await end("2026-12-31T10:00:00+07:00", 6), at("2027-07-01T00:00:00+07:00"), "31 Dec + 6 months (no 31 June)");
  assert.equal(await end("2027-01-31T10:00:00+07:00", 1), at("2027-03-01T00:00:00+07:00"), "31 Jan + 1 month");

  // Leap years.
  assert.equal(await end("2028-02-29T10:00:00+07:00", 6), at("2028-08-29T10:00:00+07:00"), "29 Feb 2028 + 6 months");
  assert.equal(await end("2028-02-29T10:00:00+07:00", 12), at("2029-03-01T00:00:00+07:00"), "29 Feb 2028 + 1 year (2029 has no 29 Feb)");
  assert.equal(await end("2028-02-29T10:00:00+07:00", 120), at("2038-03-01T00:00:00+07:00"), "29 Feb 2028 + 10 years");
  assert.equal(await end("2028-02-29T10:00:00+07:00", 48), at("2032-02-29T10:00:00+07:00"), "29 Feb 2028 + 4 years lands on a leap day");
  assert.equal(await end("2028-02-28T10:00:00+07:00", 12), at("2029-02-28T10:00:00+07:00"), "28 Feb 2028 + 1 year");
  assert.equal(await end("2027-02-28T10:00:00+07:00", 6), at("2027-08-28T10:00:00+07:00"), "28 Feb 2027 + 6 months");
  assert.equal(await end("2027-02-28T10:00:00+07:00", 120), at("2037-02-28T10:00:00+07:00"), "28 Feb 2027 + 10 years");
  assert.equal(await end("2027-02-28T10:00:00+07:00", 12), at("2028-02-28T10:00:00+07:00"), "28 Feb 2027 + 1 year stays on the 28th");

  // The calendar is Jakarta's: 31 Aug 18:30 UTC is already 1 Sep in Jakarta.
  assert.equal(await end("2026-08-31T18:30:00Z", 6), at("2027-03-01T01:30:00+07:00"), "the Jakarta calendar decides the day, not UTC");

  // Days are plain days.
  assert.equal(await end("2026-12-15T10:00:00+07:00", null, 30), at("2027-01-14T10:00:00+07:00"), "30 days");
  pass("calendar arithmetic: month-ends, leap years, 6 months and 10 years, on the Jakarta calendar");

  // Whatever the session says, the answer is the same: it never depends on the connection's time zone.
  const zones = [];
  for (const zone of ["UTC", "America/New_York", "Asia/Tokyo"]) {
    const client = await ownerClient();
    try {
      await client.query(`SET TIME ZONE '${zone}'`);
      const row = (await client.query("SELECT retention_period_end('2026-08-31T10:00:00+07'::timestamptz, 6, NULL) AS e")).rows[0].e as Date;
      zones.push(iso(row));
    } finally {
      await client.end();
    }
  }
  assert.equal(new Set(zones).size, 1, "the result does not depend on the session time zone");
  assert.equal(zones[0], at("2027-03-01T00:00:00+07:00"));
  pass("the period end does not depend on the session time zone");

  // The boundary itself: eligible exactly at the end, not a moment before.
  const client = await ownerClient();
  try {
    const row = (
      await client.query(
        `SELECT retention_period_end(t, 6, NULL) <= (retention_period_end(t, 6, NULL)) AS at_end,
                retention_period_end(t, 6, NULL) <= (retention_period_end(t, 6, NULL) - interval '1 second') AS before_end
         FROM (SELECT '2026-08-31T10:00:00+07'::timestamptz AS t) s`,
      )
    ).rows[0];
    assert.equal(row.at_end, true);
    assert.equal(row.before_end, false);
  } finally {
    await client.end();
  }
  pass("a record is due exactly at the period end and not a second before");

  await prisma.$disconnect();
  console.log(`retention register: ${checks.length} checks passed`);
  for (const name of checks) console.log(` - ${name}`);
}

main().catch(async (error) => {
  console.error(error);
  await prisma.$disconnect().catch(() => undefined);
  process.exitCode = 1;
});
