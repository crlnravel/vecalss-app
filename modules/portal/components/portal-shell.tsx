import Link from "next/link";

import { Button } from "@/components/ui/button";
import type { LoginAudience } from "@/lib/auth/types";
import { logoutAction } from "@/modules/auth/actions";
import { BrandLogo } from "@/modules/home/components/home-primitives";

import { AdminPortalNav } from "./admin-portal-nav";

function PortalShell({
  audience,
  activeAdminSection,
  children,
  description,
  title,
  userLabel,
}: {
  audience: LoginAudience;
  activeAdminSection?: "overview" | "students" | "enrollment" | "kapten" | "imports" | "media";
  children: React.ReactNode;
  description: string;
  title: string;
  userLabel: string;
}) {
  if (audience === "admin") {
    const activeSection = activeAdminSection === "enrollment"
      ? "students"
      : activeAdminSection ?? "overview";

    return (
      <main className="min-h-screen bg-[#f7faf8] text-[#173c2d]">
        <div className="mx-auto flex min-h-screen w-full max-w-[1480px] flex-col px-4 py-4 sm:px-6 md:px-8 md:py-6">
          <div className="flex min-h-[calc(100vh-2rem)] flex-1 gap-5 md:min-h-[calc(100vh-3rem)] md:gap-6">
            <AdminPortalNav activeSection={activeSection} />

            <div className="min-w-0 flex-1">
              <header className="rounded-[24px] border border-[#d6e5db] bg-white px-4 py-4 shadow-[0_20px_54px_-42px_rgba(1,76,56,0.55)] sm:px-6 md:px-7 md:py-5">
                <div className="flex items-start gap-3 md:items-center md:justify-between">
                  <div className="flex min-w-0 items-start gap-3 md:items-center md:gap-5">
                    <div className="md:hidden">
                      <AdminPortalNav activeSection={activeSection} mobileOnly />
                    </div>
                    <Link aria-label="Vecalss home" className="hidden shrink-0 items-center md:inline-flex" href="/">
                      <BrandLogo compact />
                    </Link>
                    <div className="hidden h-10 w-px bg-[#d6e5db] md:block" />
                    <div className="min-w-0">
                      <p className="text-xs font-bold uppercase tracking-[0.16em] text-[#176b4d]">
                        Vecalss operations
                      </p>
                      <h1 className="mt-1 truncate text-lg font-bold tracking-[-0.02em] text-[#173c2d] sm:text-xl">
                        {title}
                      </h1>
                    </div>
                  </div>

                  <div className="flex shrink-0 items-center gap-3">
                    <div className="hidden rounded-full bg-[#eef8f1] px-4 py-2 text-xs font-semibold text-[#176b4d] lg:block">
                      Signed in as {userLabel}
                    </div>
                    <form action={logoutAction}>
                      <input name="audience" type="hidden" value={audience} />
                      <Button size="default" type="submit" variant="brandOutline">
                        Log out
                      </Button>
                    </form>
                  </div>
                </div>
                <p className="mt-4 max-w-[72ch] text-sm leading-6 text-[#5f776a] md:mt-3">
                  {description}
                </p>
              </header>

              <div className="py-5 md:py-7">{children}</div>
            </div>
          </div>
        </div>
      </main>
    );
  }

  return (
    <main className="min-h-screen bg-[linear-gradient(180deg,#fcf8ee_0%,#f7f0df_48%,#efe6d5_100%)] text-secondary-900">
      <div className="mx-auto flex min-h-screen w-full max-w-7xl flex-col px-4 py-6 md:px-8 md:py-8">
        <header className="parchment-panel rounded-5xl px-5 py-4 md:px-7">
          <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
            <div className="flex flex-col gap-3 md:flex-row md:items-center md:gap-5">
              <Link href="/" className="inline-flex items-center">
                <BrandLogo compact />
              </Link>
              <div className="h-px w-full bg-primary-100 md:h-12 md:w-px" />
              <div>
                <p className="text-xs tracking-[0.16em] text-primary-700 uppercase">
                  Vecalss Workspace
                </p>
                <h1 className="mt-1 text-xl font-medium md:text-2xl">{title}</h1>
              </div>
            </div>

            <div className="flex items-center gap-3">
              <div className="hidden rounded-full bg-primary-50 px-4 py-2 text-sm text-primary-800 md:block">
                Signed in as {userLabel}
              </div>
              <form action={logoutAction}>
                <input name="audience" type="hidden" value={audience} />
                <Button size="default" type="submit" variant="brandOutline">
                  Log out
                </Button>
              </form>
            </div>
          </div>
          <p className="mt-4 max-w-[72ch] text-sm leading-6 text-secondary-600 md:text-base">
            {description}
          </p>
        </header>

        <div className="flex-1 py-6 md:py-8">{children}</div>
      </div>
    </main>
  );
}

export { PortalShell };
