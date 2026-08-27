import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";

import {
  canonicalDashboardHref,
  createEmptyDashboardProjection,
  overlayDashboardQuizDrafts,
  type DashboardProjection,
  type DashboardQuizDraftLike,
  type DashboardResource,
} from "@/modules/mentor/dashboard-types";
import { projectMentorDashboardProjection } from "@/modules/mentor/dashboard-projection";
import type {
  DashboardMateriSource,
  DashboardQuizSource,
  DashboardTryoutSource,
} from "@/modules/mentor/dashboard-projection";
import {
  getQuizWithStoredDrafts,
  getStoredQuizDraft,
  getStoredQuizDrafts,
  saveQuizDraft,
  storageKeyForTutor,
} from "@/modules/mentor/quiz-draft-storage";
import type { StoredQuizDraftInput } from "@/modules/mentor/quiz-draft-storage";
import type { QuizQuestionSnapshot } from "@/modules/mentor/quiz-builder-types";

const tutorA = "11111111-1111-4111-8111-111111111111";
const tutorB = "22222222-2222-4222-8222-222222222222";
const quizId = "33333333-3333-4333-8333-333333333333";
const foreignQuizId = "44444444-4444-4444-8444-444444444444";
const deletedQuizId = "55555555-5555-4555-8555-555555555555";
const tryoutId = "66666666-6666-4666-8666-666666666666";
const scheduledQuizId = "77777777-7777-4777-8777-777777777777";
const ownedTryoutId = "88888888-8888-4888-8888-888888888888";
const draftTryoutId = "99999999-9999-4999-8999-999999999999";
const foreignTryoutId = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";

function dashboardQuiz(overrides: Partial<DashboardResource> = {}): DashboardResource {
  return {
    description: "Deskripsi server",
    href: canonicalDashboardHref("quiz", quizId)!,
    id: quizId,
    kind: "quiz",
    primaryMetric: "2 soal",
    progress: 100,
    resourceType: "quiz",
    scheduledAt: null,
    source: "persisted",
    status: "draft" as const,
    title: "Judul dari server",
    updatedAt: "2026-08-27T08:00:00.000Z",
    ...overrides,
  };
}

function quizDraft(overrides: Partial<DashboardQuizDraftLike> = {}): DashboardQuizDraftLike {
  return {
    quiz: {
      description: "Deskripsi dari browser",
      id: quizId,
      primaryMetric: "3 soal",
      progress: 75,
      resourceType: "quiz",
      title: "Judul yang ditamper browser",
    },
    savedAt: Date.parse("2026-08-27T09:00:00.000Z"),
    ...overrides,
  };
}

const question: QuizQuestionSnapshot = {
  choices: [
    { id: "a", text: "Pilihan A" },
    { id: "b", text: "Pilihan B" },
  ],
  correctChoiceId: "a",
  explanation: "Karena A benar.",
  id: "local-question-1",
  origin: "local",
  prompt: "Berapa hasilnya?",
};

function storedQuiz(id: string, title: string, href: string): StoredQuizDraftInput["quiz"] {
  return {
    description: "Draf quiz",
    href,
    id,
    primaryMetric: "1 soal",
    progress: 50,
    questionCount: 1,
    resourceType: "quiz" as const,
    sourceBank: "Bank lokal",
    sourceBankId: "bank-1",
    status: "draft",
    subjectCode: "PU",
    subjectName: "Penalaran Umum",
    title,
    updatedAt: "2026-08-27T09:00:00.000Z",
  };
}

const memory = new Map<string, string>();
const fakeWindow = {
  addEventListener: () => undefined,
  dispatchEvent: () => true,
  localStorage: {
    getItem: (key: string) => memory.get(key) ?? null,
    setItem: (key: string, value: string) => { memory.set(key, value); },
  },
  removeEventListener: () => undefined,
};
Object.defineProperty(globalThis, "window", {
  configurable: true,
  value: fakeWindow,
  writable: true,
});

assert.equal(canonicalDashboardHref("quiz", quizId), `/mentor/quiz/${quizId}`);
assert.equal(canonicalDashboardHref("tryout", tryoutId), `/mentor/tryout/${tryoutId}`);
assert.equal(canonicalDashboardHref("materi", "PU-01"), "/mentor/materi/PU-01");
assert.equal(canonicalDashboardHref("quiz", "not-a-uuid"), null);
assert.equal(canonicalDashboardHref("materi", "PU/01"), null);

