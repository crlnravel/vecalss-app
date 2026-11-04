/**
 * The runtime login's provisioning (MS-10, hardened in MS-19 C-02). Used by
 * scripts/setup-runtime-role.mjs and its tests.
 *
 * The login must be a member of `vecalss_runtime` and of nothing else, own
 * nothing, and carry no role attribute beyond LOGIN. A reused login is inspected
 * before anything about it changes: any other membership (above all
 * `vecalss_retention`, which can switch to the maintenance role and bypass the
 * evidence guards) or any owned object stops the run, unless the owner passes
 * `revoke_extra`, which revokes extra memberships and nothing more. Ownership is
 * never moved automatically. After the change, the login connects for itself and
 * `retention_role_check()` must pass before success is reported.
 */
import pg from "pg";

const { Client } = pg;

const RUNTIME_ROLE = "vecalss_runtime";
const RETENTION_ROLE = "vecalss_retention";

class SetupError extends Error {
  constructor(message, findings = []) {
    super(message);
    this.findings = findings;
    this.name = "SetupError";
  }
}

/** Everything about an existing login that is more than "member of vecalss_runtime". */
async function inspectLogin(client, login) {
  const attributes = await client.query(
    "SELECT oid, rolsuper, rolcreaterole, rolcreatedb, rolreplication, rolbypassrls FROM pg_roles WHERE rolname = $1",
    [login],
  );
  if (attributes.rowCount === 0) return null;
  const [role] = attributes.rows;

  const privileges = [];
  if (role.rolsuper) privileges.push("superuser");
  if (role.rolcreaterole) privileges.push("create role");
  if (role.rolcreatedb) privileges.push("create database");
  if (role.rolreplication) privileges.push("replication");
  if (role.rolbypassrls) privileges.push("bypass row security");

  // Every role the login can reach, direct or through another role (MEMBER ignores NOINHERIT: SET ROLE works anyway).
  const memberships = (
    await client.query(
      "SELECT r.rolname::text AS name FROM pg_roles r WHERE r.oid <> $1::oid AND r.rolname <> $2 AND pg_has_role($1::oid, r.oid, 'MEMBER') ORDER BY 1",
      [role.oid, RUNTIME_ROLE],
    )
  ).rows.map((row) => row.name);
  const direct = new Set(
    (
      await client.query(
        "SELECT r.rolname::text AS name FROM pg_auth_members m JOIN pg_roles r ON r.oid = m.roleid WHERE m.member = $1::oid AND r.rolname <> $2",
        [role.oid, RUNTIME_ROLE],
      )
    ).rows.map((row) => row.name),
  );

  const owned = [];
  const relations = await client.query("SELECT n.nspname || '.' || c.relname AS name FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace WHERE c.relowner = $1::oid ORDER BY 1 LIMIT 10", [role.oid]);
  for (const row of relations.rows) owned.push(`table or index ${row.name}`);
  const counts = await client.query(
    `SELECT (SELECT count(*) FROM pg_proc WHERE proowner = $1::oid)::int AS functions,
            (SELECT count(*) FROM pg_namespace WHERE nspowner = $1::oid)::int AS schemas,
            (SELECT count(*) FROM pg_database WHERE datdba = $1::oid)::int AS databases`,
    [role.oid],
  );
  const [{ databases, functions, schemas }] = counts.rows;
  if (functions > 0) owned.push(`${functions} function(s)`);
  if (schemas > 0) owned.push(`${schemas} schema(s)`);
  if (databases > 0) owned.push(`${databases} database(s)`);

  return { direct, memberships, owned, privileges };
}

function describeFindings(login, inspected) {
  const findings = [];
  for (const privilege of inspected.privileges) findings.push(`${login} has the ${privilege} attribute`);
  for (const name of inspected.memberships) {
    findings.push(`${login} can act as ${name}${name === RETENTION_ROLE ? " (the maintenance role: it can bypass the evidence guards)" : ""}`);
  }
  for (const item of inspected.owned) findings.push(`${login} owns ${item}`);
  return findings;
}

/**
 * Creates the login, or resets the password of an existing one, as the schema
 * owner. Throws SetupError (with the findings) before changing anything when
 * the login is not clean; on success returns what was done and the result of
 * the login's own role check.
 */
