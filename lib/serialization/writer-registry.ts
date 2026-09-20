import "server-only";

import type { LockLevel } from "./locks";

type WriterClassification =
  | "leased"
  | "transient"
  | "system/deferred"
  | "create-only"
  | "explicitly-unreachable";

type WriterResolver =
  | "direct-aggregate"
  | "session-id"
  | "admission-id"
  | "assignment-id"
  | "attempt-id"
  | "run-id"
  | "bank-organization"
  | "none";

type WriterDescriptor = {
  classification: WriterClassification;
  lockOrder: readonly LockLevel[];
  name: string;
  planned?: boolean;
  resolver: WriterResolver;
  resource: string;
  source: string;
};

const AUTHORING_WRITER_REGISTRY = [
  // Materi
  { name: "saveMateriLesson", source: "lib/materi/repository.ts", classification: "leased", resource: "materi:{code}", resolver: "direct-aggregate", lockOrder: [1, 4, 7] },
  { name: "publishMateriLesson", source: "lib/materi/repository.ts", classification: "leased", resource: "materi:{code}", resolver: "direct-aggregate", lockOrder: [1, 4, 7] },
  { name: "unpublishMateriLesson", source: "lib/materi/repository.ts", classification: "leased", resource: "materi:{code}", resolver: "direct-aggregate", lockOrder: [1, 4, 7] },
  { name: "archiveMateriLesson", source: "lib/materi/repository.ts", classification: "leased", resource: "materi:{code}", resolver: "direct-aggregate", lockOrder: [1, 4, 7] },
  { name: "returnMateriLessonToDraft", source: "lib/materi/repository.ts", classification: "leased", resource: "materi:{code}", resolver: "direct-aggregate", lockOrder: [1, 4, 7] },
  { name: "bulkPublishMateriLessons", source: "lib/materi/repository.ts", classification: "transient", resource: "materi:{code}[]", resolver: "direct-aggregate", lockOrder: [0, 1, 4, 7] },
  { name: "bulkUnpublishMateriLessons", source: "lib/materi/repository.ts", classification: "transient", resource: "materi:{code}[]", resolver: "direct-aggregate", lockOrder: [0, 1, 4, 7] },
  { name: "reorderMateriSubject", source: "lib/materi/repository.ts", classification: "transient", resource: "materi-subject:{subjectSlug}", resolver: "direct-aggregate", lockOrder: [0, 1, 4, 7] },

  // Standalone Kuis definition and source writers. Runtime attempt writers
  // remain system/deferred and are listed below as distinct entries.
  { name: "saveStandaloneQuiz", source: "lib/quiz/repository.ts", classification: "leased", resource: "quiz:{id}", resolver: "direct-aggregate", lockOrder: [1, 4, 5, 7] },
  { name: "transitionStandaloneQuizSourceMode", source: "lib/quiz/repository.ts", classification: "leased", resource: "quiz:{id}", resolver: "direct-aggregate", lockOrder: [1, 4, 5, 7] },
  { name: "importStandaloneQuizBankQuestions", source: "lib/quiz/repository.ts", classification: "leased", resource: "quiz:{id}", resolver: "direct-aggregate", lockOrder: [1, 4, 5, 7] },
  { name: "acceptStandaloneQuizQuestionUpdate", source: "lib/quiz/repository.ts", classification: "leased", resource: "quiz:{id}", resolver: "direct-aggregate", lockOrder: [1, 4, 5, 7] },
  { name: "attachStandaloneQuizAssembly", source: "lib/quiz/repository.ts", classification: "leased", resource: "quiz:{id}", resolver: "direct-aggregate", lockOrder: [1, 4, 5, 7] },
  { name: "detachStandaloneQuizAssembly", source: "lib/quiz/repository.ts", classification: "leased", resource: "quiz:{id}", resolver: "direct-aggregate", lockOrder: [1, 4, 5, 7] },
  { name: "bulkPublishStandaloneQuizzes", source: "lib/quiz/repository.ts", classification: "transient", resource: "quiz:{id}[]", resolver: "direct-aggregate", lockOrder: [1, 4, 5, 7] },
  { name: "bulkUnpublishStandaloneQuizzes", source: "lib/quiz/repository.ts", classification: "transient", resource: "quiz:{id}[]", resolver: "direct-aggregate", lockOrder: [1, 4, 5, 7] },
  { name: "updateStandaloneQuizLifecycle", source: "lib/quiz/repository.ts", classification: "leased", resource: "quiz:{id}", resolver: "direct-aggregate", lockOrder: [1, 4, 5, 7] },
  { name: "startStandaloneQuiz", source: "lib/quiz/repository.ts", classification: "system/deferred", resource: "quiz:{id}", resolver: "direct-aggregate", lockOrder: [0, 4, 6, 7] },
  { name: "saveStandaloneQuizAnswer", source: "lib/quiz/repository.ts", classification: "system/deferred", resource: "quiz-attempt:{id}", resolver: "attempt-id", lockOrder: [0, 2, 4, 6, 7] },
  { name: "submitStandaloneQuiz", source: "lib/quiz/repository.ts", classification: "system/deferred", resource: "quiz-attempt:{id}", resolver: "attempt-id", lockOrder: [0, 2, 4, 6, 7] },

  // Bank aggregate and organization writers.
  { name: "saveQuestionBank", source: "lib/question-bank/repository.ts", classification: "leased", resource: "question_bank:{id}", resolver: "direct-aggregate", lockOrder: [1, 3, 4, 7] },
  { name: "appendQuestionBankCsv", source: "lib/question-bank/csv-repository.ts", classification: "leased", resource: "question_bank:{id}", resolver: "direct-aggregate", lockOrder: [1, 4, 7] },
  { name: "overwriteQuestionBankCsv", source: "lib/question-bank/csv-repository.ts", classification: "leased", resource: "question_bank:{id}", resolver: "direct-aggregate", lockOrder: [1, 4, 7] },
  { name: "updateQuestionBankLifecycle", source: "lib/question-bank/repository.ts", classification: "leased", resource: "question_bank:{id}", resolver: "direct-aggregate", lockOrder: [1, 3, 4, 7] },
  { name: "deleteQuestionBank", source: "lib/question-bank/repository.ts", classification: "leased", resource: "question_bank:{id}", resolver: "direct-aggregate", lockOrder: [1, 3, 4, 7] },
  { name: "updateQuestionRevisionLifecycle", source: "lib/question-bank/repository.ts", classification: "leased", resource: "question_bank:{id}", resolver: "direct-aggregate", lockOrder: [1, 3, 4, 7] },
  { name: "setQuestionBankCategories", source: "lib/question-bank/organization.ts", classification: "transient", resource: "bank-org:categories → question_bank:{id}", resolver: "bank-organization", lockOrder: [0, 1, 3, 4] },
  { name: "assignQuestionBankCategories", source: "lib/question-bank/organization.ts", classification: "transient", resource: "bank-org:categories → question_bank:{id}", resolver: "bank-organization", lockOrder: [0, 1, 3, 4] },
  { name: "removeQuestionBankCategoryAssignment", source: "lib/question-bank/organization.ts", classification: "transient", resource: "bank-org:categories → question_bank:{id}", resolver: "bank-organization", lockOrder: [0, 1, 3, 4] },
  { name: "moveQuestionBanksToFolder", source: "lib/question-bank/organization.ts", classification: "transient", resource: "bank-org:folders:{purpose} → question_bank:{id}[]", resolver: "bank-organization", lockOrder: [0, 1, 3, 4] },
  { name: "createQuestionBankFolder", source: "lib/question-bank/organization.ts", classification: "create-only", resource: "bank-org:folders:{purpose}", resolver: "bank-organization", lockOrder: [0, 3] },
  { name: "createQuestionBankCategory", source: "lib/question-bank/organization.ts", classification: "create-only", resource: "bank-org:categories", resolver: "bank-organization", lockOrder: [0, 3] },
  { name: "renameQuestionBankFolder", source: "lib/question-bank/organization.ts", classification: "transient", resource: "bank-org:folders:{purpose}", resolver: "bank-organization", lockOrder: [0, 3] },
  { name: "moveQuestionBankFolder", source: "lib/question-bank/organization.ts", classification: "transient", resource: "bank-org:folders:{purpose}", resolver: "bank-organization", lockOrder: [0, 3] },
  { name: "renameQuestionBankCategory", source: "lib/question-bank/organization.ts", classification: "transient", resource: "bank-org:categories", resolver: "bank-organization", lockOrder: [0, 3] },
  { name: "removeQuestionBankFolder", source: "lib/question-bank/organization.ts", classification: "transient", resource: "bank-org:folders:{purpose}", resolver: "bank-organization", lockOrder: [0, 1, 3, 4] },
  { name: "removeQuestionBankCategory", source: "lib/question-bank/organization.ts", classification: "transient", resource: "bank-org:categories", resolver: "bank-organization", lockOrder: [0, 1, 3, 4] },

  // Reusable Paket Soal and Tryout. The old assembly draft surface is kept in
  // the registry as explicitly unreachable until its exports are removed.
  { name: "saveReusableQuestionPackage", source: "lib/tryout/repository.ts", classification: "leased", resource: "question_package:{id}", resolver: "direct-aggregate", lockOrder: [1, 4, 5, 7] },
  { name: "saveReusableQuestionPackageMetadata", source: "lib/tryout/repository.ts", classification: "leased", resource: "question_package:{id}", resolver: "direct-aggregate", lockOrder: [1, 4, 5, 7] },
  { name: "readyReusableQuestionPackageVersion", source: "lib/tryout/repository.ts", classification: "leased", resource: "question_package:{id}", resolver: "direct-aggregate", lockOrder: [1, 4, 5, 7] },
  { name: "saveAssemblyDraft", source: "lib/tryout/assembly-repository.ts", classification: "explicitly-unreachable", resource: "question_package:{id}", resolver: "direct-aggregate", lockOrder: [] },
  { name: "readyAssemblyDraft", source: "lib/tryout/assembly-repository.ts", classification: "explicitly-unreachable", resource: "question_package:{id}", resolver: "direct-aggregate", lockOrder: [] },
  { name: "saveTryout", source: "lib/tryout/repository.ts", classification: "leased", resource: "tryout:{id}", resolver: "direct-aggregate", lockOrder: [0, 1, 4, 5, 7] },
  { name: "updateTryoutMetadata", source: "lib/tryout/repository.ts", classification: "leased", resource: "tryout:{id}", resolver: "direct-aggregate", lockOrder: [0, 1, 4, 5, 7] },
  { name: "unpublishTryout", source: "lib/tryout/repository.ts", classification: "leased", resource: "tryout:{id}", resolver: "direct-aggregate", lockOrder: [0, 1, 4, 5, 7] },
  { name: "archiveTryout", source: "lib/tryout/repository.ts", classification: "leased", resource: "tryout:{id}", resolver: "direct-aggregate", lockOrder: [0, 1, 4, 5, 7] },
  { name: "deleteTryout", source: "lib/tryout/repository.ts", classification: "leased", resource: "tryout:{id}", resolver: "direct-aggregate", lockOrder: [0, 1, 4, 5, 7] },
  { name: "duplicateTryout", source: "lib/tryout/repository.ts", classification: "create-only", resource: "tryout:new", resolver: "direct-aggregate", lockOrder: [] },
  { name: "configureTryoutAdmission", source: "lib/tryout/delivery-repository.ts", classification: "system/deferred", resource: "tryout:{id}", resolver: "direct-aggregate", lockOrder: [0, 4, 5, 8] },
  { name: "configureTryoutDefaultResultRelease", source: "lib/tryout/delivery-repository.ts", classification: "system/deferred", resource: "tryout:{id}", resolver: "direct-aggregate", lockOrder: [0, 4, 5, 8] },
  { name: "createTryoutDeliverySession", source: "lib/tryout/delivery-repository.ts", classification: "system/deferred", resource: "tryout:{id}", resolver: "direct-aggregate", lockOrder: [0, 4, 5, 8] },
  { name: "openTryoutDeliverySession", source: "lib/tryout/delivery-repository.ts", classification: "system/deferred", resource: "tryout:{id}", resolver: "session-id", lockOrder: [0, 4, 5, 8] },
  { name: "updateTryoutDeliverySessionSchedule", source: "lib/tryout/delivery-repository.ts", classification: "system/deferred", resource: "tryout:{id}", resolver: "session-id", lockOrder: [0, 4, 5, 8] },
  { name: "setTryoutDefaultOpenRegistrationSession", source: "lib/tryout/delivery-repository.ts", classification: "system/deferred", resource: "tryout:{id}", resolver: "session-id", lockOrder: [0, 4, 5, 8] },
  { name: "registerForTryout", source: "lib/tryout/delivery-repository.ts", classification: "system/deferred", resource: "tryout:{id}", resolver: "direct-aggregate", lockOrder: [0, 2, 4, 5, 6, 8] },
  { name: "decideTryoutAdmission", source: "lib/tryout/delivery-repository.ts", classification: "system/deferred", resource: "tryout:{id}", resolver: "admission-id", lockOrder: [0, 2, 4, 5, 6, 8] },
  { name: "inviteTryoutParticipant", source: "lib/tryout/delivery-repository.ts", classification: "system/deferred", resource: "tryout:{id}", resolver: "direct-aggregate", lockOrder: [0, 2, 4, 5, 6, 8] },
  { name: "assignTryoutDeliverySession", source: "lib/tryout/delivery-repository.ts", classification: "system/deferred", resource: "tryout:{id}", resolver: "assignment-id", lockOrder: [0, 2, 4, 5, 6, 8] },
  { name: "revokeTryoutDeliveryAssignment", source: "lib/tryout/delivery-repository.ts", classification: "system/deferred", resource: "tryout:{id}", resolver: "assignment-id", lockOrder: [0, 2, 4, 5, 6, 8] },
  { name: "createTryoutRetake", source: "lib/tryout/delivery-repository.ts", classification: "system/deferred", resource: "tryout:{id}", resolver: "admission-id", lockOrder: [0, 2, 4, 5, 6, 8] },
  { name: "startTryoutAttempt", source: "lib/tryout/attempt-repository.ts", classification: "system/deferred", resource: "tryout:{id}", resolver: "session-id", lockOrder: [0, 2, 4, 5, 6, 7] },
  { name: "attemptState", source: "lib/tryout/attempt-repository.ts", classification: "system/deferred", resource: "tryout:{id}", resolver: "attempt-id", lockOrder: [0, 2, 4, 5, 6, 7] },
  { name: "startActiveTestRun", source: "lib/tryout/attempt-repository.ts", classification: "system/deferred", resource: "tryout:{id}", resolver: "run-id", lockOrder: [0, 2, 4, 5, 6, 7] },
  { name: "startTryoutDisconnect", source: "lib/tryout/attempt-repository.ts", classification: "system/deferred", resource: "tryout:{id}", resolver: "run-id", lockOrder: [0, 2, 4, 5, 6, 7] },
  { name: "reconcileTryoutDisconnect", source: "lib/tryout/attempt-repository.ts", classification: "system/deferred", resource: "tryout:{id}", resolver: "run-id", lockOrder: [0, 2, 4, 5, 6, 7] },
  { name: "saveTryoutAnswer", source: "lib/tryout/attempt-repository.ts", classification: "system/deferred", resource: "tryout:{id}", resolver: "run-id", lockOrder: [0, 2, 4, 5, 6, 7] },
  { name: "sealTryoutTestRun", source: "lib/tryout/attempt-repository.ts", classification: "system/deferred", resource: "tryout:{id}", resolver: "run-id", lockOrder: [0, 2, 4, 5, 6, 7] },
  { name: "recordTryoutIntegrityEvent", source: "lib/tryout/attempt-repository.ts", classification: "system/deferred", resource: "tryout:{id}", resolver: "run-id", lockOrder: [0, 2, 4, 5, 6, 7] },
  { name: "calculateTryoutAttempt", source: "lib/tryout/result-repository.ts", classification: "system/deferred", resource: "tryout:{id}", resolver: "attempt-id", lockOrder: [0, 2, 4, 5, 6, 7, 8] },
  { name: "releaseTryoutSessionResults", source: "lib/tryout/result-repository.ts", classification: "system/deferred", resource: "tryout:{id}", resolver: "session-id", lockOrder: [0, 2, 4, 5, 6, 7, 8] },
  { name: "participantTryoutResult", source: "lib/tryout/result-repository.ts", classification: "system/deferred", resource: "tryout:{id}", resolver: "attempt-id", lockOrder: [0, 2, 4, 5, 6, 7, 8] },
  { name: "synchronizeTryoutOperations", source: "lib/tryout/attempt-repository.ts", classification: "system/deferred", resource: "tryout:{id}", resolver: "direct-aggregate", lockOrder: [0, 4, 5, 6, 7] },
  { name: "synchronizeTryoutSessionReleaseState", source: "lib/tryout/result-repository.ts", classification: "system/deferred", resource: "tryout:{id}", resolver: "session-id", lockOrder: [0, 2, 4, 5, 6, 7] },
  { name: "synchronizeAttempt", source: "lib/tryout/attempt-repository.ts", classification: "system/deferred", resource: "tryout:{id}", resolver: "attempt-id", lockOrder: [0, 4, 5, 6, 7] },
  { name: "materializeTryoutAttemptInTransaction", source: "lib/tryout/result-repository.ts", classification: "system/deferred", resource: "tryout:{id}", resolver: "attempt-id", lockOrder: [0, 4, 5, 6, 7, 8] },
  { name: "createOrReuseAssessmentRelease", source: "lib/tryout/assessment-release.ts", classification: "system/deferred", resource: "tryout:{id}", resolver: "direct-aggregate", lockOrder: [0, 4, 5, 7] },
  { name: "getOwnedTryoutOperationsView", source: "lib/tryout/operations-view.ts", classification: "system/deferred", resource: "tryout:{id}", resolver: "direct-aggregate", lockOrder: [0, 4, 5, 6, 7] },
  { name: "getOwnedTryoutParticipantsView", source: "lib/tryout/operations-view.ts", classification: "system/deferred", resource: "tryout:{id}", resolver: "direct-aggregate", lockOrder: [0, 4, 5, 6, 7] },
  { name: "restartAdminStudentPreviewTryout", source: "lib/admin/student-preview-tryout.ts", classification: "system/deferred", resource: "tryout:{id}", resolver: "direct-aggregate", lockOrder: [0, 2, 4, 5, 6, 8] },
  { name: "restartAdminStudentPreviewTryoutAction", source: "modules/admin/student-preview-actions.ts", classification: "system/deferred", resource: "tryout:{id}", resolver: "direct-aggregate", lockOrder: [0, 2, 4, 5, 6, 8] },

  // Media entries are registered here so future lease enforcement cannot
  // silently grow an unclassified mutation boundary.
  { name: "createMediaFolder", source: "lib/media/repository.ts", classification: "create-only", resource: "media:banner-global", resolver: "none", lockOrder: [0] },
  { name: "requestMediaUpload", source: "lib/media/repository.ts", classification: "create-only", resource: "media:banner-global", resolver: "none", lockOrder: [0] },
  { name: "finalizeMediaUpload", source: "lib/media/repository.ts", classification: "create-only", resource: "media:banner-global", resolver: "none", lockOrder: [0] },
  { name: "renameMediaAsset", source: "lib/media/repository.ts", classification: "leased", resource: "media_asset:{id}", resolver: "direct-aggregate", lockOrder: [0, 1, 3, 4] },
  { name: "moveMediaAsset", source: "lib/media/repository.ts", classification: "leased", resource: "media_asset:{id}", resolver: "direct-aggregate", lockOrder: [0, 1, 3, 4] },
  { name: "trashMediaAsset", source: "lib/media/repository.ts", classification: "leased", resource: "media_asset:{id}", resolver: "direct-aggregate", lockOrder: [0, 1, 3, 4] },
  { name: "renameMediaFolder", source: "lib/media/repository.ts", classification: "leased", resource: "media_folder:{id}", resolver: "direct-aggregate", lockOrder: [0, 1, 3, 7] },
  { name: "moveMediaFolder", source: "lib/media/repository.ts", classification: "leased", resource: "media_folder:{id}", resolver: "direct-aggregate", lockOrder: [0, 1, 3, 7] },
  { name: "trashMediaFolder", source: "lib/media/repository.ts", classification: "leased", resource: "media_folder:{id}", resolver: "direct-aggregate", lockOrder: [0, 1, 3, 7] },
] as const satisfies readonly WriterDescriptor[];

type WriterName = (typeof AUTHORING_WRITER_REGISTRY)[number]["name"];

const WRITER_BY_NAME = new Map<string, WriterDescriptor>(
  AUTHORING_WRITER_REGISTRY.map((entry) => [entry.name, entry]),
);

function getWriterDescriptor(name: string) {
  return WRITER_BY_NAME.get(name);
}

function assertWriterRegistered(name: string) {
  const descriptor = getWriterDescriptor(name);
  if (!descriptor) throw new Error(`Unregistered mutation writer: ${name}`);
  return descriptor;
}

function isUnreachableWriter(name: string) {
  return getWriterDescriptor(name)?.classification === "explicitly-unreachable";
}

export {
  AUTHORING_WRITER_REGISTRY,
  assertWriterRegistered,
  getWriterDescriptor,
  isUnreachableWriter,
};

export type { WriterClassification, WriterDescriptor, WriterName, WriterResolver };
