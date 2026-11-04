import "dotenv/config";

import { randomBytes } from "node:crypto";

import pg from "pg";

/**
 * Shared fixtures for the retention suites (MS-10). Local database only: the
 * suites create login roles, backdate evidence with the replication role (which
 * needs the local superuser) and run the maintenance functions.
 */

const LOCAL_URL = /@(127\.0\.0\.1|localhost):55432\//u;

function ownerUrl() {
  const url = process.env.DATABASE_URL ?? "";
  if (!LOCAL_URL.test(url)) throw new Error("The retention suites only run against the local dev database on 127.0.0.1:55432.");
  return url;
}

async function ownerClient() {
  const client = new pg.Client({ connectionString: ownerUrl() });
  await client.connect();
  return client;
}

type RuntimeLogin = {
  client: () => Promise<pg.Client>;
  drop: () => Promise<void>;
  role: string;
  url: string;
};

/**
 * Creates a throwaway login that is a member of vecalss_runtime and nothing
 * else, the way scripts/setup-runtime-role.mjs makes the real one. The
 * password is random per run and never printed.
 */
async function createRuntimeLogin(label: string): Promise<RuntimeLogin> {
  const role = `vecalss_rt_test_${label}`.slice(0, 60);
  const password = randomBytes(18).toString("hex");
  const owner = await ownerClient();
  try {
    await owner.query(`DROP ROLE IF EXISTS ${owner.escapeIdentifier(role)}`);
    await owner.query(
      `CREATE ROLE ${owner.escapeIdentifier(role)} LOGIN PASSWORD ${owner.escapeLiteral(password)} NOSUPERUSER NOCREATEDB NOCREATEROLE NOREPLICATION NOBYPASSRLS IN ROLE vecalss_runtime`,
    );
  } finally {
    await owner.end();
  }

  const url = new URL(ownerUrl());
  url.username = role;
  url.password = password;

  return {
    client: async () => {
      const client = new pg.Client({ connectionString: url.toString() });
      await client.connect();
      return client;
    },
    drop: async () => {
      const cleanup = await ownerClient();
      try {
        await cleanup.query(`DROP ROLE IF EXISTS ${cleanup.escapeIdentifier(role)}`);
      } finally {
        await cleanup.end();
      }
    },
    role,
    url: url.toString(),
  };
}

/** The error text of a statement that is expected to fail, or null when it succeeded. */
async function failureOf(client: pg.Client, sql: string, params: unknown[] = []) {
  try {
    await client.query("SAVEPOINT expected_failure");
  } catch {
    // Not in a transaction; run bare below.
  }
  try {
    await client.query(sql, params);
    return null;
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    const code = (error as { code?: string }).code ?? "";
    return { code, message };
  }
}

/** Tables that carry an order family's clock, and how to find the family's rows. */
const FAMILY = [
  { table: "payment_orders", where: "id = $1" },
  { table: "checkout_intents", where: "id = (SELECT intent_id FROM payment_orders WHERE id = $1)" },
  { table: "payment_events", where: "order_id = $1" },
  { table: "payment_receipts", where: "order_id = $1" },
  { table: "receipt_deliveries", where: "receipt_id IN (SELECT id FROM payment_receipts WHERE order_id = $1)" },
  { table: "fulfillment_usage_events", where: "order_id = $1" },
  { table: "risk_reservations", where: "order_id = $1" },
  { table: "refund_cases", where: "order_id = $1" },
  { table: "refund_case_events", where: "case_id IN (SELECT id FROM refund_cases WHERE order_id = $1)" },
  { table: "payment_disputes", where: "order_id = $1" },
  { table: "payment_dispute_events", where: "dispute_id IN (SELECT id FROM payment_disputes WHERE order_id = $1)" },
  { table: "dispute_exports", where: "order_id = $1" },
  { table: "payment_outbox", where: "order_id = $1" },
  { table: "package_purchases", where: "id = (SELECT package_purchase_id FROM payment_orders WHERE id = $1)" },
  {
    table: "audit_logs",
    where: `(target_type = 'payment_order' AND target_id = $1)
      OR (target_type = 'payment_event' AND target_id IN (SELECT id FROM payment_events WHERE order_id = $1))
      OR (target_type = 'checkout_intent' AND target_id = (SELECT intent_id FROM payment_orders WHERE id = $1))`,
  },
] as const;

/**
 * Moves an order and everything it owns back in time, as if it had happened
 * `interval` earlier ('13 months'). Evidence is immutable, so this uses the
 * replication role (triggers off) as the local superuser; it only changes
 * timestamps, all by the same amount, so every ordering and deadline inside the
 * family is preserved.
 */
async function shiftOrderBack(orderId: string, interval: string) {
  const client = await ownerClient();
  try {
    await client.query("BEGIN");
    await client.query("SET LOCAL session_replication_role = 'replica'");
    for (const { table, where } of FAMILY) {
      const columns = await client.query<{ column_name: string }>(
        "SELECT column_name FROM information_schema.columns WHERE table_schema = 'public' AND table_name = $1 AND data_type = 'timestamp with time zone'",
        [table],
      );
      if (columns.rowCount === 0) continue;
      const assignments = columns.rows.map((row) => `${client.escapeIdentifier(row.column_name)} = ${client.escapeIdentifier(row.column_name)} - $2::interval`).join(", ");
      await client.query(`UPDATE ${table} SET ${assignments} WHERE ${where}`, [orderId, interval]);
    }
    await client.query("COMMIT");
  } catch (error) {
    await client.query("ROLLBACK").catch(() => undefined);
    throw error;
  } finally {
    await client.end();
  }
}

/** Runs one statement as the local superuser with triggers off (test setup only). */
async function setupSql(sql: string, params: unknown[] = []) {
  const client = await ownerClient();
  try {
    await client.query("BEGIN");
    await client.query("SET LOCAL session_replication_role = 'replica'");
    const result = await client.query(sql, params);
    await client.query("COMMIT");
    return result;
  } catch (error) {
    await client.query("ROLLBACK").catch(() => undefined);
    throw error;
  } finally {
    await client.end();
  }
}

async function ownerQuery<T extends pg.QueryResultRow = pg.QueryResultRow>(sql: string, params: unknown[] = []) {
  const client = await ownerClient();
  try {
    return (await client.query<T>(sql, params)).rows;
  } finally {
    await client.end();
  }
}

export { createRuntimeLogin, failureOf, ownerClient, ownerQuery, ownerUrl, setupSql, shiftOrderBack };
export type { RuntimeLogin };
