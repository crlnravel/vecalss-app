import { notFound } from "next/navigation";

import { requireStudentSession } from "@/lib/auth/access";
import { getStudentNotificationFeed } from "@/lib/notifications/service";
import { QuizSubjectDetailPageModule } from "@/modules/quiz/QuizSubjectDetailPageModule";
import { getAvailableQuizSubjects } from "@/modules/quiz/server-data";

export default async function QuizSubjectPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const [{ slug }, session] = await Promise.all([
    params,
    requireStudentSession(),
  ]);
  const [subjects, notificationFeed] = await Promise.all([
    getAvailableQuizSubjects(session.user.id),
    getStudentNotificationFeed({ userId: session.user.id }),
  ]);
  const subject = subjects.find((item) => item.slug === slug);

  if (!subject) {
    notFound();
  }

  return <QuizSubjectDetailPageModule notificationFeed={notificationFeed} session={session} subject={subject} />;
}
