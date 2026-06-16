import type { ExamEvent, Major, StudentProfile, University } from "@/generated/prisma/client";
import type { SessionContext } from "@/lib/auth/types";
import { PortalShell } from "@/modules/portal/components/portal-shell";

type DashboardProfile = StudentProfile & {
  targetExamEvent: ExamEvent | null;
  targetMajor: Major | null;
  targetUniversity: University | null;
};

function DashboardPageModule({
  profile,
  session,
}: {
  profile: DashboardProfile;
  session: SessionContext;
}) {
  return (
    <PortalShell
      description="This is the first protected dashboard placeholder for the MVP. It confirms the session state, shows the stored onboarding data, and leaves room for UC-03 to take over next."
      title="Student dashboard"
      userLabel={session.user.fullName}
    >
      <div className="grid gap-6 lg:grid-cols-[1.05fr_0.95fr]">
        <section className="rounded-[28px] border border-primary-100 bg-white p-6 shadow-[0_18px_60px_-40px_rgba(17,37,26,0.45)]">
          <p className="text-xs tracking-[0.16em] text-primary-700 uppercase">
            Protected home
          </p>
          <h2 className="mt-3 text-3xl leading-tight font-medium">
            Hello, {session.user.fullName.split(" ")[0]}
          </h2>
          <p className="mt-4 max-w-[55ch] text-sm leading-7 text-secondary-600 md:text-base">
            Your account is active, the first-use flow is complete enough to enter the
            student area, and the next milestone is the real UC-03 dashboard experience.
          </p>

          <div className="mt-8 grid gap-4 md:grid-cols-2">
            <div className="rounded-3xl border border-primary-100 bg-primary-50 p-5">
              <p className="text-xs tracking-[0.14em] text-primary-700 uppercase">
                Onboarding status
              </p>
              <p className="mt-2 text-2xl font-medium text-secondary-900">
                {profile.onboardingStatus.replaceAll("_", " ")}
              </p>
            </div>
            <div className="rounded-3xl border border-primary-100 bg-primary-50 p-5">
              <p className="text-xs tracking-[0.14em] text-primary-700 uppercase">
                Session state
              </p>
              <p className="mt-2 text-2xl font-medium text-secondary-900">
                Signed in
              </p>
            </div>
          </div>
        </section>

        <section className="rounded-[28px] border border-primary-100 bg-white p-6 shadow-[0_18px_60px_-40px_rgba(17,37,26,0.45)]">
          <p className="text-xs tracking-[0.16em] text-primary-700 uppercase">
            Stored goals
          </p>
          <dl className="mt-5 space-y-4 text-sm leading-7 text-secondary-700 md:text-base">
            <div>
              <dt className="font-medium text-secondary-900">Target exam</dt>
              <dd>{profile.targetExamEvent?.name ?? "Not set yet"}</dd>
            </div>
            <div>
              <dt className="font-medium text-secondary-900">Target university</dt>
              <dd>{profile.targetUniversity?.name ?? "Not set yet"}</dd>
            </div>
            <div>
              <dt className="font-medium text-secondary-900">Target major</dt>
              <dd>{profile.targetMajor?.name ?? "Not set yet"}</dd>
            </div>
            <div>
              <dt className="font-medium text-secondary-900">Timezone</dt>
              <dd>{profile.timezone}</dd>
            </div>
          </dl>
        </section>
      </div>
    </PortalShell>
  );
}

export { DashboardPageModule };
