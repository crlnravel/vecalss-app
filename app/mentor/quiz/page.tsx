import type { Metadata } from "next";
import { requireTutorSession } from "@/lib/auth/access";
import { getMentorQuizDashboardRows } from "@/lib/quiz/mentor-dashboard-repository";
import { KaptenQuizDashboardPageModule } from "@/modules/mentor/KaptenQuizDashboardPageModule";
import { parseQuizDashboardQuery, queryQuizDashboard, quizDashboardHref } from "@/modules/mentor/quiz-dashboard-contract";
import { kaptenSubjects } from "@/modules/mentor/mock-data";

export const metadata: Metadata = { title: "Kuis Kapten | Vecalss LMS" };

export default async function MentorQuizPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const [session, params] = await Promise.all([requireTutorSession(), searchParams]);
  const rows = await getMentorQuizDashboardRows(session.user.id);
  const query = parseQuizDashboardQuery(params);
  if (query.subject && !kaptenSubjects.some(subject => subject.code === query.subject)) query.subject = "";
  const result = queryQuizDashboard(rows, query);
  return <KaptenQuizDashboardPageModule key={quizDashboardHref(result.query)} session={session} result={result} subjects={kaptenSubjects}
    counts={{ total: rows.length, published: rows.filter(row => row.publication === "published").length, changed: rows.filter(row => row.hasUnpublishedChanges && row.publication !== "archived").length }}
    initialCreateDialogOpen={params.create === "1"} />;
}
