import assert from "node:assert/strict";

import {
  getMentorDashboardProjection,
  type MentorDashboardRepository,
} from "@/lib/mentor/dashboard-repository";
import type {
  DashboardMateriSource,
  DashboardQuizSource,
  DashboardTryoutSource,
} from "@/modules/mentor/dashboard-projection";

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
const futureFrom = "2026-08-27T12:00:00.000Z";
const futureUntil = "2026-08-27T13:00:00.000Z";
const pastFrom = "2026-08-27T08:00:00.000Z";
const pastUntil = "2026-08-27T09:00:00.000Z";

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

const quizzes: DashboardQuizSource[] = [
  {
    closesAt: null,
    description: "Kuis tutor A",
    id: quizA,
    opensAt: null,
    ownerId: tutorA,
    questionCount: 2,
    status: "draft",
    subjectCode: "PU",
    subjectName: "Penalaran Umum",
    title: "Kuis A",
    updatedAt: "2026-08-27T09:30:00.000Z",
  },
  {
    closesAt: futureUntil,
    description: "Kuis terjadwal tutor A",
    id: scheduledQuizA,
    opensAt: futureFrom,
    ownerId: tutorA,
    questionCount: 4,
    status: "scheduled",
    subjectCode: "PK",
    subjectName: "Pengetahuan Kuantitatif",
    title: "Kuis terjadwal A",
    updatedAt: "2026-08-27T09:15:00.000Z",
  },
  {
    closesAt: null,
    description: "Kuis tutor B",
    id: quizB,
    opensAt: null,
    ownerId: tutorB,
    questionCount: 3,
    status: "published",
    subjectCode: "PBM",
    subjectName: "Pemahaman Bacaan dan Menulis",
    title: "Kuis B",
    updatedAt: "2026-08-27T09:45:00.000Z",
  },
];

const tryouts: DashboardTryoutSource[] = [
  {
    deliverySessions: [{ availableFrom: futureFrom, availableUntil: futureUntil, id: "session-a", status: "active" }],
    description: "Tryout tutor A",
    id: tryoutA,
    ownerId: tutorA,
    status: "published",
    title: "Tryout A",
    updatedAt: "2026-08-27T09:30:00.000Z",
  },
  {
    deliverySessions: [{ availableFrom: futureFrom, availableUntil: futureUntil, id: "session-b", status: "active" }],
    description: "Tryout tutor B",
    id: tryoutB,
    ownerId: tutorB,
    status: "published",
    title: "Tryout B",
    updatedAt: "2026-08-27T09:20:00.000Z",
  },
  {
    deliverySessions: [{ availableFrom: futureFrom, availableUntil: futureUntil, id: "session-unpublished", status: "active" }],
    description: "Paket belum terbit",
    id: unpublishedTryoutA,
    ownerId: tutorA,
    status: "draft",
    title: "Tryout belum terbit",
    updatedAt: "2026-08-27T09:10:00.000Z",
  },
  {
    deliverySessions: [{ availableFrom: pastFrom, availableUntil: pastUntil, id: "session-expired", status: "active" }],
    description: "Sesi kedaluwarsa",
    id: expiredTryoutA,
    ownerId: tutorA,
    status: "published",
    title: "Tryout kedaluwarsa",
    updatedAt: "2026-08-27T09:05:00.000Z",
  },
  {
    deliverySessions: [{ availableFrom: futureFrom, availableUntil: futureUntil, id: "session-closed", status: "closed" }],
    description: "Sesi tertutup",
    id: closedTryoutA,
    ownerId: tutorA,
    status: "published",
    title: "Tryout tertutup",
    updatedAt: "2026-08-27T09:00:00.000Z",
  },
];

const quizQueries: Array<{ ownerId: string }> = [];
const tryoutQueries: Array<{ now: Date; ownerId: string; packageStatus: "published"; sessionStatus: "active" }> = [];

const repository: MentorDashboardRepository = {
  readMateri: async () => [materi],
  readQuizzes: async (query) => {
    quizQueries.push(query);
    return quizzes.filter((quiz) => quiz.ownerId === query.ownerId);
  },
  readTryouts: async (query) => {
    tryoutQueries.push(query);
    return tryouts.filter((tryout) => (
      tryout.ownerId === query.ownerId
      && tryout.status === query.packageStatus
      && tryout.deliverySessions.some((session) => (
        session.status === query.sessionStatus
        && new Date(session.availableFrom) > query.now
        && new Date(session.availableUntil) > query.now
      ))
    ));
  },
};

const projectionA = await getMentorDashboardProjection(tutorA, now, repository);
assert.deepEqual(projectionA.recentMateri.map((resource) => resource.id), [materi.id]);
assert.deepEqual(projectionA.recentKuis.map((resource) => resource.id), [quizA, scheduledQuizA]);
assert.deepEqual(projectionA.scheduledKuis.map((resource) => resource.id), [scheduledQuizA]);
assert.deepEqual(projectionA.scheduledTryout.map((resource) => resource.id), [tryoutA]);
assert.equal(projectionA.scheduledTryout[0]?.scheduledAt, futureFrom);

const projectionB = await getMentorDashboardProjection(tutorB, now, repository);
assert.deepEqual(projectionB.recentMateri.map((resource) => resource.id), [materi.id], "Materi remains shared");
assert.deepEqual(projectionB.recentKuis.map((resource) => resource.id), [quizB], "Kuis stays tutor-owned");
assert.deepEqual(projectionB.scheduledTryout.map((resource) => resource.id), [tryoutB], "Tryout stays tutor-owned");

const invalidTutorProjection = await getMentorDashboardProjection("not-a-uuid", now, repository);
assert.deepEqual(invalidTutorProjection.recentMateri.map((resource) => resource.id), [materi.id]);
assert.deepEqual(invalidTutorProjection.recentKuis, []);
assert.deepEqual(invalidTutorProjection.scheduledKuis, []);
assert.deepEqual(invalidTutorProjection.scheduledTryout, []);

assert.deepEqual(quizQueries.map((query) => query.ownerId), [tutorA, tutorB], "runtime loader passes each authenticated tutor to Kuis reads");
assert.deepEqual(tryoutQueries.map((query) => query.ownerId), [tutorA, tutorB], "runtime loader passes each authenticated tutor to Tryout reads");
assert.ok(tryoutQueries.every((query) => query.packageStatus === "published" && query.sessionStatus === "active"));
assert.ok(tryoutQueries.every((query) => query.now.getTime() === now.getTime()));

console.log("Mentor Dashboard IA-02 repository runtime checks passed.");
