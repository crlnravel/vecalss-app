import type { Metadata } from "next";
import { requireTutorSession } from "@/lib/auth/access";
import { getMentorQuizDashboardRows } from "@/lib/quiz/mentor-dashboard-repository";
import {
  KaptenQuizDashboardPageModule,
  QuizDashboardUnavailable,
} from "@/modules/mentor/KaptenQuizDashboardPageModule";
import {
  parseQuizDashboardQuery,
  queryQuizDashboard,
  quizDashboardHref,
  type QuizDashboardRow,
} from "@/modules/mentor/quiz-dashboard-contract";
import { kaptenSubjects } from "@/modules/mentor/mock-data";

export const metadata: Metadata = { title: "Kuis Kapten | Vecalss LMS" };

export default async function MentorQuizPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const [session, params] = await Promise.all([
    requireTutorSession(),
    searchParams,
  ]);
  let rows: QuizDashboardRow[];
  try {
    rows = await getMentorQuizDashboardRows(session.user.id);
  } catch {
    return <QuizDashboardUnavailable session={session} />;
  }
  const query = parseQuizDashboardQuery(params);
  if (
    query.subject &&
    query.subject !== "all" &&
    !kaptenSubjects.some((subject) => subject.code === query.subject)
  )
    query.subject = "";
  const result = queryQuizDashboard(rows, query);
  return (
    <KaptenQuizDashboardPageModule
      key={quizDashboardHref(result.query)}
      session={session}
      result={result}
      subjects={kaptenSubjects}
      counts={{ total: rows.length }}
      initialCreateDialogOpen={params.create === "1"}
    />
  );
}
