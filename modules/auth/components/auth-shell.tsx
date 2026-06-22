import Link from "next/link";

import { BrandLogo } from "@/modules/home/components/home-primitives";

const supportPoints = [
  "Admins can provision students from approved registrations without waiting on a separate back office.",
  "Students land in one guided flow: sign in, secure the account, choose their goals, then arrive on a dashboard that reflects those choices.",
  "Password reset stays available even before the full notification stack is in place, which keeps this slice practical during MVP rollout.",
];

function AuthShell({
  children,
  description,
  eyebrow,
  footer,
  title,
}: {
  children: React.ReactNode;
  description: string;
  eyebrow: string;
  footer?: React.ReactNode;
  title: string;
}) {
  return (
    <main className="min-h-screen bg-[linear-gradient(180deg,#fcf8ee_0%,#f8f1df_42%,#f2e7d4_100%)] text-secondary-900">
      <div className="mx-auto flex min-h-screen w-full max-w-6xl flex-col px-4 py-6 md:px-8 md:py-8">
        <div className="flex items-center justify-between rounded-[24px] border border-secondary-900/10 bg-[rgba(255,249,236,0.84)] px-4 py-3 shadow-[0_18px_48px_-32px_rgba(11,18,45,0.16)] backdrop-blur md:px-5">
          <Link href="/" className="inline-flex items-center">
            <BrandLogo compact />
          </Link>
          <p className="hidden text-sm text-secondary-500 md:block">
            Structured university prep, one focused step at a time.
          </p>
        </div>

        <div className="flex flex-1 items-center py-8 md:py-14">
          <div className="grid w-full gap-5 lg:grid-cols-[minmax(0,1.03fr)_minmax(320px,0.97fr)] lg:gap-8">
            <section className="parchment-panel rounded-[32px] p-6 md:p-8">
              <p className="text-sm font-medium tracking-[0.18em] text-primary-700 uppercase">
                {eyebrow}
              </p>
              <h1 className="mt-3 max-w-[14ch] text-3xl leading-tight font-medium text-secondary-900 md:text-5xl">
                {title}
              </h1>
              <p className="mt-4 max-w-[48ch] text-base leading-7 text-secondary-600 md:text-lg">
                {description}
              </p>
              <div className="mt-8">{children}</div>
              {footer ? <div className="mt-8 border-t border-primary-100 pt-5">{footer}</div> : null}
            </section>

            <aside className="navy-panel rounded-[32px] px-6 py-7 text-white md:px-8">
              <p className="text-sm font-medium tracking-[0.18em] text-accent-300 uppercase">
                Why this matters
              </p>
              <h2 className="mt-3 max-w-[14ch] text-[30px] leading-[1.08] font-medium md:text-[38px]">
                A smoother start for both admins and students
              </h2>
              <div className="mt-6 grid gap-3 text-sm leading-7 text-white/78 md:text-base">
                {supportPoints.map((point, index) => (
                  <div
                    key={point}
                    className="rounded-[22px] border border-white/10 bg-white/[0.04] px-4 py-4"
                  >
                    <p className="text-xs tracking-[0.18em] text-accent-300 uppercase">
                      {`0${index + 1}`}
                    </p>
                    <p className="mt-2">{point}</p>
                  </div>
                ))}
              </div>
            </aside>
          </div>
        </div>
      </div>
    </main>
  );
}

export { AuthShell };
