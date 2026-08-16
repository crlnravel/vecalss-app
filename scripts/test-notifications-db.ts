import "dotenv/config";

import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";

import pg from "pg";

const { Client } = pg;
const TEST_DATABASE_ENV = "NOTIFICATIONS_TEST_DATABASE_URL";

function assertLocalDatabase(raw: string, runtimeDatabaseUrl: string | undefined) {
  let parsed: URL;
  try {
    parsed = new URL(raw);
  } catch {
    throw new Error(`${TEST_DATABASE_ENV} must be a valid PostgreSQL URL.`);
  }

  const hostname = parsed.hostname.toLowerCase().replace(/^\[|\]$/gu, "");
  const databaseName = decodeURIComponent(parsed.pathname.replace(/^\//u, ""));
  if (
    !["postgres:", "postgresql:"].includes(parsed.protocol)
    || !["localhost", "127.0.0.1", "::1"].includes(hostname)
    || !/(?:test|integration|notification)/iu.test(databaseName)
    || process.env.NODE_ENV === "production"
    || raw === runtimeDatabaseUrl?.trim()
  ) {
    throw new Error(`${TEST_DATABASE_ENV} must point to a distinct non-production local test database.`);
  }
}

function assertNotificationError(error: unknown, code: string) {
  return Boolean(
    error
    && typeof error === "object"
    && "code" in error
    && (error as { code?: unknown }).code === code,
  );
}

async function main() {
  const databaseUrl = process.env[TEST_DATABASE_ENV]?.trim();
  if (!databaseUrl) {
    console.log(`notification DB integration skipped: set ${TEST_DATABASE_ENV} to a distinct disposable local database URL.`);
    return;
  }

  assertLocalDatabase(databaseUrl, process.env.DATABASE_URL);
  process.env.DATABASE_URL = databaseUrl;

  const client = new Client({ connectionString: databaseUrl });
  let prismaClient: { $disconnect: () => Promise<void> } | null = null;
  const userIds = [
    randomUUID(),
    randomUUID(),
    randomUUID(),
    randomUUID(),
    randomUUID(),
    randomUUID(),
    randomUUID(),
    randomUUID(),
  ];
  const [
    actorUserId,
    eligibleOneUserId,
    eligibleTwoUserId,
    disabledUserId,
    noRoleUserId,
    softDeletedUserId,
    leftUserId,
    revokedRoleUserId,
  ] = userIds;
  const outsiderUserId = randomUUID();
  userIds.push(outsiderUserId);

  const activeCohortId = randomUUID();
  const emptyCohortId = randomUUID();
  const inactiveCohortId = randomUUID();
  const cohortIds = [activeCohortId, emptyCohortId, inactiveCohortId];
  const roleAssignmentIds = Array.from({ length: 8 }, () => randomUUID());
  const membershipIds = Array.from({ length: 8 }, () => randomUUID());
  const legacyNotificationId = randomUUID();
  const notificationIds: string[] = [legacyNotificationId];

  try {
    await client.connect();
    const tableCheck = await client.query<{ missing: string[] }>(
      `SELECT ARRAY_REMOVE(ARRAY[
        CASE WHEN to_regclass('public.users') IS NULL THEN 'users' END,
        CASE WHEN to_regclass('public.role_assignments') IS NULL THEN 'role_assignments' END,
        CASE WHEN to_regclass('public.cohorts') IS NULL THEN 'cohorts' END,
        CASE WHEN to_regclass('public.cohort_students') IS NULL THEN 'cohort_students' END,
        CASE WHEN to_regclass('public.notifications') IS NULL THEN 'notifications' END,
        CASE WHEN to_regclass('public.notification_deliveries') IS NULL THEN 'notification_deliveries' END,
        CASE WHEN to_regclass('public.audit_logs') IS NULL THEN 'audit_logs' END
      ], NULL) AS missing`,
    );
    assert.deepEqual(tableCheck.rows[0]?.missing ?? [], [], "The test database is missing the notification foundation migration.");

    const prismaModule = await import("@/lib/prisma");
    prismaClient = prismaModule.prisma;
    const {
      KelasNotificationError,
      getAndMarkStudentNotificationDetail,
      getStudentNotificationDetail,
      getStudentNotificationFeed,
      markAllStudentNotificationsRead,
      sendKelasNotification,
      validateKelasNotificationInput,
    } = await import("@/lib/notifications/service");

    const insertUser = async (id: string, status: string, softDeletedAt: Date | null = null) => {
      await client.query(
        `INSERT INTO users (id, email, full_name, password_hash, status, soft_deleted_at)
         VALUES ($1::uuid, $2, $3, 'notification-test-hash', $4::user_status, $5)`,
        [id, `notification-${id}@example.test`, `Notification Test ${id.slice(0, 8)}`, status, softDeletedAt],
      );
    };
    const insertRole = async (id: string, userId: string, role: string, revokedAt: Date | null = null) => {
      await client.query(
        `INSERT INTO role_assignments (id, user_id, role, revoked_at)
         VALUES ($1::uuid, $2::uuid, $3::role_name, $4)`,
        [id, userId, role, revokedAt],
      );
    };

    await insertUser(actorUserId, "active");
    await insertUser(eligibleOneUserId, "active");
    await insertUser(eligibleTwoUserId, "active");
    await insertUser(disabledUserId, "disabled");
    await insertUser(noRoleUserId, "active");
    await insertUser(softDeletedUserId, "active", new Date());
    await insertUser(leftUserId, "active");
    await insertUser(revokedRoleUserId, "active");
    await insertUser(outsiderUserId, "active");

    await insertRole(roleAssignmentIds[0]!, actorUserId, "admin");
    await insertRole(roleAssignmentIds[1]!, eligibleOneUserId, "student");
    await insertRole(roleAssignmentIds[2]!, eligibleTwoUserId, "student");
    await insertRole(roleAssignmentIds[3]!, disabledUserId, "student");
    await insertRole(roleAssignmentIds[4]!, softDeletedUserId, "student");
    await insertRole(roleAssignmentIds[5]!, leftUserId, "student");
    await insertRole(roleAssignmentIds[6]!, revokedRoleUserId, "student", new Date());
    await insertRole(roleAssignmentIds[7]!, outsiderUserId, "student");

    await client.query(
      `INSERT INTO cohorts (id, name, is_active)
       VALUES
         ($1::uuid, 'Notification Test Kelas', true),
         ($2::uuid, 'Notification Test Empty', true),
         ($3::uuid, 'Notification Test Inactive', false)`,
      cohortIds,
    );
    await client.query(
      `INSERT INTO cohort_students (id, cohort_id, student_id, left_at)
       VALUES
         ($1::uuid, $9::uuid, $10::uuid, NULL),
         ($2::uuid, $9::uuid, $10::uuid, NULL),
         ($3::uuid, $9::uuid, $11::uuid, NULL),
         ($4::uuid, $9::uuid, $12::uuid, NULL),
         ($5::uuid, $9::uuid, $13::uuid, NULL),
         ($6::uuid, $9::uuid, $14::uuid, NOW()),
         ($7::uuid, $9::uuid, $15::uuid, NULL),
         ($8::uuid, $9::uuid, $16::uuid, NULL)`,
      [
        ...membershipIds,
        activeCohortId,
        eligibleOneUserId,
        eligibleTwoUserId,
        disabledUserId,
        softDeletedUserId,
        leftUserId,
        noRoleUserId,
        revokedRoleUserId,
      ],
    );

    await assert.rejects(
      sendKelasNotification({
        actorUserId,
        body: "Pesan",
        cohortId: "not-a-uuid",
        title: "Judul",
      }),
      (error: unknown) => error instanceof KelasNotificationError && error.code === "invalid_cohort_id",
    );

    assert.throws(
      () => validateKelasNotificationInput({ body: "", title: "Judul" }),
      (error: unknown) => assertNotificationError(error, "invalid_body"),
    );
    assert.throws(
      () => validateKelasNotificationInput({ body: "Pesan", title: "" }),
      (error: unknown) => assertNotificationError(error, "invalid_title"),
    );

    const sendInput = {
      actorUserId,
      body: "Kelas dimulai pukul 19.00 WIB.\n\n**Siapkan catatan.** [Buka Zoom](https://us06web.zoom.us/j/123456789)",
      cohortId: activeCohortId,
      title: "Link kelas Zoom",
    };
    const sendResult = await sendKelasNotification(sendInput);
    assert.deepEqual(sendResult, { cohortName: "Notification Test Kelas", recipientCount: 2 });

    const sent = await client.query<{
      body: string;
      deep_link: string | null;
      id: string;
      recipient_user_id: string;
      source_entity_id: string;
      source_entity_type: string;
      title: string;
    }>(
      `SELECT id, recipient_user_id, title, body, deep_link, source_entity_type, source_entity_id
       FROM notifications
       WHERE source_entity_id = $1::uuid
       ORDER BY recipient_user_id`,
      [activeCohortId],
    );
    notificationIds.push(...sent.rows.map((row) => row.id));
    assert.equal(sent.rows.length, 2);
    assert.deepEqual(
      sent.rows.map((row) => row.recipient_user_id),
      [eligibleOneUserId, eligibleTwoUserId].sort(),
    );
    assert.ok(sent.rows.every((row) => (
      row.title === sendInput.title
      && row.body === sendInput.body
      && row.deep_link === null
      && row.source_entity_type === "cohort"
      && row.source_entity_id === activeCohortId
    )));

    const eligibleOneNotification = sent.rows.find((row) => row.recipient_user_id === eligibleOneUserId);
    assert.ok(eligibleOneNotification, "Expected an eligible notification for the first student.");
    assert.equal(
      (await getStudentNotificationDetail({
        notificationId: eligibleOneNotification.id,
        userId: eligibleOneUserId,
      }))?.body,
      sendInput.body,
    );
    assert.equal(
      await getStudentNotificationDetail({
        notificationId: eligibleOneNotification.id,
        userId: outsiderUserId,
      }),
      null,
    );
    const openedNotification = await getAndMarkStudentNotificationDetail({
      notificationId: eligibleOneNotification.id,
      userId: eligibleOneUserId,
    });
    assert.equal(openedNotification?.unread, false);

    const deliveries = await client.query<{ channel: string; recipient_user_id: string; status: string; notification_id: string }>(
      `SELECT d.notification_id, n.recipient_user_id, d.channel::text AS channel, d.status::text AS status
       FROM notification_deliveries d
       JOIN notifications n ON n.id = d.notification_id
       WHERE n.source_entity_id = $1::uuid`,
      [activeCohortId],
    );
    assert.equal(deliveries.rows.length, 2);
    assert.deepEqual(
      deliveries.rows
        .map((row) => ({ channel: row.channel, recipient: row.recipient_user_id, status: row.status }))
        .sort((left, right) => left.recipient.localeCompare(right.recipient)),
      [
        { channel: "in_app", recipient: eligibleOneUserId, status: "read" },
        { channel: "in_app", recipient: eligibleTwoUserId, status: "delivered" },
      ].sort((left, right) => left.recipient.localeCompare(right.recipient)),
    );

    const audit = await client.query<{ action: string; has_zoom_link: string; recipient_count: string; target_id: string; target_type: string }>(
      `SELECT action, target_type, target_id, metadata->>'hasZoomLink' AS has_zoom_link, metadata->>'recipientCount' AS recipient_count
       FROM audit_logs
       WHERE action = 'notification.kelas_sent' AND target_id = $1::uuid`,
      [activeCohortId],
    );
    assert.equal(audit.rows.length, 1);
    assert.deepEqual(audit.rows[0], {
      action: "notification.kelas_sent",
      has_zoom_link: "true",
      recipient_count: "2",
      target_id: activeCohortId,
      target_type: "cohort",
    });

    await client.query(
      `INSERT INTO notifications (id, recipient_user_id, event_type, title, body, deep_link)
       VALUES ($1::uuid, $2::uuid, 'announcement', 'Legacy link', 'Legacy body', 'http://legacy.example.test/meeting')`,
      [legacyNotificationId, outsiderUserId],
    );
    const outsiderFeed = await getStudentNotificationFeed({ userId: outsiderUserId });
    assert.deepEqual(
      outsiderFeed.items.find((item) => item.id === legacyNotificationId),
      {
        detail: "Legacy body",
        external: false,
        href: "/notifications",
        id: legacyNotificationId,
        time: "Baru saja",
        title: "Legacy link",
        unread: true,
      },
    );
    assert.equal(outsiderFeed.unreadCount, 1);

    const eligibleOneFeed = await getStudentNotificationFeed({ userId: eligibleOneUserId });
    const eligibleTwoFeed = await getStudentNotificationFeed({ userId: eligibleTwoUserId });
    assert.equal(eligibleOneFeed.unreadCount, 0);
    assert.equal(eligibleTwoFeed.unreadCount, 1);
    assert.ok(eligibleOneFeed.items.every((item) => sent.rows.some((row) => row.id === item.id)));
    assert.ok(eligibleTwoFeed.items.every((item) => sent.rows.some((row) => row.id === item.id)));

    await markAllStudentNotificationsRead(eligibleTwoUserId);
    const eligibleOneReadFeed = await getStudentNotificationFeed({ userId: eligibleOneUserId });
    const eligibleTwoReadFeed = await getStudentNotificationFeed({ userId: eligibleTwoUserId });
    assert.equal(eligibleOneReadFeed.unreadCount, 0);
    assert.equal(eligibleTwoReadFeed.unreadCount, 0);

    const readState = await client.query<{ recipient_user_id: string; status: string; read_at: Date | null }>(
      `SELECT n.recipient_user_id, n.read_at, d.status::text AS status
       FROM notifications n
       JOIN notification_deliveries d ON d.notification_id = n.id
       WHERE n.source_entity_id = $1::uuid
       ORDER BY n.recipient_user_id`,
      [activeCohortId],
    );
    assert.deepEqual(
      readState.rows.map((row) => ({ recipient: row.recipient_user_id, read: row.read_at !== null, status: row.status })),
      [
        { recipient: eligibleOneUserId, read: true, status: "read" },
        { recipient: eligibleTwoUserId, read: true, status: "read" },
      ].sort((left, right) => left.recipient.localeCompare(right.recipient)),
    );

    const beforeRollback = await client.query<{ count: number }>(
      "SELECT count(*)::int AS count FROM notifications WHERE source_entity_id = $1::uuid",
      [activeCohortId],
    );
    await assert.rejects(
      sendKelasNotification({ ...sendInput, actorUserId: randomUUID() }),
    );
    const afterRollback = await client.query<{ count: number }>(
      "SELECT count(*)::int AS count FROM notifications WHERE source_entity_id = $1::uuid",
      [activeCohortId],
    );
    assert.equal(afterRollback.rows[0]?.count, beforeRollback.rows[0]?.count);

    await assert.rejects(
      sendKelasNotification({ ...sendInput, cohortId: emptyCohortId }),
      (error: unknown) => error instanceof KelasNotificationError && error.code === "cohort_empty",
    );
    await assert.rejects(
      sendKelasNotification({ ...sendInput, cohortId: inactiveCohortId }),
      (error: unknown) => error instanceof KelasNotificationError && error.code === "cohort_not_found",
    );

    console.log("notification DB integration checks passed");
  } finally {
    try {
      await client.query(
        `DELETE FROM notification_deliveries
         WHERE notification_id = ANY($1::uuid[])
            OR notification_id IN (
              SELECT id FROM notifications WHERE source_entity_id = ANY($2::uuid[])
            )`,
        [notificationIds, cohortIds],
      );
      await client.query(
        `DELETE FROM notifications
         WHERE id = ANY($1::uuid[])
            OR source_entity_id = ANY($2::uuid[])`,
        [notificationIds, cohortIds],
      );
      await client.query(
        "DELETE FROM audit_logs WHERE action = 'notification.kelas_sent' AND target_id = ANY($1::uuid[])",
        [cohortIds],
      );
      await client.query("DELETE FROM cohort_students WHERE id = ANY($1::uuid[])", [membershipIds]);
      await client.query("DELETE FROM role_assignments WHERE id = ANY($1::uuid[])", [roleAssignmentIds]);
      await client.query("DELETE FROM users WHERE id = ANY($1::uuid[])", [userIds]);
      await client.query("DELETE FROM cohorts WHERE id = ANY($1::uuid[])", [cohortIds]);
    } finally {
      await prismaClient?.$disconnect();
      await client.end().catch(() => undefined);
    }
  }
}

void main().catch((error: unknown) => {
  console.error(error);
  process.exitCode = 1;
});
