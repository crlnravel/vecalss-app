import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { randomBytes } from "node:crypto";

import pg from "pg";

import { provisionRuntimeLogin, SetupError } from "../lib/retention/runtime-login.mjs";
import { ownerClient, ownerUrl } from "./retention-test-kit";

/**
 * MS-19 C-02: the runtime-login provisioner checks a reused login before it
 * changes anything. A login that is already a member of vecalss_retention (or of
 * any role that is), or that owns a table, is refused with the findings and its
 * password is left alone; --revoke-extra removes extra memberships and nothing
 * more; a clean or new login is provisioned and must pass its own role check.
 * Local database only, with throwaway logins.
 */

const checks: string[] = [];
const pass = (name: string) => checks.push(name);

const suffix = randomBytes(3).toString("hex");
const name = (label: string) => `vecalss_prov_${label}_${suffix}`;
const secret = () => randomBytes(18).toString("hex");

const created: string[] = [];
const tables: string[] = [];

async function owner<T>(work: (client: pg.Client) => Promise<T>) {
  const client = await ownerClient();
  try {
    return await work(client);
  } finally {
    await client.end();
  }
}

/** A login the way an operator might have made it by hand: LOGIN, plus whatever the test adds. */
async function makeLogin(label: string, password: string, extra: string[] = []) {
  const role = name(label);
  created.push(role);
  await owner(async (client) => {
    await client.query(`CREATE ROLE ${client.escapeIdentifier(role)} LOGIN PASSWORD ${client.escapeLiteral(password)} NOSUPERUSER NOCREATEDB NOCREATEROLE NOREPLICATION NOBYPASSRLS`);
    for (const statement of extra) await client.query(statement.replaceAll("{role}", client.escapeIdentifier(role)));
  });
  return role;
}

async function canConnect(role: string, password: string) {
  const url = new URL(ownerUrl());
  url.username = role;
  url.password = password;
  const client = new pg.Client({ connectionString: url.toString() });
  try {
    await client.connect();
    return true;
  } catch {
    return false;
  } finally {
    await client.end().catch(() => undefined);
  }
}

const membersOf = (role: string) =>
  owner(async (client) => (await client.query("SELECT r.rolname FROM pg_auth_members m JOIN pg_roles r ON r.oid = m.roleid JOIN pg_roles u ON u.oid = m.member WHERE u.rolname = $1 ORDER BY 1", [role])).rows.map((row) => row.rolname as string));

const hasRuntimeAdminOption = (role: string) =>
  owner(async (client) => (await client.query(
    "SELECT m.admin_option FROM pg_auth_members m JOIN pg_roles r ON r.oid = m.roleid JOIN pg_roles u ON u.oid = m.member WHERE u.rolname = $1 AND r.rolname = 'vecalss_runtime'",
    [role],
  )).rows[0]?.admin_option === true);

async function refused(work: Promise<unknown>) {
  try {
    await work;
  } catch (error) {
    assert.ok(error instanceof SetupError, `expected a SetupError, got ${String(error)}`);
    return error;
  }
  return assert.fail("the provisioner should have refused");
}

