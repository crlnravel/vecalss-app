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
import type { BannerDestination } from "@/lib/banner/destinations";
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
  bannerEditMode = false,
  breadcrumbLabel,
  children,
  context,
  isRootPage = false,
}: {
  activeLabel: "Beranda" | "Kuis" | "Materi" | "Tryout";
  bannerEditMode?: boolean;
  breadcrumbLabel: string;
  children: React.ReactNode;
  context: Extract<StudentSurfaceContext, { mode: "admin-preview" }>;
  isRootPage?: boolean;
}) {
  const rootHref = buildAdminStudentPreviewRoute(previewRootByLabel[activeLabel]);
  const adminExitHref = buildAdminStudentPreviewExit("/admin");
  const bannerDestinationByLabel: Record<typeof activeLabel, BannerDestination> = {
    Beranda: "beranda",
    Kuis: "kuis",
    Materi: "materi",
    Tryout: "tryout",
  };
  const bannerEditorHref = buildAdminStudentPreviewBannerEditorRoute(bannerDestinationByLabel[activeLabel]);

  return (
    <SidebarProvider>
      <div className="student-page-canvas flex min-h-svh w-full text-secondary-900">
        <StudentSidebar activeLabel={activeLabel} previewMode />

        <SidebarInset className="bg-transparent">
          <header className="sticky top-0 z-20 border-b border-primary-100/80 bg-[var(--voyage-canvas)]/90 backdrop-blur-xl">
            <div className="flex min-h-16 items-center gap-3 px-4 md:px-6 lg:px-8">
              <SidebarTrigger className="shrink-0" size="icon" />

              <div className="hidden min-w-0 flex-1 md:block">
                <Breadcrumb>
                  <BreadcrumbList>
                    <BreadcrumbItem>
                      {isRootPage ? (
                        <BreadcrumbPage>{activeLabel}</BreadcrumbPage>
                      ) : (
                        <BreadcrumbLink className="text-secondary-700" href={rootHref}>
                          {activeLabel}
                        </BreadcrumbLink>
                      )}
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
            <div className="mx-auto flex w-full max-w-[1420px] flex-col gap-7 px-4 py-8 md:px-8 lg:px-10 lg:py-10">
              <aside
                aria-label="Pratinjau tampilan siswa untuk admin"
                className="flex flex-col gap-4 rounded-3xl border border-[var(--warning-200)] bg-[var(--warning-50)] px-5 py-4 shadow-[0_18px_38px_-28px_color-mix(in_oklab,var(--warning-700)_45%,transparent)] md:flex-row md:items-center md:justify-between"
              >
                <div>
                  <p className="text-xs font-bold tracking-[0.16em] text-[var(--voyage-warm-sun-ink)] uppercase">Pratinjau siswa</p>
                  <p className="mt-1 text-sm font-semibold text-secondary-900">
                    Menampilkan pengalaman siswa untuk {context.student.displayName}
                  </p>
                  <p className="mt-1 max-w-2xl text-sm leading-6 text-secondary-600">
                    Kamu tetap masuk sebagai admin. Membuka pratinjau ini tidak mengubah progres siswa.
                  </p>
                  <p className="mt-1 max-w-2xl text-sm leading-6 text-secondary-700">
                    Kamu dapat mengubah banner siswa dari pratinjau ini. Mulai ulang Tryout membuat penugasan baru untuk pratinjau; pengerjaan, jawaban, notifikasi, dan progres siswa tetap tidak berubah.
                  </p>
                </div>
                <div className="flex flex-wrap gap-2">
                  <Button
                    aria-current={bannerEditMode ? "page" : undefined}
                    nativeButton={false}
                    render={<Link href={bannerEditorHref} />}
                    variant="ghost"
                  >
                    Ubah banner siswa
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
            </div>
          </ScrollArea>
        </SidebarInset>
      </div>
    </SidebarProvider>
  );
}

export { AdminStudentPreviewShell };
