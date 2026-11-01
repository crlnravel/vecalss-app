import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";

import { listOpenTryoutResultReviewAlerts, notifyTryoutResultReviewRequired, TRYOUT_RESULT_REVIEW_SOURCE_ENTITY_TYPE } from "@/lib/notifications/tryout-result-review";
import { prisma } from "@/lib/prisma";

// Dev-database contract: needs the seeded Tryout (pnpm db:seed or node prisma/seed-assessment.mjs).
const attempt = await prisma.tryoutAttempt.findFirst({
  orderBy: { id: "asc" },
  select: { id: true, runs: { select: { contentSnapshot: true, id: true }, where: { sequenceNo: 1 } } },
  where: { releaseState: "released", student: { email: "dimas@vecalss.local" } },
});
assert(attempt && attempt.runs.length === 1, "seeded released attempt for dimas@vecalss.local is required");
const run = attempt.runs[0];
const original = run.contentSnapshot;

// Throwaway accounts proving who is NOT notified. Active Kapten are read from the real data.
const tag = randomUUID().slice(0, 8);
const makeUser = (kind: string, role: "tutor" | "admin" | "student", status: "active" | "locked") => prisma.user.create({
  data: { email: `alert-test-${kind}-${tag}@example.invalid`, fullName: `Alert Test ${kind}`, passwordHash: "x", roleAssignments: { create: { role } }, status },
  select: { id: true },
});
const [lockedKapten, adminOnly, student] = await Promise.all([makeUser("locked", "tutor", "locked"), makeUser("admin", "admin", "active"), makeUser("student", "student", "active")]);
const excluded = [lockedKapten.id, adminOnly.id, student.id];

const sourceRows = () => prisma.notification.findMany({ where: { sourceEntityId: attempt.id, sourceEntityType: TRYOUT_RESULT_REVIEW_SOURCE_ENTITY_TYPE } });
const clean = async () => {
  await prisma.notificationDelivery.deleteMany({ where: { notification: { sourceEntityId: attempt.id, sourceEntityType: TRYOUT_RESULT_REVIEW_SOURCE_ENTITY_TYPE } } });
  await prisma.notification.deleteMany({ where: { sourceEntityId: attempt.id, sourceEntityType: TRYOUT_RESULT_REVIEW_SOURCE_ENTITY_TYPE } });
};

try {
  await clean();
  // Independent restatement of "active Kapten": tutor role, active, not deleted, not a preview account.
  const activeKapten = (await prisma.user.findMany({
    select: { id: true },
    where: { id: { notIn: excluded }, previewPurpose: null, roleAssignments: { some: { revokedAt: null, role: "tutor" } }, softDeletedAt: null, status: "active" },
  })).map((user) => user.id).sort();
  assert(activeKapten.length >= 1, "at least one active Kapten is required");
  for (const id of activeKapten) assert.deepEqual(await listOpenTryoutResultReviewAlerts(id), [], "a healthy result raises no alert");

  // Break the stored result exactly like the seed defect: items lose their questionType.
  const broken = JSON.parse(JSON.stringify(original)) as { items: Array<Record<string, unknown>> };
  broken.items = broken.items.map(({ questionType: _removed, ...item }) => item);
  await prisma.tryoutAttemptTestRun.update({ data: { contentSnapshot: broken as object }, where: { id: run.id } });

  await Promise.all([notifyTryoutResultReviewRequired(attempt.id), notifyTryoutResultReviewRequired(attempt.id)]);
  await notifyTryoutResultReviewRequired(attempt.id);
  const rows = await sourceRows();
  assert.deepEqual(rows.map((row) => row.recipientUserId).sort(), activeKapten, "every active Kapten gets exactly one alert, repeated or concurrent opens add none");
  for (const id of excluded) assert(!rows.some((row) => row.recipientUserId === id), "locked Kapten, admin-only and student accounts get nothing");
  for (const row of rows) {
    assert.equal(row.title, "Hasil Tryout perlu diperiksa");
    assert.match(row.body, /belum bisa membuka hasil/);
    assert.doesNotMatch(`${row.title} ${row.body}`, /AssessmentRelease|snapshot|digest|questionType/i, "alert text stays non-technical");
    assert.match(row.deepLink ?? "", new RegExp(`^/mentor/tryout/.+/operations/attempts/${attempt.id}`));
    assert.equal(await prisma.notificationDelivery.count({ where: { notificationId: row.id } }), 1);
  }

  // A Kapten who gains access later is not retroactively spammed, and a rerun adds nothing for existing ones.
  for (const id of activeKapten) assert.equal((await listOpenTryoutResultReviewAlerts(id)).length, 1, "each Kapten dashboard lists the unresolved alert");
  for (const id of excluded) assert.deepEqual(await listOpenTryoutResultReviewAlerts(id), []);

  // Fixing the result resolves every Kapten's alert without anyone clicking anything.
  await prisma.tryoutAttemptTestRun.update({ data: { contentSnapshot: original as object }, where: { id: run.id } });
  for (const id of activeKapten) assert.deepEqual(await listOpenTryoutResultReviewAlerts(id), [], "a fixed result drops out of every list");
  assert((await sourceRows()).every((row) => row.readAt !== null), "and every alert is marked read");

  console.log(`Tryout result review alert contracts passed (${activeKapten.length} active Kapten notified).`);
} finally {
  await prisma.tryoutAttemptTestRun.update({ data: { contentSnapshot: original as object }, where: { id: run.id } });
  await clean();
  await prisma.roleAssignment.deleteMany({ where: { userId: { in: excluded } } });
  await prisma.user.deleteMany({ where: { id: { in: excluded } } });
  await prisma.$disconnect();
}
