import assert from "node:assert/strict";

import {
  ContentStatus,
  TryoutDeliverySessionStatus,
  type Prisma,
} from "@/generated/prisma/client";
import {
  createMentorDashboardRepository,
  getMentorDashboardProjection,
  type DashboardPrismaClient,
  type DashboardQuizRecord,
  type DashboardTryoutRecord,
} from "@/lib/mentor/dashboard-repository";
import type { DashboardMateriSource } from "@/modules/mentor/dashboard-projection";

const tutorA = "11111111-1111-4111-8111-111111111111";
const tutorB = "22222222-2222-4222-8222-222222222222";
const quizA = "33333333-3333-4333-8333-333333333333";
const quizB = "44444444-4444-4444-8444-444444444444";
const scheduledQuizA = "55555555-5555-4555-8555-555555555555";
const tryoutA = "66666666-6666-4666-8666-666666666666";
const tryoutB = "77777777-7777-4777-8777-777777777777";
const unpublishedTryoutA = "88888888-8888-4888-8888-888888888888";
const expiredTryoutA = "99999999-9999-4999-8999-999999999999";
const closedTryoutA = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";

const now = new Date("2026-08-27T10:00:00.000Z");
const futureFrom = new Date("2026-08-27T12:00:00.000Z");
const futureUntil = new Date("2026-08-27T13:00:00.000Z");
const pastFrom = new Date("2026-08-27T08:00:00.000Z");
const pastUntil = new Date("2026-08-27T09:00:00.000Z");

const materi: DashboardMateriSource = {
  description: "Materi shared catalogue",
  id: "PU-01",
  primaryMetric: "1 bacaan",
  progress: 100,
  status: "published",
  subjectCode: "PU",
  subjectName: "Penalaran Umum",
  title: "Materi bersama",
  updatedAtEpoch: Date.parse("2026-08-27T09:00:00.000Z"),
};

function quizRecord(
  id: string,
  ownerId: string,
  title: string,
  status: ContentStatus,
  updatedAt: string,
  questionCount: number,
  boundaries: { closesAt?: string | null; opensAt?: string | null } = {},
): DashboardQuizRecord {
  return {
    _count: { items: questionCount },
    closesAt: boundaries.closesAt ? new Date(boundaries.closesAt) : null,
    createdByUserId: ownerId,
    description: `${title} description`,
    id,
    opensAt: boundaries.opensAt ? new Date(boundaries.opensAt) : null,
    status,
    subtest: { code: "PU", name: "Penalaran Umum" },
    title,
    updatedAt: new Date(updatedAt),
  };
}

const unfilteredQuizzes: DashboardQuizRecord[] = [
  quizRecord(quizA, tutorA, "Kuis A", ContentStatus.draft, "2026-08-27T09:30:00.000Z", 2),
  quizRecord(scheduledQuizA, tutorA, "Kuis terjadwal A", ContentStatus.scheduled, "2026-08-27T09:15:00.000Z", 4, {
    closesAt: "2026-08-27T13:00:00.000Z",
    opensAt: "2026-08-27T12:00:00.000Z",
  }),
  quizRecord(quizB, tutorB, "Kuis B", ContentStatus.published, "2026-08-27T09:45:00.000Z", 3),
];

function session(
  id: string,
  availableFrom: Date,
  availableUntil: Date,
  status: TryoutDeliverySessionStatus,
) {
  return { availableFrom, availableUntil, id, status };
}

function tryoutRecord(
  id: string,
  ownerId: string,
  title: string,
  status: ContentStatus,
  deliverySessions: DashboardTryoutRecord["deliverySessions"],
  updatedAt: string,
): DashboardTryoutRecord {
  return {
    createdByUserId: ownerId,
    description: `${title} description`,
    deliverySessions,
    id,
    status,
    title,
    updatedAt: new Date(updatedAt),
  };
}

const unfilteredTryouts: DashboardTryoutRecord[] = [
  tryoutRecord(
    tryoutA,
    tutorA,
    "Tryout A",
    ContentStatus.published,
    [session("session-a", futureFrom, futureUntil, TryoutDeliverySessionStatus.active)],
    "2026-08-27T09:30:00.000Z",
  ),
  tryoutRecord(
    tryoutB,
    tutorB,
    "Tryout B",
    ContentStatus.published,
    [session("session-b", futureFrom, futureUntil, TryoutDeliverySessionStatus.active)],
    "2026-08-27T09:20:00.000Z",
  ),
  tryoutRecord(
    unpublishedTryoutA,
    tutorA,
    "Tryout belum terbit",
    ContentStatus.draft,
    [session("session-unpublished", futureFrom, futureUntil, TryoutDeliverySessionStatus.active)],
    "2026-08-27T09:10:00.000Z",
  ),
  tryoutRecord(
    expiredTryoutA,
    tutorA,
    "Tryout kedaluwarsa",
    ContentStatus.published,
    [session("session-expired", pastFrom, pastUntil, TryoutDeliverySessionStatus.active)],
    "2026-08-27T09:05:00.000Z",
  ),
  tryoutRecord(
    closedTryoutA,
    tutorA,
    "Sesi tertutup",
    ContentStatus.published,
    [session("session-closed", futureFrom, futureUntil, TryoutDeliverySessionStatus.closed)],
    "2026-08-27T09:00:00.000Z",
  ),
];

