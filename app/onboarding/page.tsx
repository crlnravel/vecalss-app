import { redirectIfOnboardingAlreadyComplete, requireStudentSession } from "@/lib/auth/access";
import { prisma } from "@/lib/prisma";
import { OnboardingPageModule } from "@/modules/student/OnboardingPageModule";

export default async function OnboardingPage() {
  const session = await requireStudentSession({
    allowIncompleteOnboarding: true,
  });

  redirectIfOnboardingAlreadyComplete(session);

  const [examEvents, universities, majors] = await Promise.all([
    prisma.examEvent.findMany({
      orderBy: [{ examDate: "asc" }, { name: "asc" }],
      where: {
        isActive: true,
      },
    }),
    prisma.university.findMany({
      orderBy: {
        name: "asc",
      },
    }),
    prisma.major.findMany({
      include: {
        university: true,
      },
      orderBy: {
        name: "asc",
      },
      where: {
        isActive: true,
      },
    }),
  ]);

  return (
    <OnboardingPageModule
      examEvents={examEvents}
      majors={majors}
      session={session}
      universities={universities}
    />
  );
}
