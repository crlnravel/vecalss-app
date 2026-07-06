import Link from "next/link";

import { Button } from "@/components/ui/button";
import type { LoginAudience } from "@/lib/auth/types";
import { logoutAction } from "@/modules/auth/actions";
import { BrandLogo } from "@/modules/home/components/home-primitives";

function PortalShell({
  audience,
  children,
  description,
  title,
  userLabel,
}: {
  audience: LoginAudience;
  children: React.ReactNode;
  description: string;
  title: string;
  userLabel: string;
}) {
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
