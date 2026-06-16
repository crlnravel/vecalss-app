import Link from "next/link";

import { BrandLogo } from "@/modules/home/components/home-primitives";

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
    <main className="min-h-screen bg-[radial-gradient(circle_at_top_left,_rgba(26,107,60,0.18),_transparent_32%),linear-gradient(180deg,#f7fbf8_0%,#ffffff_38%,#eef4f1_100%)] text-secondary-900">
      <div className="mx-auto flex min-h-screen w-full max-w-6xl flex-col px-4 py-6 md:px-8 md:py-8">
        <div className="flex items-center justify-between">
          <Link href="/" className="inline-flex items-center">
            <BrandLogo compact />
          </Link>
          <p className="hidden text-sm text-secondary-500 md:block">
            Structured university prep, one focused step at a time.
          </p>
        </div>

        <div className="flex flex-1 items-center py-10 md:py-16">
          <div className="grid w-full gap-6 md:grid-cols-[1.05fr_0.95fr] md:gap-10">
            <section className="rounded-[32px] border border-primary-100 bg-white/90 p-6 shadow-[0_24px_80px_-48px_rgba(17,37,26,0.55)] backdrop-blur md:p-8">
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

            <aside className="rounded-[32px] border border-secondary-900/10 bg-secondary-900 px-6 py-8 text-white shadow-[0_24px_80px_-48px_rgba(10,23,17,0.75)] md:px-8">
              <p className="text-sm font-medium tracking-[0.18em] text-accent-300 uppercase">
                Why this matters
              </p>
              <h2 className="mt-3 text-2xl leading-tight font-medium md:text-3xl">
                A smoother start for both admins and students
              </h2>
              <div className="mt-6 space-y-4 text-sm leading-7 text-white/78 md:text-base">
                <p>
                  Admins can provision students from approved registrations without waiting
                  on a separate back office.
                </p>
                <p>
                  Students land in one guided flow: sign in, secure the account, choose
                  their goals, then arrive on a dashboard that reflects those choices.
                </p>
                <p>
                  Password reset stays available even before the full notification stack is
                  in place, which keeps this slice practical during MVP rollout.
                </p>
              </div>
            </aside>
          </div>
        </div>
      </div>
    </main>
  );
}

export { AuthShell };
