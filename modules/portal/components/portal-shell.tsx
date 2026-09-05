import Link from "next/link";

import { Button } from "@/components/ui/button";
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
import type { LoginAudience, SessionContext } from "@/lib/auth/types";
import { isAdminStudentPreviewEnabled } from "@/lib/config";
import { cn } from "@/lib/utils";
import { logoutAction } from "@/modules/auth/actions";
import { BrandLogo } from "@/modules/home/components/home-primitives";
import { StudentAccountMenu } from "@/modules/student/components/student-account-menu";

import { AdminPortalNav } from "./admin-portal-nav";

const adminSectionLabels = {
  ai: "Vera AI",
  "ai-policy": "Policy Vera AI",
  "audit-logs": "Log audit",
  "ai-usage": "Pemakaian AI",
  docs: "Dokumentasi",
  kapten: "Kapten",
  notifications: "Notifikasi",
  overview: "Dashboard",
  "student-banners": "Banner siswa",
  "student-preview": "Student preview",
  students: "Siswa",
} as const;

const adminSectionRootHrefs = {
  ai: "/admin/ai",
  "ai-policy": "/admin/ai/policies",
  "audit-logs": "/admin/audit-logs",
  "ai-usage": "/admin/ai/usage",
  docs: "/admin/docs",
  kapten: "/admin/kapten",
  notifications: "/admin/notifications",
  overview: "/admin",
  "student-banners": "/admin/student-banners",
  "student-preview": "/admin/student-preview",
  students: "/admin/enrollment",
} as const;

function PortalShell({
  audience,
  activeAdminSection,
  children,
  description,
  session,
  title,
}: {
  audience: LoginAudience;
  activeAdminSection?: "overview" | "ai" | "students" | "enrollment" | "kapten" | "notifications" | "audit-logs" | "ai-usage" | "ai-policy" | "student-banners" | "student-preview" | "docs";
  children: React.ReactNode;
  description: string;
  session: SessionContext;
  title: string;
}) {
  if (audience === "admin") {
    const activeSection = activeAdminSection === "enrollment"
      ? "students"
      : activeAdminSection ?? "overview";
    const activeLabel = adminSectionLabels[activeSection];
    const rootHref = adminSectionRootHrefs[activeSection];
    const isRootPage = title === activeLabel;
    const studentPreviewEnabled = isAdminStudentPreviewEnabled();

    return (
      <SidebarProvider className="!bg-voyage-canvas lg:gap-2 lg:p-6">
        <div className="flex min-h-svh w-full bg-voyage-canvas text-secondary-900 lg:gap-2">
          <AdminPortalNav activeSection={activeSection} studentPreviewEnabled={studentPreviewEnabled} />

          <SidebarInset className="min-h-svh min-w-0 bg-voyage-canvas lg:rounded-3xl">
            <header
              aria-label="Header workspace Admin"
              className="sticky top-0 z-20 bg-voyage-canvas/90 backdrop-blur-xl lg:top-6 lg:rounded-3xl lg:border"
            >
              <div className="flex min-h-16 items-center gap-3 px-4 md:px-6 lg:px-8">
                <SidebarTrigger
                  aria-label="Buka atau tutup navigasi"
                  className="size-[44px] min-h-[44px] min-w-[44px] shrink-0 lg:hidden"
                />

                <div className="hidden min-w-0 flex-1 md:block">
                  <Breadcrumb>
                    <BreadcrumbList>
                      <BreadcrumbItem>
                        <BreadcrumbLink className="text-secondary-500" href={rootHref}>
                          {activeLabel}
                        </BreadcrumbLink>
                      </BreadcrumbItem>
                      {!isRootPage ? (
                        <>
                          <BreadcrumbSeparator />
                          <BreadcrumbItem>
                            <BreadcrumbPage>{title}</BreadcrumbPage>
                          </BreadcrumbItem>
                        </>
                      ) : null}
                    </BreadcrumbList>
                  </Breadcrumb>
                </div>

                <div className="ml-auto" />
                <StudentAccountMenu audience="admin" session={session} />
              </div>
            </header>

            <div
              className={cn(
                "mx-auto flex min-w-0 w-full max-w-[1420px] flex-col gap-7 px-4 py-8 md:px-8 lg:px-10 lg:py-10",
              )}
            >
              <p className="sr-only">{description}</p>
              {children}
            </div>
          </SidebarInset>
        </div>
      </SidebarProvider>
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
                Signed in as {session.user.fullName}
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
