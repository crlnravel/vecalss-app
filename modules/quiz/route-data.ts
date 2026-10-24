import "server-only";

import { getAvailableQuizAttempt, getAvailableQuizPreview } from "@/modules/quiz/server-data";

/** Route outcome for the student identity established by requireStudentSession. */
async function getStudentQuizRouteData(
  subjectSlug: string,
  quizSlug: string,
  studentId: string,
  notFound: () => never,
  attemptId?: string,
) {
  const attempt = await getAvailableQuizAttempt(subjectSlug, quizSlug, studentId, attemptId);
  if (attempt) return { kind: "attempt" as const, data: attempt };
  // An explicit ID is authoritative: neither invalid nor foreign work may
  // silently become another attempt or a new-admission preview.
  if (attemptId !== undefined) notFound();
  const preview = await getAvailableQuizPreview(subjectSlug, quizSlug, studentId);
  if (!preview) notFound();
  return { kind: "preview" as const, data: preview };
}

export { getStudentQuizRouteData };
