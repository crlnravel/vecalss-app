import "dotenv/config";

import assert from "node:assert/strict";
import { createHash, randomUUID } from "node:crypto";
import { fileURLToPath } from "node:url";
import { spawn, type ChildProcess } from "node:child_process";
import { dirname, resolve } from "node:path";

import pg from "pg";

const { Client } = pg;
const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const MAX_REQUEST_BYTES = 2 * 1024 * 1024;
const SESSION_COOKIE_NAME = "vecalss_session";
const TEST_DATABASE_ENV = "ADMIN_IMPORT_TEST_DATABASE_URL";

type Fixture = {
  adminId: string;
  adminToken: string;
  importIds: string[];
  lastSeenAt: Date;
  ownerId: string;
  ownerToken: string;
};

function assertLocalTestDatabase(raw: string) {
  let parsed: URL;
  try {
    parsed = new URL(raw);
  } catch {
    throw new Error(`${TEST_DATABASE_ENV} must be a valid PostgreSQL URL.`);
  }

  const hostname = parsed.hostname.toLowerCase().replace(/^\[|\]$/gu, "");
  const localHost = hostname === "localhost" || hostname === "127.0.0.1" || hostname === "::1";
  const databaseName = decodeURIComponent(parsed.pathname.replace(/^\//u, ""));
  if (
    !["postgres:", "postgresql:"].includes(parsed.protocol)
    || !localHost
    || !/(?:test|integration|import)/iu.test(databaseName)
    || process.env.NODE_ENV === "production"
  ) {
    throw new Error(`${TEST_DATABASE_ENV} must point to a non-production local test database.`);
  }

  const configuredUrl = process.env.DATABASE_URL?.trim();
  if (configuredUrl && configuredUrl === raw) {
    throw new Error(`${TEST_DATABASE_ENV} must be distinct from DATABASE_URL.`);
  }
}

function hashToken(value: string) {
  return createHash("sha256").update(value).digest("hex");
}

function assertWellFormedJsonStrings(value: unknown) {
  if (typeof value === "string") {
    assert.doesNotThrow(() => encodeURIComponent(value));
    assert.equal(value.includes("\u0000"), false);
    return;
  }
  if (Array.isArray(value)) {
    for (const item of value) {
      assertWellFormedJsonStrings(item);
    }
    return;
  }
  if (typeof value === "object" && value !== null) {
    for (const item of Object.values(value)) {
      assertWellFormedJsonStrings(item);
    }
  }
}

function chunkedBody(bytes: Uint8Array, size = 5) {
  return new ReadableStream<Uint8Array>({
    start(controller) {
      for (let offset = 0; offset < bytes.byteLength; offset += size) {
        controller.enqueue(bytes.slice(offset, Math.min(offset + size, bytes.byteLength)));
      }
      controller.close();
    },
  });
}

function multipartBody({
  csv,
  filename,
  template,
}: {
  csv: string;
  filename: string;
  template: "students.v1" | "kapten.v1";
}) {
  const boundary = `admin-import-db-${randomUUID()}`;
  const parts = [
    `--${boundary}\r\nContent-Disposition: form-data; name="template"\r\n\r\n${template}\r\n`,
    `--${boundary}\r\nContent-Disposition: form-data; name="role"\r\n\r\n${template === "students.v1" ? "student" : "tutor"}\r\n`,
    `--${boundary}\r\nContent-Disposition: form-data; name="file"; filename="${filename}"\r\nContent-Type: text/csv\r\n\r\n${csv}\r\n`,
    `--${boundary}--\r\n`,
  ];
  return {
    body: new TextEncoder().encode(parts.join("")),
    contentType: `multipart/form-data; boundary=${boundary}`,
  };
}

async function waitForServer(child: ChildProcess, url: string) {
  let output = "";
  child.stdout?.on("data", (chunk: Buffer) => {
    output = `${output}${chunk.toString()}`.slice(-4_000);
  });
  child.stderr?.on("data", (chunk: Buffer) => {
    output = `${output}${chunk.toString()}`.slice(-4_000);
  });

  for (let attempt = 0; attempt < 120; attempt += 1) {
    if (child.exitCode !== null) {
      throw new Error(`The isolated Next server exited before readiness: ${output}`);
    }
    try {
      await fetch(url, { redirect: "manual" });
      return;
    } catch {
      await new Promise((resolvePromise) => setTimeout(resolvePromise, 500));
    }
  }

  throw new Error(`The isolated Next server did not become ready: ${output}`);
}

async function stopServer(child: ChildProcess) {
  if (child.exitCode !== null) {
    return;
  }
  child.kill("SIGTERM");
  await new Promise<void>((resolvePromise) => {
    const timer = setTimeout(() => {
      child.kill("SIGKILL");
      resolvePromise();
    }, 5_000);
    child.once("exit", () => {
      clearTimeout(timer);
      resolvePromise();
    });
  });
}

async function createFixture(client: pg.Client): Promise<Fixture> {
  const adminId = randomUUID();
  const ownerId = randomUUID();
  const adminRoleId = randomUUID();
  const studentRoleId = randomUUID();
  const ownerRoleId = randomUUID();
  const adminToken = `admin-${randomUUID()}`;
  const ownerToken = `owner-${randomUUID()}`;
  const lastSeenAt = new Date("2020-01-01T00:00:00.000Z");

  await client.query(
    `INSERT INTO users (id, email, full_name, password_hash, status)
     VALUES ($1::uuid, $2, $3, $4, 'active'), ($5::uuid, $6, $7, $8, 'active')`,
    [
      adminId,
      `import-db-admin-${adminId}@example.test`,
      "Import DB Admin",
      "fixture-password-hash",
      ownerId,
      `import-db-owner-${ownerId}@example.test`,
      "Import DB Owner",
      "fixture-password-hash",
    ],
  );
  await client.query(
    `INSERT INTO role_assignments (id, user_id, role)
     VALUES ($1::uuid, $2::uuid, 'admin'), ($3::uuid, $2::uuid, 'student'), ($4::uuid, $5::uuid, 'admin')`,
    [adminRoleId, adminId, studentRoleId, ownerRoleId, ownerId],
  );
  await client.query(
    `INSERT INTO auth_sessions (id, user_id, refresh_token_hash, status, expires_at, last_seen_at)
     VALUES ($1::uuid, $2::uuid, $3, 'active', now() + interval '1 hour', $4::timestamptz),
            ($5::uuid, $6::uuid, $7, 'active', now() + interval '1 hour', $4::timestamptz)`,
    [randomUUID(), adminId, hashToken(adminToken), lastSeenAt, randomUUID(), ownerId, hashToken(ownerToken)],
  );

  return { adminId, adminToken, importIds: [], lastSeenAt, ownerId, ownerToken };
}

async function accountSnapshot(client: pg.Client, fixture: Fixture) {
  const userIds = [fixture.adminId, fixture.ownerId];
  const [users, sessions, roles, studentProfiles, tutorProfiles, handoffs, resetTokens, loginAttempts] = await Promise.all([
    client.query("SELECT * FROM users WHERE id = ANY($1::uuid[]) ORDER BY id", [userIds]),
    client.query("SELECT * FROM auth_sessions WHERE user_id = ANY($1::uuid[]) ORDER BY id", [userIds]),
    client.query("SELECT * FROM role_assignments WHERE user_id = ANY($1::uuid[]) ORDER BY id", [userIds]),
    client.query("SELECT * FROM student_profiles WHERE user_id = ANY($1::uuid[]) ORDER BY user_id", [userIds]),
    client.query("SELECT * FROM tutor_profiles WHERE user_id = ANY($1::uuid[]) ORDER BY user_id", [userIds]),
    client.query("SELECT COUNT(*)::int AS count FROM enrollment_handoffs WHERE user_id = ANY($1::uuid[])", [userIds]),
    client.query("SELECT COUNT(*)::int AS count FROM password_reset_tokens WHERE user_id = ANY($1::uuid[])", [userIds]),
    client.query("SELECT COUNT(*)::int AS count FROM login_attempts WHERE user_id = ANY($1::uuid[])", [userIds]),
  ]);
  return JSON.stringify({
    handoffs: handoffs.rows[0]?.count,
    loginAttempts: loginAttempts.rows[0]?.count,
    resetTokens: resetTokens.rows[0]?.count,
    roles: roles.rows,
    sessions: sessions.rows,
    studentProfiles: studentProfiles.rows,
    tutorProfiles: tutorProfiles.rows,
    users: users.rows,
  });
}

async function countRows(client: pg.Client, table: string) {
  const result = await client.query<{ count: number }>(`SELECT COUNT(*)::int AS count FROM ${table}`);
  return result.rows[0]?.count ?? 0;
}

async function cleanupFixture(client: pg.Client, fixture: Fixture) {
  if (fixture.importIds.length) {
    await client.query("DELETE FROM audit_logs WHERE target_id = ANY($1::uuid[])", [fixture.importIds]);
    await client.query("DELETE FROM enrollment_imports WHERE id = ANY($1::uuid[])", [fixture.importIds]);
  }
  await client.query("DELETE FROM auth_sessions WHERE user_id = ANY($1::uuid[])", [[fixture.adminId, fixture.ownerId]]);
  await client.query("DELETE FROM role_assignments WHERE user_id = ANY($1::uuid[])", [[fixture.adminId, fixture.ownerId]]);
  await client.query("DELETE FROM users WHERE id = ANY($1::uuid[])", [[fixture.adminId, fixture.ownerId]]);
}

async function requireStatus(response: Response, expected: number) {
  if (response.status !== expected) {
    throw new Error(`Expected HTTP ${expected}, received ${response.status}: ${await response.text()}`);
  }
}

async function main() {
  const rawTestUrl = process.env[TEST_DATABASE_ENV]?.trim();
  if (!rawTestUrl) {
    console.log(`admin import DB integration skipped: ${TEST_DATABASE_ENV} is not set; DATABASE_URL is never used.`);
    return;
  }
  assertLocalTestDatabase(rawTestUrl);

  const originalDatabaseUrl = process.env.DATABASE_URL;
  process.env.DATABASE_URL = rawTestUrl;
  const client = new Client({ connectionString: rawTestUrl });
  let fixture: Fixture | undefined;
  let server: ChildProcess | undefined;
  try {
    await client.connect();
    const requiredTables = ["users", "auth_sessions", "role_assignments", "student_profiles", "tutor_profiles", "enrollment_imports", "enrollment_import_rows", "audit_logs"];
    const tableCheck = await client.query<{ missing: string[] }>(
      `SELECT ARRAY_REMOVE(ARRAY[
        ${requiredTables.map((table) => `CASE WHEN to_regclass('public.${table}') IS NULL THEN '${table}' END`).join(",")}
      ], NULL) AS missing`,
    );
    assert.deepEqual(tableCheck.rows[0]?.missing ?? [], [], "The isolated database is missing the existing application schema; no migration is run by this harness.");

    fixture = await createFixture(client);
    const beforeAccounts = await accountSnapshot(client, fixture);
    const beforeImports = await countRows(client, "enrollment_imports");
    const beforeAudits = await countRows(client, "audit_logs");
    const port = 43_000 + Math.floor(Math.random() * 1_000);
    const startedServer = spawn("pnpm", ["next", "dev", "--port", String(port)], {
      cwd: ROOT,
      env: {
        ...process.env,
        APP_BASE_URL: `http://127.0.0.1:${port}`,
        DATABASE_URL: rawTestUrl,
        NEXT_TELEMETRY_DISABLED: "1",
        NODE_ENV: "development",
      },
      stdio: ["ignore", "pipe", "pipe"],
    });
    server = startedServer;
    await waitForServer(startedServer, `http://127.0.0.1:${port}/api/admin/imports/templates/students.v1`);

    const adminCookie = `${SESSION_COOKIE_NAME}=${fixture.adminToken}`;
    const ownerCookie = `${SESSION_COOKIE_NAME}=${fixture.ownerToken}`;
    const postPreview = async (template: "students.v1" | "kapten.v1", csv: string, filename: string, cookie = adminCookie) => {
      const multipart = multipartBody({ csv, filename, template });
      return fetch(`http://127.0.0.1:${port}/api/admin/imports/preview`, {
        body: chunkedBody(multipart.body),
        duplex: "half",
        headers: {
          cookie,
          origin: `http://127.0.0.1:${port}`,
          "content-type": multipart.contentType,
        },
        method: "POST",
      } as RequestInit);
    };

    const originRejected = await fetch(`http://127.0.0.1:${port}/api/admin/imports/preview`, {
      headers: { cookie: adminCookie, origin: "https://evil.example" },
      method: "POST",
    });
    assert.equal(originRejected.status, 403);

    const studentCsv = [
      "email,full_name,target_exam",
      `nul\u0000@example.com,${"n".repeat(159)}😀x,${"e".repeat(159)}😀x`,
    ].join("\r\n");
    const studentResponse = await postPreview("students.v1", studentCsv, `${"f".repeat(119)}𠀀.csv`);
    await requireStatus(studentResponse, 200);
    const studentPayload = await studentResponse.json() as { draft: { importId: string; rows: Array<{ input: unknown; errorCode: string | null }> } };
    assert.equal(studentPayload.draft.rows.length, 1);
    assert.equal(studentPayload.draft.rows[0]?.errorCode, "field_contains_control_character");
    assertWellFormedJsonStrings(studentPayload.draft.rows[0]?.input);
    fixture.importIds.push(studentPayload.draft.importId);

    const kaptenCsv = [
      "email,full_name,phone,headline,bio",
      `kapten\u0000@example.com,Name\u0000,+62\u0000,Lead\u0000,Bio\u0000`,
    ].join("\r\n");
    const kaptenResponse = await postPreview("kapten.v1", kaptenCsv, "kapten.csv");
    await requireStatus(kaptenResponse, 200);
    const kaptenPayload = await kaptenResponse.json() as { draft: { importId: string; rows: Array<{ input: unknown; errorCode: string | null }> } };
    assert.equal(kaptenPayload.draft.rows[0]?.errorCode, "field_contains_control_character");
    assertWellFormedJsonStrings(kaptenPayload.draft.rows[0]?.input);
    fixture.importIds.push(kaptenPayload.draft.importId);

    const malformedStatus = await fetch(`http://127.0.0.1:${port}/api/admin/imports/not-a-uuid`, { headers: { cookie: adminCookie } });
    assert.equal(malformedStatus.status, 400);
    const statusResponse = await fetch(`http://127.0.0.1:${port}/api/admin/imports/${fixture.importIds[0]}`, { headers: { cookie: adminCookie } });
    assert.equal(statusResponse.status, 200);
    const foreignStatus = await fetch(`http://127.0.0.1:${port}/api/admin/imports/${fixture.importIds[0]}`, { headers: { cookie: ownerCookie } });
    assert.equal(foreignStatus.status, 404);
    const foreignSkip = await fetch(`http://127.0.0.1:${port}/api/admin/imports/${fixture.importIds[0]}/rows/skip`, {
      body: JSON.stringify({ rowNumbers: [1] }),
      headers: { cookie: ownerCookie, origin: `http://127.0.0.1:${port}`, "content-type": "application/json" },
      method: "POST",
    });
    assert.equal(foreignSkip.status, 404);
    const validSkip = await fetch(`http://127.0.0.1:${port}/api/admin/imports/${fixture.importIds[0]}/rows/skip`, {
      body: JSON.stringify({ rowNumbers: [1] }),
      headers: { cookie: adminCookie, origin: `http://127.0.0.1:${port}`, "content-type": "application/json" },
      method: "POST",
    });
    await requireStatus(validSkip, 200);

    const overflowBefore = await countRows(client, "enrollment_imports");
    const rows501 = ["email,full_name,target_exam", ...Array.from({ length: 501 }, (_, index) => `overflow${index}@example.com,Row ${index},`)].join("\n");
    const overflowResponse = await postPreview("students.v1", rows501, "overflow.csv");
    assert.equal(overflowResponse.status, 413);
    const oversized = `email,full_name,target_exam\nlarge@example.com,${"x".repeat(MAX_REQUEST_BYTES)},`;
    const oversizedResponse = await postPreview("students.v1", oversized, "oversized.csv");
    assert.equal(oversizedResponse.status, 413);
    assert.equal(await countRows(client, "enrollment_imports"), overflowBefore);

    const afterAccounts = await accountSnapshot(client, fixture);
    assert.equal(afterAccounts, beforeAccounts, "Preview/status/skip changed an account, role, profile, session, or handoff row.");
    assert.equal(await countRows(client, "enrollment_imports"), beforeImports + 2);
    assert.equal(await countRows(client, "audit_logs"), beforeAudits + 3);
    const persistedRows = await client.query<{ input_json: unknown; error_code: string | null }>(
      "SELECT r.input_json, r.error_code FROM enrollment_import_rows r WHERE r.import_id = ANY($1::uuid[]) ORDER BY r.import_id, r.row_number",
      [fixture.importIds],
    );
    assert.equal(persistedRows.rows.length, 2);
    for (const row of persistedRows.rows) {
      assertWellFormedJsonStrings(row.input_json);
      assert.equal(row.error_code, "field_contains_control_character");
    }

    const { getReadOnlySessionContextForToken } = await import("@/lib/auth/session");
    const readOnlyContext = await getReadOnlySessionContextForToken(fixture.adminToken);
    assert.equal(readOnlyContext?.user.id, fixture.adminId);
    assert.equal(await accountSnapshot(client, fixture), beforeAccounts, "Read-only admin auth changed account/session/profile state.");

    // A legacy account may retain active status after soft deletion. The
    // normal session path must reject it before student-profile provisioning
    // or any authenticated mutation is reached.
    const beforeLegacyProfileCount = await client.query<{ count: number }>(
      "SELECT COUNT(*)::int AS count FROM student_profiles WHERE user_id = $1::uuid",
      [fixture.adminId],
    );
    await client.query(
      "UPDATE users SET status = 'active', soft_deleted_at = now() WHERE id = $1::uuid",
      [fixture.adminId],
    );
    const softDeletedNormalSession = await fetch(`http://127.0.0.1:${port}/api/admin/imports/${fixture.importIds[0]}/confirm`, {
      body: JSON.stringify({ handoffMethod: "invite_link" }),
      headers: {
        cookie: adminCookie,
        origin: `http://127.0.0.1:${port}`,
        "content-type": "application/json",
      },
      method: "POST",
      redirect: "manual",
    });
    assert.ok([307, 308].includes(softDeletedNormalSession.status));
    assert.match(softDeletedNormalSession.headers.get("location") ?? "", /login/u);
    const afterLegacyProfileCount = await client.query<{ count: number }>(
      "SELECT COUNT(*)::int AS count FROM student_profiles WHERE user_id = $1::uuid",
      [fixture.adminId],
    );
    assert.equal(afterLegacyProfileCount.rows[0]?.count, beforeLegacyProfileCount.rows[0]?.count);
    await client.query(
      "UPDATE users SET soft_deleted_at = NULL WHERE id = $1::uuid",
      [fixture.adminId],
    );
    console.log("admin import DB integration checks passed (isolated local database only)");
  } finally {
    if (server) {
      await stopServer(server);
    }
    if (fixture) {
      await cleanupFixture(client, fixture).catch(() => undefined);
    }
    await client.end().catch(() => undefined);
    if (originalDatabaseUrl === undefined) {
      delete process.env.DATABASE_URL;
    } else {
      process.env.DATABASE_URL = originalDatabaseUrl;
    }
  }
}

await main();