const projectionNow = new Date("2026-08-27T10:00:00.000Z");
const projectionMateri: DashboardMateriSource = {
  description: "Materi bersama",
  id: "PU-01",
  primaryMetric: "1 bacaan",
  progress: 100,
  status: "published",
  subjectCode: "PU",
  subjectName: "Penalaran Umum",
  title: "Materi bersama",
  updatedAtEpoch: Date.parse("2026-08-27T09:00:00.000Z"),
};
const projectionQuizzes: DashboardQuizSource[] = [
  {
    closesAt: null,
    description: "Kuis pemilik",
    id: quizId,
    opensAt: null,
    ownerId: tutorA,
    questionCount: 2,
    status: "draft",
    subjectCode: "PU",
    subjectName: "Penalaran Umum",
    title: "Kuis pemilik",
    updatedAt: "2026-08-27T09:30:00.000Z",
  },
  {
    closesAt: "2026-08-28T12:00:00.000Z",
    description: "Kuis terjadwal",
    id: scheduledQuizId,
    opensAt: "2026-08-27T11:00:00.000Z",
    ownerId: tutorA,
    questionCount: 4,
    status: "scheduled",
    subjectCode: "PK",
    subjectName: "Pengetahuan Kuantitatif",
    title: "Kuis terjadwal",
    updatedAt: "2026-08-27T08:30:00.000Z",
  },
  {
    closesAt: null,
    description: "Kuis tutor lain",
    id: foreignQuizId,
    opensAt: null,
    ownerId: tutorB,
    questionCount: 8,
    status: "published",
    subjectCode: "PU",
    subjectName: "Penalaran Umum",
    title: "Kuis tutor lain",
    updatedAt: "2026-08-27T11:30:00.000Z",
  },
];
const futureFrom = "2026-08-27T12:00:00.000Z";
const futureUntil = "2026-08-27T13:00:00.000Z";
const projectionTryouts: DashboardTryoutSource[] = [
  {
    deliverySessions: [{ availableFrom: futureFrom, availableUntil: futureUntil, id: "session-owned", status: "active" }],
    description: "Tryout pemilik",
    id: ownedTryoutId,
    ownerId: tutorA,
    status: "published",
    title: "Tryout pemilik",
    updatedAt: "2026-08-27T09:20:00.000Z",
  },
  {
    deliverySessions: [{ availableFrom: futureFrom, availableUntil: futureUntil, id: "session-draft-package", status: "active" }],
    description: "Paket belum terbit",
    id: draftTryoutId,
    ownerId: tutorA,
    status: "draft",
    title: "Paket belum terbit",
    updatedAt: "2026-08-27T09:10:00.000Z",
  },
  {
    deliverySessions: [{ availableFrom: futureFrom, availableUntil: futureUntil, id: "session-foreign", status: "active" }],
    description: "Tryout tutor lain",
    id: foreignTryoutId,
    ownerId: tutorB,
    status: "published",
    title: "Tryout tutor lain",
    updatedAt: "2026-08-27T09:00:00.000Z",
  },
  {
    deliverySessions: [{ availableFrom: futureFrom, availableUntil: futureUntil, id: "session-closed", status: "closed" }],
    description: "Sesi tertutup",
    id: tryoutId,
    ownerId: tutorA,
    status: "published",
    title: "Sesi tertutup",
    updatedAt: "2026-08-27T08:50:00.000Z",
  },
];
const projectedGroups = projectMentorDashboardProjection({
  materi: [projectionMateri],
  now: projectionNow,
  quizzes: projectionQuizzes,
  tryouts: projectionTryouts,
  tutorId: tutorA,
});
assert.deepEqual(projectedGroups.recentMateri.map((resource) => resource.id), ["PU-01"]);
assert.deepEqual(projectedGroups.recentKuis.map((resource) => resource.id), [quizId, scheduledQuizId]);
assert.deepEqual(projectedGroups.scheduledKuis.map((resource) => resource.id), [scheduledQuizId]);
assert.deepEqual(projectedGroups.scheduledTryout.map((resource) => resource.id), [ownedTryoutId]);
assert.equal(projectedGroups.scheduledTryout[0]?.status, "scheduled");
assert.equal(projectedGroups.scheduledTryout[0]?.scheduledAt, futureFrom);

const projection: DashboardProjection = {
  recentKuis: [dashboardQuiz()],
  recentMateri: [{
    description: "Materi bersama",
    href: "/mentor/materi/PU-01",
    id: "PU-01",
    kind: "materi",
    primaryMetric: "1 bacaan",
    progress: 100,
    resourceType: "materi",
    scheduledAt: null,
    source: "persisted",
    status: "published",
    title: "Materi server",
    updatedAt: "2026-08-27T07:00:00.000Z",
  }],
  scheduledKuis: [],
  scheduledTryout: [],
};

const validDraft = quizDraft();
(validDraft.quiz as unknown as { href: string }).href = "/mentor/quiz/foreign-target";
const invalidDraft = quizDraft({ quiz: { ...validDraft.quiz, id: "malformed-id" } });
const foreignDraft = quizDraft({ quiz: { ...validDraft.quiz, id: foreignQuizId } });
const deletedDraft = quizDraft({ quiz: { ...validDraft.quiz, id: deletedQuizId } });
const unsupportedDraft = quizDraft({ quiz: { ...validDraft.quiz, resourceType: "tryout" as "quiz" } });