async function provisionRuntimeLogin({ ownerUrl, login, password, revokeExtra = false, log = () => undefined }) {
  const client = new Client({ connectionString: ownerUrl });
  await client.connect();
  let created = false;
  const revoked = [];
  try {
    await client.query("BEGIN");
    for (const role of [RETENTION_ROLE, RUNTIME_ROLE]) {
      const exists = await client.query("SELECT 1 FROM pg_roles WHERE rolname = $1", [role]);
      if (exists.rowCount === 0) {
        await client.query(`CREATE ROLE ${client.escapeIdentifier(role)} NOLOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOREPLICATION NOBYPASSRLS`);
        log(`Created NOLOGIN role ${role}.`);
      }
    }

    const quotedLogin = client.escapeIdentifier(login);
    const literal = client.escapeLiteral(password);
    let inspected = await inspectLogin(client, login);

    if (!inspected) {
      await client.query(
        `CREATE ROLE ${quotedLogin} LOGIN PASSWORD ${literal} NOSUPERUSER NOCREATEDB NOCREATEROLE NOREPLICATION NOBYPASSRLS IN ROLE ${RUNTIME_ROLE}`,
      );
      created = true;
      log(`Created login role ${login}.`);
    } else {
      if (inspected.privileges.length > 0) {
        throw new SetupError(`${login} already exists with extra privileges. Pick another name or fix the role first.`, describeFindings(login, inspected));
      }
      if (inspected.memberships.length > 0 && revokeExtra) {
        for (const name of inspected.direct) {
          await client.query(`REVOKE ${client.escapeIdentifier(name)} FROM ${quotedLogin}`);
          revoked.push(name);
          log(`Revoked membership of ${name} from ${login}.`);
        }
        inspected = await inspectLogin(client, login);
      }
      const findings = describeFindings(login, inspected);
      if (findings.length > 0) {
        const hint = inspected.memberships.length > 0 && !revokeExtra ? " Run again with --revoke-extra to remove extra memberships, or pick a new login name." : " Ownership is never moved by this script: use a new login name.";
        throw new SetupError(`${login} is not a clean runtime login, so nothing about it was changed.${hint}`, findings);
      }
      await client.query(`ALTER ROLE ${quotedLogin} LOGIN PASSWORD ${literal} NOSUPERUSER NOCREATEDB NOCREATEROLE NOREPLICATION NOBYPASSRLS`);
      await client.query(`GRANT ${RUNTIME_ROLE} TO ${quotedLogin}`);
      log(`Updated the password of ${login}.`);
    }
    await client.query("COMMIT");
  } catch (error) {
    await client.query("ROLLBACK").catch(() => undefined);
    throw error;
  } finally {
    await client.end().catch(() => undefined);
  }

  const check = await checkLoginForItself({ login, ownerUrl, password });
  return { check, created, revoked };
}

/**
 * Connects as the login and asks the database whether it behaves like the
 * restricted runtime role. Before the migration exists there is nothing to ask;
 * that is reported as `pending` and is not a pass.
 */
async function checkLoginForItself({ login, ownerUrl, password }) {
  const url = new URL(ownerUrl);
  url.username = login;
  url.password = password;
  const client = new Client({ connectionString: url.toString() });
  try {
    await client.connect();
  } catch (error) {
    throw new SetupError(`The login ${login} was set up, but connecting as it failed (${error instanceof Error ? error.message : "unknown error"}). Do not use it until that works.`);
  }
  try {
    const available = await client.query("SELECT to_regprocedure('public.retention_role_check()') IS NOT NULL AS available");
    if (!available.rows[0].available) return { ok: null, pending: true, findings: [] };
    const { rows } = await client.query("SELECT public.retention_role_check() AS result");
    const result = rows[0].result;
    if (!result.ok) {
      throw new SetupError(`The runtime-role check failed for ${login}, so it must not be used: ${result.findings.join(", ")}.`, result.findings);
    }
    return { ok: true, pending: false, findings: [] };
  } finally {
    await client.end().catch(() => undefined);
  }
}

export { inspectLogin, provisionRuntimeLogin, SetupError };
