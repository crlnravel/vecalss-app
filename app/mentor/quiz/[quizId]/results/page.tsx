import { redirect } from "next/navigation";

import { requireTutorSession } from "@/lib/auth/access";

export default async function MentorQuizResultsRedirect({ params }: { params: Promise<{ quizId: string }> }) {
  const [{ quizId }] = await Promise.all([params, requireTutorSession()]);
  redirect(`/mentor/quiz/${quizId}?tab=hasil`);
}
