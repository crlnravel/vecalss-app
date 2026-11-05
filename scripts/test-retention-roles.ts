import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

import type pg from "pg";

import { createRuntimeLogin, ownerClient, ownerQuery } from "./retention-test-kit";
import { makeOrder, prisma } from "./payment-test-kit";

/**
 * MS-10 phase A, the roles: the application's runtime role can read and insert
 * evidence, can update only the columns the guarded transitions use, and can
 * never delete, truncate, change triggers or schema, or become the maintenance
 * role. The maintenance role can do only what the scrub and delete functions
 * need. The two maintenance functions are callable only as intended. Local
 * database only.
 */

const checks: string[] = [];
const pass = (name: string) => checks.push(name);

type Row = { column_default: string | null; column_name: string };

async function denied(client: pg.Client, sql: string, codes: string[] = ["42501"]) {
  try {
    await client.query(sql);
  } catch (error) {
    const code = (error as { code?: string }).code ?? "";
    assert.ok(codes.includes(code), `${sql} was refused with ${code} (${(error as Error).message}); expected one of ${codes.join(", ")}`);
    return;
  }
  assert.fail(`${sql} should have been refused`);
}

async function main() {
  const evidence = await ownerQuery<{ record_class: string; runtime_insert: boolean; table_name: string; update_columns: string[] | null }>(
    "SELECT table_name, record_class, runtime_insert, update_columns FROM evidence_tables ORDER BY table_name",
  );
  assert.ok(evidence.length >= 30, "the registry lists the evidence tables");
  const login = await createRuntimeLogin("roles");
  const extra = await createRuntimeLogin("extra");
  const runtime = await login.client();
  try {
    // ---- Evidence tables: UPDATE, DELETE and TRUNCATE denied; INSERT only where the app writes --------------
    for (const table of evidence) {
      const name = table.table_name;
      const columns = (await ownerQuery<Row>("SELECT column_name, column_default FROM information_schema.columns WHERE table_schema = 'public' AND table_name = $1 ORDER BY ordinal_position", [name]));
      const privileges = (
        await runtime.query(
          `SELECT has_table_privilege($1, 'SELECT') AS sel, has_table_privilege($1, 'INSERT') AS ins,
                  has_table_privilege($1, 'UPDATE') AS upd_all, has_table_privilege($1, 'DELETE') AS del,
                  has_table_privilege($1, 'TRUNCATE') AS trunc, has_table_privilege($1, 'TRIGGER') AS trg,
                  has_table_privilege($1, 'REFERENCES') AS refs`,
          [`public.${name}`],
        )
      ).rows[0];
      assert.equal(privileges.sel, true, `${name}: SELECT`);
      assert.equal(privileges.ins, table.runtime_insert, `${name}: INSERT only where the app writes`);
      assert.equal(privileges.upd_all, false, `${name}: no whole-table UPDATE`);
      assert.equal(privileges.del, false, `${name}: no DELETE`);
      assert.equal(privileges.trunc, false, `${name}: no TRUNCATE`);
      assert.equal(privileges.trg, false, `${name}: no TRIGGER`);
      assert.equal(privileges.refs, false, `${name}: no REFERENCES`);

      await denied(runtime, `DELETE FROM ${name} WHERE false`);
      await denied(runtime, `TRUNCATE ${name}`);

      const allowedUpdates = table.update_columns ?? [];
      const nonUpdatable = columns.find((column) => !allowedUpdates.includes(column.column_name));
      if (nonUpdatable) {
        await denied(runtime, `UPDATE ${name} SET ${nonUpdatable.column_name} = ${nonUpdatable.column_name} WHERE false`);
      }
      if (allowedUpdates.length > 0) {
        for (const column of allowedUpdates) {
          const ok = (await runtime.query("SELECT has_column_privilege($1, $2, 'UPDATE') AS ok", [`public.${name}`, column])).rows[0].ok;
          assert.equal(ok, true, `${name}.${column} stays updatable for the guarded transitions`);
        }
      }
      for (const forbidden of ["DISABLE TRIGGER USER", "DISABLE TRIGGER ALL", "ADD COLUMN zz int", "DROP COLUMN IF EXISTS zz", "OWNER TO vecalss_runtime"]) {
        await denied(runtime, `ALTER TABLE ${name} ${forbidden}`);
      }
      await denied(runtime, `DROP TABLE ${name}`);
    }
    pass(`UPDATE, DELETE, TRUNCATE, TRIGGER and schema changes denied on all ${evidence.length} evidence tables; only column-limited UPDATE where the guards need it`);

    // The runtime role still does everything the app does to ordinary tables.
    const ordinary = await ownerQuery<{ relname: string }>(
      `SELECT c.relname FROM pg_class c WHERE c.relnamespace = 'public'::regnamespace AND c.relkind IN ('r', 'p')
       AND c.relname <> '_prisma_migrations' AND NOT EXISTS (SELECT 1 FROM evidence_tables e WHERE e.table_name = c.relname)`,
    );
    assert.ok(ordinary.length > 100);
    for (const { relname } of ordinary) {
      const grants = (await runtime.query("SELECT has_table_privilege($1, 'SELECT,INSERT,UPDATE,DELETE') AS ok", [`public.${relname}`])).rows[0].ok;
      assert.equal(grants, true, `${relname}: ordinary tables keep SELECT, INSERT, UPDATE and DELETE`);
      assert.equal((await runtime.query("SELECT has_table_privilege($1, 'TRUNCATE') OR has_table_privilege($1, 'TRIGGER') AS bad", [`public.${relname}`])).rows[0].bad, false, `${relname}: no TRUNCATE or TRIGGER`);
    }
    assert.equal((await runtime.query("SELECT has_table_privilege('public._prisma_migrations', 'SELECT') AS ok")).rows[0].ok, false, "the migration history is not the runtime's");
    pass(`ordinary tables (${ordinary.length}) keep read and write for the runtime role, without TRUNCATE or TRIGGER`);

    // A table created later gives the app nothing until the grant helper runs (MS-19 M-04: no default privileges).
    const owner = await ownerClient();
    try {
      await owner.query("CREATE TABLE zz_retention_probe (id int primary key)");
      assert.equal((await runtime.query("SELECT has_table_privilege('public.zz_retention_probe', 'SELECT') AS ok")).rows[0].ok, false);
      await owner.query("SELECT public.retention_apply_runtime_grants()");
      assert.equal((await runtime.query("SELECT has_table_privilege('public.zz_retention_probe', 'SELECT,INSERT,UPDATE,DELETE') AS ok")).rows[0].ok, true);
    } finally {
      await owner.query("DROP TABLE IF EXISTS zz_retention_probe");
      await owner.end();
    }
    pass("a table added by a later migration has no runtime access until the grant helper runs, then works like the other ordinary tables");

    // ---- No DDL, no trigger changes, no role changes, no replication-role switch -----------------------------
    for (const sql of [
      "CREATE TABLE zz_runtime_made (id int)",
      "CREATE FUNCTION public.zz_f() RETURNS int LANGUAGE sql AS 'SELECT 1'",
      "CREATE OR REPLACE FUNCTION public.prevent_payment_record_mutation() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RETURN NEW; END $$",
      "ALTER FUNCTION public.prevent_payment_record_mutation() OWNER TO vecalss_runtime",
      "DROP FUNCTION public.guard_payment_order_change() CASCADE",
      "DROP TRIGGER payment_orders_guard ON payment_orders",
      "CREATE TRIGGER zz BEFORE INSERT ON users FOR EACH ROW EXECUTE FUNCTION public.prevent_payment_record_mutation()",
      "CREATE SCHEMA zz_schema",
      "CREATE ROLE zz_role",
      "ALTER ROLE vecalss_runtime SUPERUSER",
      "SET ROLE vecalss_retention",
      "SET ROLE vecalss",
      "SET session_replication_role = 'replica'",
      "ALTER SYSTEM SET max_connections = 5",
      "DROP TABLE _prisma_migrations",
    ]) {
      await denied(runtime, sql, ["42501", "25006", "0LP01"]);
    }
    // A GRANT by a role with no grant option only warns; what matters is that nothing was granted.
    await runtime.query("GRANT DELETE ON payment_orders TO vecalss_runtime");
    assert.equal((await runtime.query("SELECT has_table_privilege('public.payment_orders', 'DELETE') AS ok")).rows[0].ok, false, "the runtime role cannot grant itself DELETE");
    pass("the runtime role cannot create or alter objects, triggers or roles, grant itself anything, or switch to the maintenance, owner or replication role");

    // ---- The scrub exception is role-checked and cannot be spoofed by the runtime role ------------------------
    const order = await makeOrder({ session: false });
    assert.ok(order.buyerIp, "the fixture order has a buyer IP");
    await denied(runtime, `UPDATE payment_orders SET buyer_ip = NULL WHERE id = '${order.id}'`);
    await denied(runtime, `UPDATE payment_orders SET device_lookup_token = NULL WHERE id = '${order.id}'`);
    await denied(runtime, `UPDATE payment_events SET caller_ip = NULL WHERE order_id = '${order.id}'`);
    await denied(runtime, `UPDATE audit_logs SET ip_address = NULL WHERE target_id = '${order.id}'`);
    await denied(runtime, `DELETE FROM payment_orders WHERE id = '${order.id}'`);
    // Session settings the runtime role could set itself change nothing.
    await runtime.query("SET retention.maintenance = 'on'");
    await runtime.query("SET application_name = 'vecalss_retention'");
    await denied(runtime, `UPDATE payment_orders SET buyer_ip = NULL WHERE id = '${order.id}'`);
    await runtime.query("RESET retention.maintenance");
    await runtime.query("RESET application_name");

    // Even the schema owner, with the same settings, is stopped by the trigger.
    const asOwner = await ownerClient();
    try {
      await asOwner.query("SET retention.maintenance = 'on'");
      await asOwner.query("SET application_name = 'vecalss_retention'");
      await denied(asOwner, `UPDATE payment_orders SET buyer_ip = NULL WHERE id = '${order.id}'`, ["55000"]);
      await denied(asOwner, `DELETE FROM payment_orders WHERE id = '${order.id}'`, ["55000"]);
      await denied(asOwner, `UPDATE audit_logs SET ip_address = NULL WHERE target_id = '${order.id}'`, ["55000"]);

      // Only the maintenance role passes: it nulls the two evidence columns, nothing else.
      await asOwner.query("BEGIN");
      await asOwner.query("SET LOCAL ROLE vecalss_retention");
      assert.equal((await asOwner.query("SELECT current_user AS u")).rows[0].u, "vecalss_retention");
      const scrubbed = await asOwner.query(`UPDATE payment_orders SET buyer_ip = NULL, device_lookup_token = NULL WHERE id = '${order.id}'`);
      assert.equal(scrubbed.rowCount, 1, "the maintenance role can null the IP and device token");
      await asOwner.query("ROLLBACK");

      for (const sql of [
        `UPDATE payment_orders SET amount_rupiah = 1 WHERE id = '${order.id}'`,
        `UPDATE payment_orders SET status_reason = 'x' WHERE id = '${order.id}'`,
        "TRUNCATE payment_orders",
        "TRUNCATE payment_events",
        "DELETE FROM audit_logs WHERE false",
        "DELETE FROM billing_access_events WHERE false",
        "DELETE FROM users WHERE false",
      ]) {
        await asOwner.query("BEGIN");
        await asOwner.query("SET LOCAL ROLE vecalss_retention");
        await denied(asOwner, sql);
        await asOwner.query("ROLLBACK");
      }

      // The delete exception is for the maintenance role, on its own tables, and never TRUNCATE.
      await asOwner.query("BEGIN");
      await asOwner.query("SET LOCAL ROLE vecalss_retention");
      await asOwner.query(`DELETE FROM payment_events WHERE order_id = '${order.id}'`);
      await asOwner.query("ROLLBACK");
    } finally {
      await asOwner.end();
    }
    const stillThere = await prisma.paymentOrder.findUniqueOrThrow({ where: { id: order.id } });
    assert.equal(stillThere.buyerIp, order.buyerIp, "nothing above changed the order");
    pass("the runtime role cannot null buyer_ip, the device token, an event's caller IP or an audit IP; a session setting or application name opens nothing; the exception is the maintenance role's alone");

    // ---- The maintenance functions are callable only as intended ---------------------------------------------
    const info = (
      await ownerQuery<{ owner: string; secdef: boolean; config: string[] | null; proname: string }>(
        `SELECT p.proname, pg_get_userbyid(p.proowner) AS owner, p.prosecdef AS secdef, p.proconfig AS config
         FROM pg_proc p WHERE p.pronamespace = 'public'::regnamespace AND p.proname IN ('retention_run_scrub', 'retention_run_delete', 'retention_log_run')`,
      )
    );
    assert.equal(info.length, 3);
    for (const fn of info) {
      assert.equal(fn.owner, "vecalss_retention", `${fn.proname} is owned by the no-login maintenance role`);
    }
    for (const fn of info.filter((item) => item.proname !== "retention_log_run")) {
      assert.equal(fn.secdef, true, `${fn.proname} runs with its owner's rights`);
      assert.ok(fn.config?.some((setting) => setting.startsWith("search_path=")), `${fn.proname} pins its search_path`);
    }
    const [maintenanceRole] = await ownerQuery<{ rolcanlogin: boolean; rolsuper: boolean; rolcreaterole: boolean; rolbypassrls: boolean }>(
      "SELECT rolcanlogin, rolsuper, rolcreaterole, rolbypassrls FROM pg_roles WHERE rolname = 'vecalss_retention'",
    );
    assert.deepEqual(maintenanceRole, { rolbypassrls: false, rolcanlogin: false, rolcreaterole: false, rolsuper: false }, "the maintenance role cannot log in and has no extra powers");
    const [runtimeRole] = await ownerQuery<{ rolcanlogin: boolean; rolsuper: boolean }>("SELECT rolcanlogin, rolsuper FROM pg_roles WHERE rolname = 'vecalss_runtime'");
    assert.deepEqual(runtimeRole, { rolcanlogin: false, rolsuper: false });

    // A login that is not a runtime member cannot call anything; the runtime can call only the two entry points.
    const probeClient = await createRuntimeLogin("noaccess");
    const noAccess = await (async () => {
      const owner = await ownerClient();
      try {
        await owner.query(`ALTER ROLE ${owner.escapeIdentifier(probeClient.role)} NOINHERIT`);
        await owner.query(`REVOKE vecalss_runtime FROM ${owner.escapeIdentifier(probeClient.role)}`);
      } finally {
        await owner.end();
      }
      return probeClient.client();
    })();
    try {
      for (const sql of ["SELECT retention_run_scrub(1)", "SELECT retention_run_delete(1)", "SELECT retention_apply_runtime_grants()"]) {
        await denied(noAccess, sql, ["42501", "42883"]);
      }
    } finally {
      await noAccess.end();
      await probeClient.drop();
    }
    for (const sql of [
      "SELECT retention_apply_runtime_grants()",
      "SELECT retention_log_run(gen_random_uuid(), 'scrub', 'buyer_ip_device', 1, 1, 0, 0, 0, '{}'::jsonb, true, now())",
    ]) {
      await denied(runtime, sql);
    }
    await denied(runtime, "INSERT INTO retention_runs (kind, record_class, register_version, batch_limit, invoked_by) VALUES ('scrub', 'x', 1, 1, 'x')");
    await denied(runtime, "INSERT INTO retention_scrubs (order_id, run_id, register_version) VALUES (gen_random_uuid(), gen_random_uuid(), 1)");
    await denied(runtime, "INSERT INTO retention_purges (record_class, subject_table, subject_id, run_id, register_version) VALUES ('x', 'x', gen_random_uuid(), gen_random_uuid(), 1)");
    assert.equal((await runtime.query("SELECT has_function_privilege('retention_run_scrub(integer)', 'EXECUTE') AS a, has_function_privilege('retention_run_delete(integer)', 'EXECUTE') AS b")).rows[0].a, true);

    // A temporary table that shadows the register does not change what the function reads.
    await runtime.query("CREATE TEMP TABLE retention_register_rules (version int, record_class text, period_months int, period_days int)");
    await runtime.query("INSERT INTO retention_register_rules VALUES (1, 'buyer_ip_device', 1, NULL)");
    await runtime.query("SET search_path = pg_temp, public");
    const shadowed = (await runtime.query("SELECT retention_run_scrub(5) AS r")).rows[0].r as { registerVersion: number };
    assert.equal(shadowed.registerVersion, 1);
    await runtime.query("RESET search_path");
    await runtime.query("DROP TABLE pg_temp.retention_register_rules");
    const untouched = await prisma.paymentOrder.findUniqueOrThrow({ where: { id: order.id } });
    assert.equal(untouched.buyerIp, order.buyerIp, "a fresh order is never scrubbed, shadow table or not");
    pass("maintenance functions: owned by the no-login role, pinned search_path, callable by the runtime role only through the two entry points, and not by a plain login");

    // ---- Every table with an immutability rule is in the registry --------------------------------------------
    const guarded = await ownerQuery<{ relname: string }>(
      `SELECT DISTINCT c.relname FROM pg_trigger t JOIN pg_class c ON c.oid = t.tgrelid JOIN pg_proc p ON p.oid = t.tgfoid
       WHERE NOT t.tgisinternal AND c.relnamespace = 'public'::regnamespace
         AND (p.proname LIKE 'prevent\\_%mutation' OR p.proname IN ('guard_payment_order_change', 'guard_payment_receipt_change', 'guard_dispute_export_change',
              'guard_refund_case_change', 'guard_payment_dispute_change', 'guard_risk_reservation_change', 'guard_fraud_block_change',
              'guard_fraud_case_change', 'guard_fraud_appeal_change', 'guard_legal_hold_change', 'retention_append_only', 'guard_package_purchase_terminal_status'))`,
    );
    const registered = new Set(evidence.map((row) => row.table_name));
    for (const { relname } of guarded) {
      // The AI and assessment tables carry their own immutability rules and are not payment evidence.
      if (/^(ai_|vera_|adaptive_|assessment_|question_|reusable_|standalone_|tryout_)/u.test(relname)) continue;
      assert.ok(registered.has(relname), `${relname} has an immutability trigger, so it must be in evidence_tables`);
    }
    const prefixed = await ownerQuery<{ relname: string }>(
      `SELECT c.relname FROM pg_class c WHERE c.relnamespace = 'public'::regnamespace AND c.relkind = 'r'
       AND c.relname ~ '^(payment_|refund_|risk_|fraud_|legal_|retention_|receipt_|fulfillment_|dispute_|environment_|evidence_)'`,
    );
    // risk_flags is the older cohort-risk flag list, not payment evidence.
    for (const { relname } of prefixed.filter((row) => row.relname !== "risk_flags")) assert.ok(registered.has(relname), `${relname} looks like payment evidence and must be classified`);
    pass("every table with an immutability trigger, and every payment-evidence table by name, is in the evidence registry");

    // ---- MS-19 M-04: no broad default, and an unregistered merchant-evidence table stops the grant helper ---------------------------------
    const MERCHANT_PREFIX = /^(payment_|refund_|risk_|fraud_|retention_|receipt_|fulfillment_|dispute_|billing_|legal_|environment_|checkout_)/u;
    const REVIEWED_ORDINARY = new Set(["billing_accounts", "risk_flags"]);
    // Only models are tables (enums carry @@map too).
    const schemaTables = readFileSync(new URL("../prisma/schema.prisma", import.meta.url), "utf8")
      .split(/^model /mu)
      .slice(1)
      .map((block) => /@@map\("([^"]+)"\)/u.exec(block.split(/^\}/mu)[0])?.[1])
      .filter((name): name is string => Boolean(name));
    const liveTables = (await ownerQuery<{ relname: string }>("SELECT relname FROM pg_class WHERE relnamespace = 'public'::regnamespace AND relkind IN ('r', 'p')")).map((row) => row.relname);
    for (const table of new Set([...schemaTables, ...liveTables])) {
      if (!MERCHANT_PREFIX.test(table) || REVIEWED_ORDINARY.has(table)) continue;
      assert.ok(registered.has(table), `${table} has a merchant-evidence name prefix, so it must be in evidence_tables (or reviewed as ordinary in retention_apply_runtime_grants)`);
    }
    for (const table of schemaTables) {
      assert.equal(
        (await ownerQuery<{ ok: boolean }>("SELECT has_table_privilege($1, to_regclass($2), 'SELECT') AS ok", [login.role, `public.${table}`]))[0].ok,
        true,
        `${table} is readable by the runtime role after the grant helper ran`,
      );
    }
    assert.equal(
      Number((await ownerQuery<{ n: string }>("SELECT count(*) AS n FROM pg_default_acl d WHERE d.defaclnamespace = 'public'::regnamespace AND d.defaclacl::text LIKE '%vecalss_runtime%'"))[0].n),
      0,
      "the runtime role has no default privileges on future tables or sequences",
    );
    const probe = await ownerClient();
    try {
      // A table created later starts with nothing for the runtime role.
      await probe.query("BEGIN");
      await probe.query("CREATE TABLE public.zz_plain_probe (id int)");
      await probe.query("CREATE SEQUENCE public.zz_plain_probe_seq");
      for (const privilege of ["SELECT", "INSERT", "UPDATE", "DELETE"]) {
        assert.equal((await probe.query("SELECT has_table_privilege($1, 'public.zz_plain_probe', $2) AS ok", [login.role, privilege])).rows[0].ok, false, `a new table gives the runtime role no ${privilege}`);
      }
      assert.equal((await probe.query("SELECT has_sequence_privilege($1, 'public.zz_plain_probe_seq', 'USAGE') AS ok", [login.role])).rows[0].ok, false, "…nor a new sequence");
      // The helper then grants an ordinary table what the app needs.
      await probe.query("SELECT public.retention_apply_runtime_grants()");
      assert.equal((await probe.query("SELECT has_table_privilege($1, 'public.zz_plain_probe', 'DELETE') AS ok", [login.role])).rows[0].ok, true);
      await probe.query("ROLLBACK");

      // A merchant-prefixed table that is not registered stops the helper, and nothing is granted.
      for (const name of ["payment_zz_probe", "checkout_zz_probe", "legal_zz_probe", "billing_zz_probe"]) {
        await probe.query("BEGIN");
        await probe.query(`CREATE TABLE public.${name} (id int)`);
        await assert.rejects(probe.query("SELECT public.retention_apply_runtime_grants()"), (error: unknown) => (error as { code?: string; message?: string }).code === "55000" && String((error as Error).message).includes(name), name);
        await probe.query("ROLLBACK");
        await probe.query("BEGIN");
        await probe.query(`CREATE TABLE public.${name} (id int)`);
        await probe.query("INSERT INTO evidence_tables (table_name, record_class, update_columns, runtime_insert, note) VALUES ($1, 'order_family', ARRAY[]::text[], true, 'uji')", [name]);
        await probe.query("SELECT public.retention_apply_runtime_grants()");
        const granted = await probe.query("SELECT has_table_privilege($1, $2, 'SELECT') AS s, has_table_privilege($1, $2, 'INSERT') AS i, has_table_privilege($1, $2, 'UPDATE') AS u, has_table_privilege($1, $2, 'DELETE') AS d", [login.role, `public.${name}`]);
        assert.deepEqual(granted.rows[0], { d: false, i: true, s: true, u: false }, `${name}: once registered it gets only the registry's rights`);
        await probe.query("ROLLBACK");
      }
    } finally {
      await probe.query("ROLLBACK").catch(() => undefined);
      await probe.end();
    }
    pass("no default privileges for the runtime role; a new table starts with none; the grant helper refuses an unregistered merchant-evidence table and grants a registered one only its registry rights; every such table is registered");

    // ---- The production readiness check ------------------------------------------------------------------------
    const clean = (await runtime.query("SELECT retention_role_check() AS r")).rows[0].r as { findings: string[]; ok: boolean };
    assert.deepEqual(clean, { findings: [], ok: true, role: login.role }, "the restricted login passes");
    const ownerCheck = (await ownerQuery<{ r: { findings: string[]; ok: boolean } }>("SELECT retention_role_check() AS r"))[0].r;
    assert.equal(ownerCheck.ok, false, "the schema owner fails");
    assert.ok(ownerCheck.findings.includes("superuser") && ownerCheck.findings.includes("owns_tables"));

    const admin = await ownerClient();
    try {
      const extraRole = admin.escapeIdentifier(extra.role);
      const probeFor = async (sql: string, expected: string) => {
        await admin.query(sql);
        const client = await extra.client();
        try {
          const result = (await client.query("SELECT retention_role_check() AS r")).rows[0].r as { findings: string[]; ok: boolean };
          assert.equal(result.ok, false, `${sql} must make the check fail`);
          assert.ok(result.findings.includes(expected), `${sql}: findings ${result.findings.join(",")} should include ${expected}`);
        } finally {
          await client.end();
        }
      };
      await probeFor(`GRANT vecalss_runtime TO ${extraRole} WITH ADMIN OPTION`, "runtime_admin_option");
      await admin.query(`REVOKE ADMIN OPTION FOR vecalss_runtime FROM ${extraRole}`);
      await probeFor(`GRANT DELETE ON payment_events TO ${extraRole}`, "delete:payment_events");
      await admin.query(`REVOKE DELETE ON payment_events FROM ${extraRole}`);
      await probeFor(`GRANT TRUNCATE ON audit_logs TO ${extraRole}`, "truncate:audit_logs");
      await admin.query(`REVOKE TRUNCATE ON audit_logs FROM ${extraRole}`);
      await probeFor(`GRANT UPDATE ON payment_orders TO ${extraRole}`, "update:payment_orders.id");
      await admin.query(`REVOKE UPDATE ON payment_orders FROM ${extraRole}`);
      await probeFor(`GRANT UPDATE (buyer_ip) ON payment_orders TO ${extraRole}`, "update:payment_orders.buyer_ip");
      await admin.query(`REVOKE UPDATE (buyer_ip) ON payment_orders FROM ${extraRole}`);
      await probeFor(`GRANT UPDATE (amount_rupiah) ON payment_events TO ${extraRole}`, "update:payment_events.amount_rupiah");
      await admin.query(`REVOKE UPDATE (amount_rupiah) ON payment_events FROM ${extraRole}`);
      await probeFor(`GRANT TRIGGER ON payment_orders TO ${extraRole}`, "trigger:payment_orders");
      await admin.query(`REVOKE TRIGGER ON payment_orders FROM ${extraRole}`);
      await probeFor(`GRANT CREATE ON SCHEMA public TO ${extraRole}`, "schema_create");
      await admin.query(`REVOKE CREATE ON SCHEMA public FROM ${extraRole}`);
      await probeFor(`GRANT vecalss_retention TO ${extraRole}`, "retention_member");
      await admin.query(`REVOKE vecalss_retention FROM ${extraRole}`);
      await probeFor(`ALTER ROLE ${extraRole} CREATEROLE`, "create_role");
      await admin.query(`ALTER ROLE ${extraRole} NOCREATEROLE`);
      await admin.query(`CREATE TABLE zz_owned_probe (id int)`);
      await probeFor(`ALTER TABLE zz_owned_probe OWNER TO ${extraRole}`, "owns_tables");
      await admin.query(`DROP TABLE zz_owned_probe`);
    } finally {
      await admin.end();
    }
    pass("the production role check passes the restricted login and flags a superuser, an owner, runtime ADMIN OPTION, schema CREATE, DELETE, TRUNCATE, TRIGGER, whole-table or stray UPDATE, and maintenance-role membership");
  } finally {
    await runtime.end().catch(() => undefined);
    for (const item of [login, extra]) await item.drop().catch(() => undefined);
    await prisma.$disconnect();
  }

  console.log(`retention roles: ${checks.length} checks passed`);
  for (const name of checks) console.log(` - ${name}`);
}

main().catch(async (error) => {
  console.error(error);
  await prisma.$disconnect().catch(() => undefined);
  process.exitCode = 1;
});
