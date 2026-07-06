import type { ExamEvent, Major, University } from "@/generated/prisma/client";
import type { SessionContext } from "@/lib/auth/types";
import { PortalShell } from "@/modules/portal/components/portal-shell";

import { OnboardingForm } from "./components/onboarding-form";

function OnboardingPageModule({
  examEvents,
  majors,
  session,
  universities,
}: {
  examEvents: ExamEvent[];
  majors: Array<Major & { university: University }>;
  session: SessionContext;
  universities: University[];
}) {
  return (
    <PortalShell
      audience="student"
      description="A short welcome pass helps the student understand the learning rhythm and store optional goals that will later inform dashboard countdowns and study priorities."
      title="Welcome to Vecalss"
      userLabel={session.user.fullName}
    >
      <div className="grid gap-6 lg:grid-cols-[0.9fr_1.1fr]">
        <section className="rounded-5xl border border-primary-100 bg-secondary-900 p-6 text-white shadow-[0_18px_60px_-40px_rgba(17,37,26,0.65)]">
          <p className="text-xs tracking-[0.16em] text-accent-300 uppercase">
            UC-02 Onboarding
          </p>
          <h2 className="mt-3 text-3xl leading-tight font-medium">
            Four things to expect once you are inside the platform
          </h2>
          <div className="mt-6 space-y-4 text-sm leading-7 text-white/80 md:text-base">
            <p>
              The dashboard becomes the daily home for countdowns, mission status, and
              next best actions.
            </p>
            <p>
              Sequential modules keep progress structured instead of scattering revision
              effort across too many topics at once.
            </p>
            <p>
              Tryouts and analytics will later attach to the same target exam context you
              select here, so even optional choices already help shape the experience.
            </p>
          </div>
        </section>

        <OnboardingForm examEvents={examEvents} majors={majors} universities={universities} />
      </div>
    </PortalShell>
  );
}

export { OnboardingPageModule };
