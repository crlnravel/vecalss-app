"use client";

import {
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbLink,
  BreadcrumbList,
  BreadcrumbPage,
  BreadcrumbSeparator,
} from "@/components/ui/breadcrumb";
import {
  SidebarInset,
  SidebarProvider,
  SidebarTrigger,
} from "@/components/ui/sidebar";
import type { SessionContext } from "@/lib/auth/types";
import { cn } from "@/lib/utils";
import { AffiliatorSidebar } from "./affiliator-sidebar";
import { StudentAccountMenu } from "@/modules/student/components/student-account-menu";

function AffiliatorWorkspaceShell({
  activeLabel,
  breadcrumbLabel,
  children,
  mainClassName,
  session,
}: {
  activeLabel: string;
  breadcrumbLabel: string;
  children: React.ReactNode;
  mainClassName?: string;
  session: SessionContext;
}) {
  const rootHref = "/affiliator/dashboard";
  const isRootPage = activeLabel === "Dashboard";

  return (
    <SidebarProvider className="workspace-page-canvas lg:gap-2 lg:p-6">
      <div className="flex min-h-svh w-full bg-transparent text-secondary-900 lg:gap-2">
        <AffiliatorSidebar activeLabel={activeLabel} />

        <SidebarInset className="min-h-svh min-w-0 !bg-transparent lg:rounded-3xl">
          <header className="sticky top-0 z-20 mx-auto w-[calc(100%-2rem)] max-w-[calc(1420px-2rem)] overflow-hidden rounded-control border-primary-100/80 bg-[rgba(247,250,248,0.58)] shadow-[0_18px_40px_-28px_color-mix(in_oklab,var(--voyage-deep)_38%,transparent)] backdrop-blur-3xl backdrop-saturate-150 md:w-[calc(100%-4rem)] md:max-w-[calc(1420px-4rem)] lg:top-6 lg:w-[calc(100%-5rem)] lg:max-w-[calc(1420px-5rem)] lg:border">
            <div className="relative z-10 flex min-h-16 items-center gap-3 px-4 md:px-6 lg:px-8">
              <SidebarTrigger className="shrink-0 lg:hidden" />

              <div className="hidden min-w-0 flex-1 md:block">
                <Breadcrumb>
                  <BreadcrumbList>
                    <BreadcrumbItem>
                      <BreadcrumbLink className="text-secondary-500" href={rootHref}>
                        Dashboard
                      </BreadcrumbLink>
                    </BreadcrumbItem>
                    {!isRootPage ? (
                      <>
                        <BreadcrumbSeparator />
                        <BreadcrumbItem>
                          <BreadcrumbPage>{breadcrumbLabel}</BreadcrumbPage>
                        </BreadcrumbItem>
                      </>
                    ) : null}
                  </BreadcrumbList>
                </Breadcrumb>
              </div>

              <div className="ml-auto">
                <StudentAccountMenu audience="affiliator" session={session} />
              </div>
            </div>
          </header>

          <main
            className={cn(
              "mx-auto flex w-full max-w-[1420px] flex-col gap-7 px-4 py-8 md:px-8 lg:px-10 lg:py-10",
              mainClassName,
            )}
          >
            {children}
          </main>
        </SidebarInset>
      </div>
    </SidebarProvider>
  );
}

export { AffiliatorWorkspaceShell };