const quizCalls: Prisma.StandaloneQuizFindManyArgs[] = [];
const tryoutCalls: Prisma.TryoutPackageFindManyArgs[] = [];

const recordingPrisma: DashboardPrismaClient = {
  standaloneQuiz: {
    findMany: async (args) => {
      quizCalls.push(args as Prisma.StandaloneQuizFindManyArgs);
      // Deliberately ignore the predicate. The production adapter must build
      // it, while projection remains safe when an adapter returns unfiltered
      // rows (as a recording fake or a future repository implementation may).
      return unfilteredQuizzes;
    },
  },
  tryoutPackage: {
    findMany: async (args) => {
      tryoutCalls.push(args as Prisma.TryoutPackageFindManyArgs);
      return unfilteredTryouts;
    },
  },
};

const repository = createMentorDashboardRepository({
  prismaClient: recordingPrisma,
  readMateri: async () => [materi],
});

const expectedSessionWhere = {
  availableFrom: { gt: now },
  availableUntil: { gt: now },
  status: TryoutDeliverySessionStatus.active,
};

// First exercise the production adapter itself. The recording delegates
// return every fixture row, so these DTOs prove the adapter maps real delegate
// output rather than a test-only pre-filtered source.
const adaptedQuizzes = await repository.readQuizzes({ ownerId: tutorA });
assert.deepEqual(adaptedQuizzes.map((quiz) => quiz.id), [quizA, scheduledQuizA, quizB]);
assert.equal(adaptedQuizzes[0]?.questionCount, 2);
assert.equal(adaptedQuizzes[0]?.subjectCode, "PU");
assert.equal(adaptedQuizzes[0]?.ownerId, tutorA);
assert.deepEqual(quizCalls[0]?.where, { createdByUserId: tutorA });

const adaptedTryouts = await repository.readTryouts({
  now,
  ownerId: tutorA,
  packageStatus: "published",
  sessionStatus: "active",
});
assert.deepEqual(adaptedTryouts.map((tryout) => tryout.id), [tryoutA, tryoutB, unpublishedTryoutA, expiredTryoutA, closedTryoutA]);
assert.equal(adaptedTryouts[0]?.deliverySessions[0]?.status, "active");
assert.equal(adaptedTryouts[0]?.deliverySessions[0]?.availableFrom, futureFrom.toISOString());
assert.deepEqual(tryoutCalls[0]?.where, {
  createdByUserId: tutorA,
  deliverySessions: { some: expectedSessionWhere },
  status: ContentStatus.published,
});
const selectedTryout = tryoutCalls[0]?.select as {
  deliverySessions?: { where?: unknown };
} | null | undefined;
assert.deepEqual(selectedTryout?.deliverySessions?.where, expectedSessionWhere, "relation select keeps the active/future predicate");

// Now exercise the exported orchestration with the same production adapter.
// The only injected pieces are the two Prisma delegates and shared Materi;
// query construction, normalization, and projection stay production code.
quizCalls.length = 0;
tryoutCalls.length = 0;

const projectionA = await getMentorDashboardProjection(tutorA, now, repository);
assert.deepEqual(projectionA.recentMateri.map((resource) => resource.id), [materi.id]);
assert.deepEqual(projectionA.recentKuis.map((resource) => resource.id), [quizA, scheduledQuizA]);
assert.deepEqual(projectionA.scheduledKuis.map((resource) => resource.id), [scheduledQuizA]);
assert.deepEqual(projectionA.scheduledTryout.map((resource) => resource.id), [tryoutA]);
assert.equal(projectionA.scheduledTryout[0]?.scheduledAt, futureFrom.toISOString());
assert.equal(projectionA.scheduledTryout[0]?.title, "Tryout A");

const projectionB = await getMentorDashboardProjection(tutorB, now, repository);
assert.deepEqual(projectionB.recentMateri.map((resource) => resource.id), [materi.id], "Materi remains shared");
assert.deepEqual(projectionB.recentKuis.map((resource) => resource.id), [quizB], "Kuis stays tutor-owned");
assert.deepEqual(projectionB.scheduledTryout.map((resource) => resource.id), [tryoutB], "Tryout stays tutor-owned");

const invalidTutorProjection = await getMentorDashboardProjection("not-a-uuid", now, repository);
assert.deepEqual(invalidTutorProjection.recentMateri.map((resource) => resource.id), [materi.id]);
assert.deepEqual(invalidTutorProjection.recentKuis, []);
assert.deepEqual(invalidTutorProjection.scheduledKuis, []);
assert.deepEqual(invalidTutorProjection.scheduledTryout, []);

assert.deepEqual(quizCalls.map((query) => query.where), [
  { createdByUserId: tutorA },
  { createdByUserId: tutorB },
], "runtime loader passes each authenticated tutor to Kuis predicates");
assert.deepEqual(tryoutCalls.map((query) => query.where), [
  {
    createdByUserId: tutorA,
    deliverySessions: { some: expectedSessionWhere },
    status: ContentStatus.published,
  },
  {
    createdByUserId: tutorB,
    deliverySessions: { some: expectedSessionWhere },
    status: ContentStatus.published,
  },
], "runtime loader passes owner, publication, and active/future predicates");
assert.equal(quizCalls.length, 2, "invalid tutor guard avoids a Kuis delegate call");
assert.equal(tryoutCalls.length, 2, "invalid tutor guard avoids a Tryout delegate call");

console.log("Mentor Dashboard IA-02 repository runtime checks passed.");
