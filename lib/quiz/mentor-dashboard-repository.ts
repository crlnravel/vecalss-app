import "server-only";

import { Prisma } from "@/generated/prisma/client";
import { prisma } from "@/lib/prisma";
import {
  getMentorQuizCatalogueRecords,
  QuizValidationError,
} from "@/lib/quiz/repository";
import { withTransientAuthoringEditLeases } from "@/lib/serialization/authoring-lease";
import type { QuizDashboardRow } from "@/modules/mentor/quiz-dashboard-contract";

/** The average gives each participation one vote under its frozen scoring policy. */
export async function getMentorQuizDashboardRows(
  tutorId: string,
  client: Prisma.TransactionClient = prisma,
): Promise<QuizDashboardRow[]> {
  const [records, summaries, creator] = await Promise.all([
    getMentorQuizCatalogueRecords(tutorId, client),
    client.$queryRaw<
      { quizId: string; completed: bigint; average: number | null }[]
    >(Prisma.sql`
      WITH participation_scores AS (
        SELECT p.quiz_id, p.id, COUNT(a.id) AS completed,
          CASE COALESCE(p.policy_snapshot->>'scorePolicy', v.score_policy::text, q.score_policy::text)
            WHEN 'highest' THEN MAX(a.score) FILTER (WHERE a.scoring_state = 'scored')
            WHEN 'first' THEN (ARRAY_AGG(a.score ORDER BY a.attempt_no ASC) FILTER (WHERE a.scoring_state = 'scored' AND a.score IS NOT NULL))[1]
            WHEN 'average' THEN FLOOR(AVG(a.score) FILTER (WHERE a.scoring_state = 'scored') + 0.5)
            ELSE (ARRAY_AGG(a.score ORDER BY a.attempt_no DESC) FILTER (WHERE a.scoring_state = 'scored' AND a.score IS NOT NULL))[1]
          END AS final_score
        FROM standalone_quiz_participations p
        JOIN standalone_quizzes q ON q.id = p.quiz_id AND q.created_by_user_id = ${tutorId}::uuid
        LEFT JOIN standalone_quiz_versions v ON v.id = p.quiz_version_id
        LEFT JOIN standalone_quiz_attempts a ON a.participation_id = p.id AND a.status IN ('submitted', 'auto_submitted', 'scored')
        GROUP BY p.quiz_id, p.id, p.policy_snapshot, v.score_policy, q.score_policy
      )
      SELECT quiz_id AS "quizId", SUM(completed)::bigint AS completed, AVG(final_score)::float8 AS average
      FROM participation_scores GROUP BY quiz_id
    `),
    client.user.findUniqueOrThrow({
      where: { id: tutorId },
      select: {
        fullName: true,
        avatarUrl: true,
        tutorProfile: {
          select: { teachingSubject: { select: { name: true } } },
        },
      },
    }),
  ]);
  const byQuiz = new Map(summaries.map((summary) => [summary.quizId, summary]));
  return records.map((record) => ({
    ...record,
    creator: {
      name: creator.fullName,
      avatarSrc: creator.avatarUrl,
      subject: creator.tutorProfile?.teachingSubject?.name ?? null,
    },
    completedAttempts: Number(byQuiz.get(record.id)?.completed ?? 0),
    averageScore: byQuiz.get(record.id)?.average ?? null,
  }));
}

export type QuizDashboardMutation = "hide" | "show" | "archive" | "delete";
export async function manageMentorDashboardQuiz(
  tutorId: string,
  quizId: string,
  action: QuizDashboardMutation,
) {
  return prisma.$transaction((tx) =>
    withTransientAuthoringEditLeases(
      tx,
      [{ resourceId: quizId, resourceType: "quiz" }],
      tutorId,
      async () => {
        await tx.$queryRaw(
          Prisma.sql`SELECT id FROM standalone_quizzes WHERE id = ${quizId}::uuid FOR UPDATE`,
        );
        const quiz = await tx.standaloneQuiz.findFirst({
          where: { id: quizId, createdByUserId: tutorId },
          select: { status: true },
        });
        if (!quiz)
          throw new QuizValidationError(
            "Kuis ini tidak tersedia untuk diubah.",
          );
        if (action === "delete") {
          // Delete quiz-owned history before its definitions: these links restrict deletion.
          await tx.standaloneQuizStartCommand.deleteMany({ where: { quizId } });
          await tx.standaloneQuizParticipation.deleteMany({
            where: { quizId },
          });
          await tx.standaloneQuizItem.deleteMany({ where: { quizId } });
          await tx.standaloneQuizVersion.updateMany({
            where: { quizId },
            data: { baseVersionId: null },
          });
          await tx.standaloneQuizVersion.deleteMany({ where: { quizId } });
          await tx.standaloneQuiz.delete({ where: { id: quizId } });
          return;
        }
        if (
          quiz.status === "archived" ||
          (action !== "archive" && quiz.status !== "published")
        )
          throw new QuizValidationError(
            "Kuis ini tidak tersedia untuk diubah.",
          );
        await tx.standaloneQuiz.update({
          where: { id: quizId },
          data:
            action === "archive"
              ? { status: "archived", revision: { increment: 1 } }
              : { isHidden: action === "hide" },
        });
      },
    ),
  );
}