const overlaid = overlayDashboardQuizDrafts(projection, [
  validDraft,
  invalidDraft,
  foreignDraft,
  deletedDraft,
  unsupportedDraft,
]);
assert.equal(overlaid.recentKuis.length, 1, "only a persisted quiz may receive a draft overlay");
assert.equal(overlaid.recentKuis[0]?.title, "Judul dari server", "draft title cannot replace server identity");
assert.equal(overlaid.recentKuis[0]?.href, `/mentor/quiz/${quizId}`, "tampered href must be canonicalized");
assert.equal(overlaid.recentKuis[0]?.description, "Deskripsi dari browser");
assert.equal(overlaid.recentKuis[0]?.source, "tutor_scoped_local_draft");
assert.equal(overlaid.recentMateri[0]?.source, "persisted");

const scheduledProjection: DashboardProjection = {
  ...projection,
  recentKuis: [],
  scheduledKuis: [dashboardQuiz({ scheduledAt: "2026-08-27T10:00:00.000Z" })],
};
const scheduledOverlay = overlayDashboardQuizDrafts(scheduledProjection, [validDraft]);
assert.equal(scheduledOverlay.scheduledKuis[0]?.href, `/mentor/quiz/${quizId}`);
assert.equal(scheduledOverlay.scheduledTryout.length, 0, "tryout rows require a server schedule projection");

const legacyUnscopedDraft = {
  quiz: storedQuiz(quizId, "Legacy title", "/legacy/unsafe-target"),
  questions: [question],
  savedAt: Date.now(),
  sourceBankId: "bank-1",
};
memory.set("vecalss-kapten-quiz-drafts", JSON.stringify([legacyUnscopedDraft]));
assert.equal(getStoredQuizDrafts(tutorA).length, 0, "legacy unscoped drafts must be ignored");

const savedDraft = saveQuizDraft(tutorA, {
  quiz: storedQuiz(quizId, "Browser title", "/unsafe/stored-href"),
  questions: [question],
  sourceBankId: "bank-1",
});
assert.equal(memory.has(storageKeyForTutor(tutorA)!), true, "the tutor id must be part of the storage key");
assert.equal(getStoredQuizDrafts(tutorA).length, 1);
assert.equal(getStoredQuizDraft(tutorA, quizId)?.scopeId, tutorA);
assert.equal(getStoredQuizDrafts(tutorB).length, 0, "a second tutor cannot read the first tutor's browser draft");

const serverQuiz = storedQuiz(quizId, "Server title", "/server-href-is-not-used");
const merged = getQuizWithStoredDrafts(tutorA, [serverQuiz])[0];
assert.equal(merged?.title, "Server title", "catalog overlays keep the persisted title");
assert.equal(merged?.href, `/mentor/quiz/${quizId}`, "catalog overlays derive a canonical href");
assert.equal(merged?.description, "Draf quiz");
assert.equal(merged?.updatedAt, new Date(savedDraft.savedAt).toISOString());

memory.set(storageKeyForTutor(tutorA)!, JSON.stringify([{ ...savedDraft, scopeId: tutorB }]));
assert.equal(getStoredQuizDrafts(tutorA).length, 0, "a copied row with another scope is rejected");
assert.equal(getStoredQuizDrafts(tutorB).length, 0, "scope metadata cannot grant access without the matching key");

const emptyProjection = createEmptyDashboardProjection();
assert.deepEqual(emptyProjection, {
  recentKuis: [],
  recentMateri: [],
  scheduledKuis: [],
  scheduledTryout: [],
});

const source = (file: string) => readFileSync(join(process.cwd(), file), "utf8");
const dashboardPageSource = source("app/mentor/dashboard/page.tsx");
const dashboardModuleSource = source("modules/mentor/MentorDashboardPageModule.tsx");
assert.doesNotMatch(dashboardPageSource, /mock-data|recentlyEdited|scheduledPublications/u);
assert.doesNotMatch(dashboardModuleSource, /mock-data|recentlyEdited|scheduledPublications/u);
assert.match(dashboardModuleSource, /recentMateri/u);
assert.match(dashboardModuleSource, /recentKuis/u);
assert.match(dashboardModuleSource, /scheduledKuis/u);
assert.match(dashboardModuleSource, /scheduledTryout/u);
assert.match(dashboardModuleSource, /EmptyWorkspaceState/u);
const repositorySource = source("lib/mentor/dashboard-repository.ts");
assert.match(repositorySource, /createdByUserId: tutorId/u);
assert.match(repositorySource, /status: ContentStatus\.published/u);
assert.match(repositorySource, /TryoutDeliverySessionStatus\.active/u);

console.log("Mentor Dashboard IA-02 checks passed.");
