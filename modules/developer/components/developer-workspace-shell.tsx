import Link from "next/link";

import { Button } from "@/components/ui/button";
import type { SessionContext } from "@/lib/auth/types";
import { logoutAction } from "@/modules/auth/actions";
import { BrandLogo } from "@/modules/home/components/home-primitives";

function DeveloperWorkspaceShell({
  children,
  session,
}: {
  children: React.ReactNode;
  session: SessionContext;
}) {
  return (
    <div className="min-h-svh bg-voyage-canvas text-secondary-900">
      <header className="sticky top-0 z-20 border-b border-primary-100 bg-voyage-canvas/95">
        <div className="mx-auto flex min-h-16 w-full max-w-[1420px] items-center gap-4 px-4 md:px-8 lg:px-10">
          <Link
            aria-label="Vecalss — Laporan"
            className="inline-flex shrink-0 items-center rounded-xl focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-primary-500"
            href="/developer/reports"
          >
            <BrandLogo compact />
          </Link>

          <div className="ml-auto flex min-w-0 items-center gap-3 sm:gap-5">
            <p className="hidden max-w-48 truncate text-sm font-medium text-secondary-700 sm:block" title={session.user.fullName}>
              {session.user.fullName}
            </p>
            <form action={logoutAction}>
              <input name="audience" type="hidden" value="developer" />
              <Button className="min-h-11" size="default" type="submit" variant="brandOutline">
                Keluar
              </Button>
            </form>
          </div>
        </div>
      </header>

      <main className="mx-auto flex w-full max-w-[1420px] flex-col gap-7 px-4 py-8 md:px-8 lg:px-10 lg:py-10">
        {children}
      </main>
    </div>
  );
}

export { DeveloperWorkspaceShell };
