import { notFound, redirect } from "next/navigation";
import { requireTutorSession } from "@/lib/auth/access";
import { getSubjectMetadataBySlug } from "@/lib/quiz/repository";

/** Existing bookmarks now open the same cross-subtest dashboard with a filter. */
export default async function MentorQuizSubjectPage({ params }: { params: Promise<{ subjectSlug: string }> }) {
  const [{ subjectSlug }] = await Promise.all([params, requireTutorSession()]);
  const subject = getSubjectMetadataBySlug(subjectSlug);
  if (!subject) notFound();
  redirect(`/mentor/quiz?subject=${encodeURIComponent(subject.code)}`);
}
