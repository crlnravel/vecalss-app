import type { ExamEvent, Major, University } from "@/generated/prisma/client";

import { OnboardingForm } from "./components/onboarding-form";

function OnboardingPageModule({
  examEvents,
  majors,
  universities,
}: {
  examEvents: ExamEvent[];
  majors: Array<Major & { university: University }>;
  universities: University[];
}) {
  return <OnboardingForm examEvents={examEvents} majors={majors} universities={universities} />;
}

export { OnboardingPageModule };
