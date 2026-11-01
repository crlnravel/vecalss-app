import assert from "node:assert/strict";

import { listOpenTryoutResultReviewAlerts, notifyTryoutResultReviewRequired, TRYOUT_RESULT_REVIEW_SOURCE_ENTITY_TYPE } from "@/lib/notifications/tryout-result-review";
import { prisma } from "@/lib/prisma";

// Dev-database contract: needs the seeded Tryout (pnpm db:seed or node prisma/seed-assessment.mjs).
const attempt = await prisma.tryoutAttempt.findFirst({
  orderBy: { id: "asc" },
  select: { id: true, tryout: { select: { createdByUserId: true } }, runs: { select: { contentSnapshot: true, id: true }, where: { sequenceNo: 1 } } },
  where: { releaseState: "released", student: { email: "dimas@vecalss.local" } },
});
assert(attempt && attempt.runs.length === 1, "seeded released attempt for dimas@vecalss.local is required");
const run = attempt.runs[0];
const original = run.contentSnapshot;
const kapten = attempt.tryout.createdByUserId;
const alerts = () => prisma.notification.findMany({ where: { recipientUserId: kapten, sourceEntityId: attempt.id, sourceEntityType: TRYOUT_RESULT_REVIEW_SOURCE_ENTITY_TYPE } });
const clean = () => prisma.$transaction([
  prisma.notificationDelivery.deleteMany({ where: { notification: { sourceEntityId: attempt.id, sourceEntityType: TRYOUT_RESULT_REVIEW_SOURCE_ENTITY_TYPE } } }),
  prisma.notification.deleteMany({ where: { sourceEntityId: attempt.id, sourceEntityType: TRYOUT_RESULT_REVIEW_SOURCE_ENTITY_TYPE } }),
]);

try {
  await clean();
  assert.deepEqual(await listOpenTryoutResultReviewAlerts(kapten), [], "a healthy result raises no alert");

  // Break the stored result exactly like the seed defect: items lose their questionType.
  const broken = JSON.parse(JSON.stringify(original)) as { items: Array<Record<string, unknown>> };
  broken.items = broken.items.map(({ questionType: _removed, ...item }) => item);
  await prisma.tryoutAttemptTestRun.update({ data: { contentSnapshot: broken as object }, where: { id: run.id } });

  await Promise.all([notifyTryoutResultReviewRequired(attempt.id), notifyTryoutResultReviewRequired(attempt.id)]);
  await notifyTryoutResultReviewRequired(attempt.id);
  const rows = await alerts();
  assert.equal(rows.length, 1, "repeated and concurrent opens create one alert per attempt");
  assert.equal(rows[0].title, "Hasil Tryout perlu diperiksa");
  assert.match(rows[0].body, /belum bisa membuka hasil/);
  assert.doesNotMatch(`${rows[0].title} ${rows[0].body}`, /AssessmentRelease|snapshot|digest|questionType/i, "alert text stays non-technical");
  assert.match(rows[0].deepLink ?? "", new RegExp(`^/mentor/tryout/.+/operations/attempts/${attempt.id}`));
  assert.equal(await prisma.notificationDelivery.count({ where: { notificationId: rows[0].id } }), 1);

  const open = await listOpenTryoutResultReviewAlerts(kapten);
  assert.equal(open.length, 1, "the Kapten dashboard lists the unresolved alert");
  assert.equal(open[0].href, rows[0].deepLink);

  // Fixing the result resolves the alert without anyone clicking anything.
  await prisma.tryoutAttemptTestRun.update({ data: { contentSnapshot: original as object }, where: { id: run.id } });
  assert.deepEqual(await listOpenTryoutResultReviewAlerts(kapten), [], "a fixed result drops out of the list");
  assert.notEqual((await alerts())[0].readAt, null, "and the alert is marked read");

  console.log("Tryout result review alert contracts passed.");
} finally {
  await prisma.tryoutAttemptTestRun.update({ data: { contentSnapshot: original as object }, where: { id: run.id } });
  await clean();
  await prisma.$disconnect();
}