async function main() {
  try {
    // ---- A clean existing login, and a new one ---------------------------------------------------------------------------------------
    const oldPassword = secret();
    const clean = await makeLogin("clean", oldPassword, ["GRANT vecalss_runtime TO {role}"]);
    const newPassword = secret();
    const result = await provisionRuntimeLogin({ login: clean, ownerUrl: ownerUrl(), password: newPassword });
    assert.equal(result.check.ok, true, "the login passed its own role check");
    assert.deepEqual(await membersOf(clean), ["vecalss_runtime"]);
    assert.equal(await canConnect(clean, newPassword), true, "the new password works");
    assert.equal(await canConnect(clean, oldPassword), false, "the old password does not");

    const fresh = name("fresh");
    created.push(fresh);
    const freshPassword = secret();
    const freshResult = await provisionRuntimeLogin({ login: fresh, ownerUrl: ownerUrl(), password: freshPassword });
    assert.equal(freshResult.created, true);
    assert.equal(freshResult.check.ok, true);
    assert.deepEqual(await membersOf(fresh), ["vecalss_runtime"]);
    pass("a clean existing login and a new login are provisioned, and each passes its own role check");

    // ---- ADMIN OPTION on the reused runtime membership is refused and removed only on request -------------------------------------------
    const adminOptionOld = secret();
    const adminOptionLogin = await makeLogin("adminopt", adminOptionOld, ["GRANT vecalss_runtime TO {role} WITH ADMIN OPTION"]);
    const adminOptionNew = secret();
    const adminOptionFailure = await refused(provisionRuntimeLogin({ login: adminOptionLogin, ownerUrl: ownerUrl(), password: adminOptionNew }));
    assert.ok(adminOptionFailure.findings.some((line: string) => line.includes("ADMIN OPTION") && line.includes("vecalss_runtime")));
    assert.deepEqual(await membersOf(adminOptionLogin), ["vecalss_runtime"], "the membership is untouched on refusal");
    assert.equal(await hasRuntimeAdminOption(adminOptionLogin), true);
    assert.equal(await canConnect(adminOptionLogin, adminOptionOld), true, "the password stays unchanged on refusal");
    assert.equal(await canConnect(adminOptionLogin, adminOptionNew), false);

    const adminOptionFixed = await provisionRuntimeLogin({ login: adminOptionLogin, ownerUrl: ownerUrl(), password: adminOptionNew, revokeExtra: true });
    assert.deepEqual(adminOptionFixed.revoked, ["ADMIN OPTION ON vecalss_runtime"]);
    assert.equal(adminOptionFixed.check.ok, true, "the real login passes its own role check after revocation");
    assert.deepEqual(await membersOf(adminOptionLogin), ["vecalss_runtime"], "revoking the option preserves ordinary runtime membership");
    assert.equal(await hasRuntimeAdminOption(adminOptionLogin), false);
    pass("a reused login with ADMIN OPTION on vecalss_runtime is refused without changes; --revoke-extra removes only the option and passes the real login check");

    // ---- A login that is already a member of vecalss_retention ---------------------------------------------------------------------------
    const retentionOld = secret();
    const member = await makeLogin("member", retentionOld, ["GRANT vecalss_runtime TO {role}", "GRANT vecalss_retention TO {role}"]);
    const memberNew = secret();
    const failure = await refused(provisionRuntimeLogin({ login: member, ownerUrl: ownerUrl(), password: memberNew }));
    assert.ok(failure.findings.some((line: string) => line.includes("vecalss_retention")), `the findings name the maintenance role: ${failure.findings.join("; ")}`);
    assert.deepEqual(await membersOf(member), ["vecalss_retention", "vecalss_runtime"], "nothing was changed");
    assert.equal(await canConnect(member, retentionOld), true, "the password was not changed");
    assert.equal(await canConnect(member, memberNew), false);
    // Without the flag it never revokes; with it, it removes the membership and then must pass the check.
    const revoked = await provisionRuntimeLogin({ login: member, ownerUrl: ownerUrl(), password: memberNew, revokeExtra: true });
    assert.deepEqual(revoked.revoked, ["vecalss_retention"]);
    assert.equal(revoked.check.ok, true);
    assert.deepEqual(await membersOf(member), ["vecalss_runtime"]);
    assert.equal(await canConnect(member, memberNew), true);
    pass("a login that is a member of vecalss_retention is refused with the finding and left untouched; --revoke-extra removes the membership and the role check then passes");

    // ---- Membership that arrives through another role -----------------------------------------------------------------------------------
    const groupName = name("group");
    created.push(groupName);
    await owner(async (client) => {
      await client.query(`CREATE ROLE ${client.escapeIdentifier(groupName)} NOLOGIN`);
      await client.query(`GRANT vecalss_retention TO ${client.escapeIdentifier(groupName)}`);
    });
    const viaGroupPassword = secret();
    const viaGroup = await makeLogin("viagroup", viaGroupPassword, ["GRANT vecalss_runtime TO {role}", `GRANT ${groupName} TO {role}`]);
    const viaFailure = await refused(provisionRuntimeLogin({ login: viaGroup, ownerUrl: ownerUrl(), password: secret() }));
    assert.ok(viaFailure.findings.some((line: string) => line.includes("vecalss_retention")), "reaching vecalss_retention through another role is found too");
    const viaFixed = await provisionRuntimeLogin({ login: viaGroup, ownerUrl: ownerUrl(), password: secret(), revokeExtra: true });
    assert.equal(viaFixed.check.ok, true);
    assert.deepEqual(await membersOf(viaGroup), ["vecalss_runtime"]);
    pass("membership reached through another role is found, and revoked by --revoke-extra");

    // ---- A login that owns a table: never moved, even with --revoke-extra ---------------------------------------------------------------
    const ownsPassword = secret();
    const owns = await makeLogin("owns", ownsPassword, ["GRANT vecalss_runtime TO {role}"]);
    const table = `prov_owned_${suffix}`;
    tables.push(table);
    await owner(async (client) => {
      await client.query(`CREATE TABLE public.${table} (id int)`);
      await client.query(`ALTER TABLE public.${table} OWNER TO ${client.escapeIdentifier(owns)}`);
    });
    for (const revokeExtra of [false, true]) {
      const ownsFailure = await refused(provisionRuntimeLogin({ login: owns, ownerUrl: ownerUrl(), password: secret(), revokeExtra }));
      assert.ok(ownsFailure.findings.some((line: string) => line.includes(table)), `the owned table is listed: ${ownsFailure.findings.join("; ")}`);
    }
    assert.equal(await canConnect(owns, ownsPassword), true, "the password was not changed");
    pass("a login that owns a table is refused with the table named, with or without --revoke-extra, and its password is left alone");

    // ---- Role attributes (the original checks still hold) ---------------------------------------------------------------------------------
    const powerful = await makeLogin("power", secret(), ["GRANT vecalss_runtime TO {role}", "ALTER ROLE {role} CREATEDB"]);
    const powerFailure = await refused(provisionRuntimeLogin({ login: powerful, ownerUrl: ownerUrl(), password: secret(), revokeExtra: true }));
    assert.ok(powerFailure.findings.some((line: string) => line.includes("create database")));
    pass("a login with extra role attributes is refused");

    // ---- The command line --------------------------------------------------------------------------------------------------------------------
    const cliPassword = secret();
    const cliLogin = await makeLogin("cli", cliPassword, ["GRANT vecalss_runtime TO {role}", "GRANT vecalss_retention TO {role}"]);
    const cliEnv = { ...process.env, DATABASE_URL: ownerUrl(), MIGRATE_DATABASE_URL: ownerUrl(), RUNTIME_DB_PASSWORD: secret() };
    const run = (args: string[]) => spawnSync(process.execPath, ["scripts/setup-runtime-role.mjs", ...args], { cwd: new URL("..", import.meta.url).pathname, encoding: "utf8", env: cliEnv });
    const dry = run(["--login", cliLogin]);
    assert.equal(dry.status, 0);
    assert.match(dry.stdout, /Dry run/u);
    const cliRefused = run(["--login", cliLogin, "--yes"]);
    assert.notEqual(cliRefused.status, 0);
    assert.match(cliRefused.stderr, /vecalss_retention/u);
    assert.match(cliRefused.stderr, /not a clean runtime login/u);
    const cliDone = run(["--login", cliLogin, "--yes", "--revoke-extra"]);
    assert.equal(cliDone.status, 0, cliDone.stderr);
    assert.match(cliDone.stdout, /role check passed/u);
    assert.equal(`${cliDone.stdout}${cliDone.stderr}`.includes(cliEnv.RUNTIME_DB_PASSWORD), false, "the password is never printed");
    assert.deepEqual(await membersOf(cliLogin), ["vecalss_runtime"]);
    pass("the command refuses an unclean login with the findings, applies --revoke-extra only when asked, and never prints the password");
  } finally {
    await owner(async (client) => {
      for (const table of tables) await client.query(`DROP TABLE IF EXISTS public.${table}`);
      for (const role of created) await client.query(`DROP ROLE IF EXISTS ${client.escapeIdentifier(role)}`);
    });
  }

  console.log(`retention provisioning: ${checks.length} checks passed`);
  for (const line of checks) console.log(` - ${line}`);
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
