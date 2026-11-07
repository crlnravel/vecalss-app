import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { createRuntimeLogin, ownerClient } from "./retention-test-kit";

async function main() {
  const suffix = randomUUID().replaceAll("-", "").slice(0, 10);
  const login = await createRuntimeLogin(`ms21_${suffix}`);
  const runtime = await login.client();
  const owner = await ownerClient();
  const probe = `zz_ms21_grants_${suffix}`;
  try {
    const identity = (await runtime.query("SELECT current_user AS who, rolsuper FROM pg_roles WHERE rolname = current_user")).rows[0];
    assert.equal(identity.who, login.role);
    assert.equal(identity.rolsuper, false, "assertions use a real restricted LOGIN connection");
    const pending = (await runtime.query("SELECT to_regclass('public.pending_authentications') IS NOT NULL AS present")).rows[0].present;
    if (pending) {
      for (const privilege of ["SELECT", "INSERT", "UPDATE", "DELETE"]) {
        assert.equal((await runtime.query("SELECT has_table_privilege('public.pending_authentications', $1) AS ok", [privilege])).rows[0].ok, true, `pending_authentications ${privilege}`);
      }
      await runtime.query("SELECT * FROM pending_authentications WHERE false");
      await runtime.query("INSERT INTO pending_authentications SELECT * FROM pending_authentications WHERE false");
      await runtime.query("UPDATE pending_authentications SET id = id WHERE false");
      await runtime.query("DELETE FROM pending_authentications WHERE false");
      console.log("PASS pending-authentication CRUD with a real restricted login");
    } else console.log("SKIP pending_authentications: peer-owned table absent from this database");

    await owner.query(`CREATE TABLE ${probe} (id integer PRIMARY KEY)`);
    const missing = (await runtime.query("SELECT retention_role_check() AS report")).rows[0].report;
    assert.equal(missing.ok, false);
    assert.ok(missing.findings.includes(`ordinary_access:${probe}`), "role check detects a new ordinary table before grants are applied");
    await owner.query("SELECT retention_apply_runtime_grants()");
    await runtime.query(`INSERT INTO ${probe} VALUES (1)`);
    assert.equal((await runtime.query(`SELECT id FROM ${probe}`)).rows[0].id, 1);
    await runtime.query(`UPDATE ${probe} SET id = 2 WHERE id = 1`);
    assert.equal((await runtime.query(`DELETE FROM ${probe} WHERE id = 2 RETURNING id`)).rows[0].id, 2);
    const fixed = (await runtime.query("SELECT retention_role_check() AS report")).rows[0].report;
    assert.ok(!fixed.findings.includes(`ordinary_access:${probe}`));
    console.log("PASS ordinary-table grant readiness detects and repairs missing CRUD");
  } finally {
    await owner.query(`DROP TABLE IF EXISTS ${probe}`);
    await runtime.end();
    await owner.end();
    await login.drop();
  }
}
main().catch((error) => { console.error(error); process.exitCode = 1; });
