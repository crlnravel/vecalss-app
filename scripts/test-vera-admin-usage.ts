import "dotenv/config";
import assert from "node:assert/strict";

import { getAdminVeraUsage } from "../lib/admin/ai-usage/summary";
import { prisma } from "../lib/prisma";
import { VERA_IDR_PER_USD, VERA_LIMITS } from "../lib/vera/config";

// These checks write rows, so they only run against the disposable local dev database.
if (!/@(127\.0\.0\.1|localhost):55432\//.test(process.env.DATABASE_URL ?? "")) {
  throw new Error("test:vera-admin-usage only runs against the local dev database on 127.0.0.1:55432.");
}

const emails = ["vera-admin-usage-a@vecalss.local", "vera-admin-usage-b@vecalss.local"];
let testIds: string[] = [];

try {
  const students = await Promise.all(
    emails.map((email) =>
      prisma.user.upsert({
        where: { email },
        update: {},
        create: { email, fullName: "Vera Admin Usage Test", passwordHash: "test-only" },
        select: { id: true },
      }),
    ),
  );
  const [heavy, light] = students;
  testIds = students.map((student) => student.id);
  await prisma.veraUsageEvent.deleteMany({ where: { studentId: { in: testIds } } });

  const before = await getAdminVeraUsage();
  const now = new Date();
  const later = new Date(now.getTime() + 1_000);
  await prisma.veraUsageEvent.createMany({
    data: [
      // A settled chat answer: a request.
      { studentId: heavy.id, kind: "chat", status: "settled", model: "test", reservedCredits: 2, credits: 2, reservedUsdMicros: BigInt(2000), costUsdMicros: BigInt(1000), createdAt: now, settledAt: now },
      // A settled Studio run: a request.
      { studentId: heavy.id, kind: "studio", status: "settled", model: "test", reservedCredits: 5, credits: 5, reservedUsdMicros: BigInt(11750), costUsdMicros: BigInt(3000), createdAt: now, settledAt: now },
      // A session title: its cost counts, but it is not a request and not the last request.
      { studentId: heavy.id, kind: "title", status: "settled", model: "test", reservedCredits: 0, credits: 0, reservedUsdMicros: BigInt(0), costUsdMicros: BigInt(300), createdAt: later, settledAt: later },
      // A released reservation: nothing was generated, so nothing counts.
      { studentId: heavy.id, kind: "chat", status: "released", model: "test", reservedCredits: 2, credits: 0, reservedUsdMicros: BigInt(4000), costUsdMicros: BigInt(0), createdAt: now, settledAt: now },
      // A reservation that was never settled: the reserve is the charge.
      { studentId: heavy.id, kind: "chat", status: "failed", model: "test", reservedCredits: 3, credits: 3, reservedUsdMicros: BigInt(7000), costUsdMicros: BigInt(0), createdAt: now, settledAt: now },
      // A reservation still in flight: it counts toward nothing yet.
      { studentId: heavy.id, kind: "chat", status: "reserved", model: "test", reservedCredits: 2, credits: 0, reservedUsdMicros: BigInt(9999), costUsdMicros: BigInt(0), createdAt: now },
      // The second student: one settled chat answer.
      { studentId: light.id, kind: "chat", status: "settled", model: "test", reservedCredits: 1, credits: 1, reservedUsdMicros: BigInt(500), costUsdMicros: BigInt(500), createdAt: now, settledAt: now },
    ],
  });

  // The whole platform moves by exactly what the test wrote: 4 requests, 11 credits, and USD 0.0118 (title cost included).
  const after = await getAdminVeraUsage();
  assert.equal(after.month.requests - before.month.requests, 4, "Titles, released and in-flight rows are not requests");
  assert.ok(Math.abs(after.month.credits - before.month.credits - 11) < 1e-9, "Credits add up across the students");
  assert.ok(Math.abs(after.month.usd - before.month.usd - 0.0118) < 1e-9, "Spend includes title cost and the failed reserve");
  assert.ok(
    Math.abs(after.month.idr - after.month.usd * VERA_IDR_PER_USD) < 1e-6,
    "Rupiah is the dollar total at the configured rate",
  );

  // Per student, the table reads the same rows: heaviest first, each window against its own limit.
  const scoped = await getAdminVeraUsage({ studentIds: testIds });
  assert.equal(scoped.students.length, 2);
  assert.equal(scoped.activeStudents, 2);
  assert.equal(scoped.month.requests, 4);
  const [first, second] = scoped.students;
  assert.equal(first.studentId, heavy.id, "The heaviest student comes first");
  assert.equal(second.studentId, light.id);
  assert.equal(first.month.credits, 10, "Settled and failed credits count; released and in-flight rows do not");
  assert.equal(first.day.credits, 10);
  assert.equal(first.week.credits, 10);
  assert.ok(Math.abs(first.monthUsd - 0.0113) < 1e-9, "The student's spend is the sum of its rows' costs");
  assert.equal(first.lastRequestAt, now.toISOString(), "A session title is not the last request");
  assert.equal(first.day.limit, VERA_LIMITS.day.hardCredits);
  assert.equal(first.week.limit, VERA_LIMITS.week.hardCredits);
  assert.equal(first.month.limit, VERA_LIMITS.month.hardCredits);
  assert.equal(second.month.credits, 1);
  assert.deepEqual(
    Object.keys(first).sort(),
    ["day", "email", "lastRequestAt", "month", "monthUsd", "name", "studentId", "week"],
    "The table carries counts, credits and costs only, never message content",
  );

  console.log("Vera admin usage checks passed.");
} finally {
  if (testIds.length > 0) await prisma.veraUsageEvent.deleteMany({ where: { studentId: { in: testIds } } });
  await prisma.$disconnect();
}
