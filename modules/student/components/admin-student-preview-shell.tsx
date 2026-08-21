import Link from "next/link";

import {
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbLink,
  BreadcrumbList,
  BreadcrumbPage,
  BreadcrumbSeparator,
} from "@/components/ui/breadcrumb";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  SidebarInset,
  SidebarProvider,
  SidebarTrigger,
} from "@/components/ui/sidebar";
import {
  buildAdminStudentPreviewBannerEditorRoute,
  buildAdminStudentPreviewExit,
  buildAdminStudentPreviewRoute,
} from "@/lib/student/preview-routes";
import type { StudentSurfaceContext } from "@/lib/student/surface-context";
import { StudentAccountMenu } from "@/modules/student/components/student-account-menu";
import { StudentSidebar } from "@/modules/student/components/student-sidebar";

const previewRootByLabel: Record<string, string> = {
  Beranda: "/",
  Kuis: "/quiz",
  Materi: "/courses",
  Tryout: "/tryout",
};

function AdminStudentPreviewShell({
  activeLabel,
  breadcrumbLabel,
  children,
  context,
}: {
  activeLabel: "Beranda" | "Kuis" | "Materi" | "Tryout";
  breadcrumbLabel: string;
  children: React.ReactNode;
  context: Extract<StudentSurfaceContext, { mode: "admin-preview" }>;
}) {
  const rootHref = buildAdminStudentPreviewRoute(previewRootByLabel[activeLabel]);
  const isRootPage = breadcrumbLabel === activeLabel;
  const adminExitHref = buildAdminStudentPreviewExit("/admin");
  const bannerEditorHref = buildAdminStudentPreviewBannerEditorRoute();

  return (
    <SidebarProvider>
      <div className="flex min-h-svh w-full bg-[#f7faf8] text-secondary-900">
        <StudentSidebar activeLabel={activeLabel} previewMode />

        <SidebarInset className="bg-transparent">
          <header className="sticky top-0 z-20 border-b border-primary-100/80 bg-[#f7faf8]/90 backdrop-blur-xl">
            <div className="flex min-h-16 items-center gap-3 px-4 md:px-6 lg:px-8">
              <SidebarTrigger className="shrink-0" />

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
                          <BreadcrumbPage>{breadcrumbLabel}</BreadcrumbPage>
                        </BreadcrumbItem>
                      </>
                    ) : null}
                  </BreadcrumbList>
                </Breadcrumb>
              </div>

              <div className="ml-auto" />
              <StudentAccountMenu
                audience="admin"
                disableDebugAccountSwitcher
                session={context.actor.session}
              />
            </div>
          </header>

          <ScrollArea className="h-[calc(100svh-4rem)]">
            <main className="mx-auto flex w-full max-w-[1420px] flex-col gap-7 px-4 py-8 md:px-8 lg:px-10 lg:py-10">
              <aside
                aria-label="Admin student preview"
                className="flex flex-col gap-4 rounded-3xl border border-[#f0c98a] bg-[#fff8e8] px-5 py-4 shadow-[0_18px_38px_-28px_rgba(153,92,22,0.45)] md:flex-row md:items-center md:justify-between"
              >
                <div>
                  <p className="text-xs font-bold tracking-[0.16em] text-[#9a5c16] uppercase">Student preview</p>
                  <p className="mt-1 text-sm font-semibold text-secondary-900">
                    Menampilkan pengalaman siswa untuk {context.student.displayName}
                  </p>
                  <p className="mt-1 max-w-2xl text-sm leading-6 text-secondary-600">
                    Sesi admin kamu tetap aktif. Jelajah di ruang ini tidak mengubah progres siswa.
                  </p>
                </div>
                <div className="flex flex-wrap gap-2">
                  <Button
                    nativeButton={false}
                    render={<Link href={bannerEditorHref} />}
                    variant="ghost"
                  >
                    Edit banners
                  </Button>
                  <Button
                    nativeButton={false}
                    render={<Link href={adminExitHref} />}
                    variant="brandOutline"
                  >
                    Kembali ke admin
                  </Button>
                </div>
              </aside>

              {children}
            </main>
          </ScrollArea>
        </SidebarInset>
      </div>
    </SidebarProvider>
  );
}

export { AdminStudentPreviewShell };
