"use client";

import { useRouter } from "next/navigation";
import { Search } from "@/lib/icons";
import { useEffect, useRef, useState, type ReactNode } from "react";

import {
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbLink,
  BreadcrumbList,
  BreadcrumbPage,
  BreadcrumbSeparator,
} from "@/components/ui/breadcrumb";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  SidebarInset,
  SidebarProvider,
  SidebarTrigger,
} from "@/components/ui/sidebar";
import type { SessionContext } from "@/lib/auth/types";
import { cn } from "@/lib/utils";
import { MentorSidebar } from "@/modules/mentor/components/mentor-sidebar";
import { StudentAccountMenu } from "@/modules/student/components/student-account-menu";

type PendingNavigation =
  | { destination: string; kind: "route" }
  | { kind: "history" };

const mentorRootHrefByLabel: Record<string, string> = {
  Dashboard: "/mentor/dashboard",
  Materi: "/mentor/materi",
  Kuis: "/mentor/quiz",
  "Bank Soal": "/mentor/quiz/question-bank",
  Tryout: "/mentor/tryout",
  Media: "/mentor/media",
  Pengaturan: "/mentor/settings",
};

function MentorNavigationConfirmDialog({
  onCancel,
  onConfirm,
  onOpenChange,
  open,
}: {
  onCancel: () => void;
  onConfirm: () => void;
  onOpenChange: (open: boolean) => void;
  open: boolean;
}) {
  return (
    <AlertDialog onOpenChange={onOpenChange} open={open}>
      <AlertDialogContent
        className="gap-5 border-red-100 bg-white p-6 sm:max-w-lg"
        variant="danger"
      >
        <AlertDialogHeader>
          <AlertDialogTitle className="font-semibold text-secondary-900">
            Keluar dari editor?
          </AlertDialogTitle>
          <AlertDialogDescription className="mt-2 text-sm leading-6 text-secondary-500">
            Perubahan yang belum disimpan akan hilang jika Anda meninggalkan
            halaman ini.
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogAction
            onClick={onConfirm}
            type="button"
            variant="destructive"
          >
            Keluar
          </AlertDialogAction>
          <AlertDialogCancel onClick={onCancel} type="button">
            Batal
          </AlertDialogCancel>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}

function MentorWorkspaceShell({
  activeLabel,
  sidebarAppearance = "default",
  breadcrumbLabel,
  breadcrumbParent,
  children,
  contentElement: ContentElement = "main",
  mainClassName,
  onNavigateAway,
  searchPlaceholder = "Cari konten, quiz, tryout, atau asset...",
  session,
  showBreadcrumb = true,
  showSearch = true,
  shouldGuardNavigation = false,
}: {
  activeLabel: string;
  breadcrumbLabel: string;
  breadcrumbParent?: { href: string; label: string };
  children: ReactNode;
  contentElement?: "div" | "main";
  mainClassName?: string;
  onNavigateAway?: () => boolean;
  searchPlaceholder?: string;
  session: SessionContext;
  sidebarAppearance?: "default" | "reference";
  showBreadcrumb?: boolean;
  showSearch?: boolean;
  shouldGuardNavigation?: boolean;
}) {
  const router = useRouter();
  const onNavigateAwayRef = useRef(onNavigateAway);
  const hasHistoryGuardRef = useRef(false);
  const pendingNavigationRef = useRef<PendingNavigation | null>(null);
  const pendingRouteContinuationRef = useRef<(() => void) | null>(null);
  const restoreSyntheticEntryRef = useRef(false);
  const allowHistoryTraversalRef = useRef(false);
  const [isConfirmationOpen, setConfirmationOpen] = useState(false);
  const rootHref = mentorRootHrefByLabel[activeLabel] ?? "/mentor/dashboard";
  const isRootPage = breadcrumbLabel === activeLabel;

  useEffect(() => {
    onNavigateAwayRef.current = onNavigateAway;
  }, [onNavigateAway]);

  function requestConfirmation(nextNavigation: PendingNavigation) {
    if (pendingNavigationRef.current) return;

    pendingNavigationRef.current = nextNavigation;
    setConfirmationOpen(true);
  }

  function dismissConfirmation() {
    pendingNavigationRef.current = null;
    setConfirmationOpen(false);
  }

  function confirmPendingNavigation() {
    const request = pendingNavigationRef.current;
    dismissConfirmation();
    if (!request) return;

    if (request.kind === "history") {
      hasHistoryGuardRef.current = false;
      allowHistoryTraversalRef.current = true;
      // We are back on the synthetic entry. Skip both duplicate entries
      // to complete the originally requested browser Back in one action.
      window.history.go(-2);
      return;
    }

    consumeSyntheticEntry(() => router.push(request.destination));
  }

  function consumeSyntheticEntry(continueNavigation: () => void) {
    if (!hasHistoryGuardRef.current) {
      continueNavigation();
      return;
    }

    pendingRouteContinuationRef.current = continueNavigation;
    window.history.back();
  }

  useEffect(() => {
    function handleWorkspaceNavigation(event: MouseEvent) {
      if (
        event.defaultPrevented ||
        event.button !== 0 ||
        event.metaKey ||
        event.ctrlKey ||
        event.shiftKey ||
        event.altKey
      ) {
        return;
      }

      const link = (event.target as Element | null)?.closest<HTMLAnchorElement>(
        "a[href]",
      );
      if (
        !link ||
        link.getAttribute("target") === "_blank" ||
        link.hasAttribute("download")
      ) {
        return;
      }

      const destination = new URL(link.href, window.location.href);
      const current = new URL(window.location.href);

      if (
        destination.origin !== current.origin ||
        (destination.pathname === current.pathname &&
          destination.search === current.search)
      ) {
        return;
      }

      const navigate = () => {
        router.push(
          destination.pathname + destination.search + destination.hash,
        );
      };
      const canLeave = onNavigateAwayRef.current?.() ?? true;

      if (!canLeave) {
        event.preventDefault();
        event.stopPropagation();
        requestConfirmation({
          destination: destination.pathname + destination.search + destination.hash,
          kind: "route",
        });
        return;
      }

      if (hasHistoryGuardRef.current) {
        event.preventDefault();
        event.stopPropagation();
        consumeSyntheticEntry(navigate);
      }
    }

    document.addEventListener("click", handleWorkspaceNavigation, true);
    return () =>
      document.removeEventListener("click", handleWorkspaceNavigation, true);
  }, [router]);

  useEffect(() => {
    if (!shouldGuardNavigation) {
      if (hasHistoryGuardRef.current) {
        hasHistoryGuardRef.current = false;
        window.history.back();
      }

      return;
    }

    // App Router does not expose a cancellable history hook. Keep a same-URL
    // entry in front of the current route, so a Back attempt can be confirmed
    // without allowing the visible route to get ahead of the mounted editor.
    window.history.pushState(window.history.state, "", window.location.href);
    hasHistoryGuardRef.current = true;

    function handleHistoryTraversal() {
      const pendingRouteContinuation = pendingRouteContinuationRef.current;
      if (pendingRouteContinuation) {
        pendingRouteContinuationRef.current = null;
        hasHistoryGuardRef.current = false;
        pendingRouteContinuation();
        return;
      }

      if (restoreSyntheticEntryRef.current) {
        restoreSyntheticEntryRef.current = false;
        requestConfirmation({ kind: "history" });
        return;
      }

      if (allowHistoryTraversalRef.current) {
        allowHistoryTraversalRef.current = false;
        return;
      }

      const canLeave = onNavigateAwayRef.current?.() ?? true;

      if (canLeave) {
        hasHistoryGuardRef.current = false;
        allowHistoryTraversalRef.current = true;
        window.history.back();
        return;
      }

      // Return to the same-URL synthetic entry before opening the dialog.
      // Cancelling then leaves both the route and its history position intact.
      restoreSyntheticEntryRef.current = true;
      window.history.forward();
    }

    window.addEventListener("popstate", handleHistoryTraversal);
    return () => window.removeEventListener("popstate", handleHistoryTraversal);
  }, [router, shouldGuardNavigation]);

  return (
    <>
      <SidebarProvider
        className={sidebarAppearance === "reference" ? "lg:gap-2 lg:p-6" : undefined}
      >
        <div
          className={cn(
            "flex min-h-svh w-full bg-[#f7faf8] text-secondary-900",
            sidebarAppearance === "reference" && "lg:gap-2",
            sidebarAppearance === "reference" && "bg-secondary-50",
          )}
        >
          <MentorSidebar activeLabel={activeLabel} appearance={sidebarAppearance} />

          <SidebarInset
            className={cn(
              "min-w-0 bg-transparent",
              sidebarAppearance === "reference" && "lg:rounded-3xl",
            )}
          >
            <header
              className={cn(
                "sticky top-0 z-20 border-b border-primary-100/80 bg-[#f7faf8]/90 backdrop-blur-xl",
                sidebarAppearance === "reference" &&
                  "bg-secondary-50/90 lg:rounded-3xl lg:border",
              )}
            >
              <div className="flex min-h-16 items-center gap-3 px-4 md:px-6 lg:px-8">
                <SidebarTrigger
                  className={cn(
                    "shrink-0",
                    sidebarAppearance === "reference" && "lg:hidden",
                  )}
                />

                {showBreadcrumb ? (
                  <div className="hidden min-w-0 flex-1 md:block">
                    <Breadcrumb>
                      <BreadcrumbList>
                        <BreadcrumbItem>
                          <BreadcrumbLink
                            href={rootHref}
                            className="text-secondary-500"
                          >
                            {activeLabel}
                          </BreadcrumbLink>
                        </BreadcrumbItem>
                        {breadcrumbParent ? (
                          <>
                            <BreadcrumbSeparator />
                            <BreadcrumbItem>
                              <BreadcrumbLink
                                href={breadcrumbParent.href}
                                className="text-secondary-500"
                              >
                                {breadcrumbParent.label}
                              </BreadcrumbLink>
                            </BreadcrumbItem>
                          </>
                        ) : null}
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
                ) : null}

                {showSearch ? (
                  <div className="relative ml-auto hidden w-full max-w-sm md:block">
                    <Search className="pointer-events-none absolute top-1/2 left-3 -translate-y-1/2 text-secondary-400" />
                    <Input
                      aria-label={searchPlaceholder}
                      className="h-10 rounded-full border-primary-100 bg-white pl-10 shadow-sm"
                      placeholder={searchPlaceholder}
                    />
                  </div>
                ) : <div className="ml-auto" />}

                <StudentAccountMenu audience="tutor" session={session} />
              </div>
            </header>

            <ScrollArea className="h-[calc(100svh-4rem)]">
              <ContentElement
                className={cn(
                  "mx-auto flex w-full max-w-[1420px] flex-col gap-7 px-4 py-8 md:px-8 lg:px-10 lg:py-10",
                  mainClassName,
                )}
              >
                {children}
              </ContentElement>
            </ScrollArea>
          </SidebarInset>
        </div>
      </SidebarProvider>

      <MentorNavigationConfirmDialog
        onCancel={dismissConfirmation}
        onConfirm={confirmPendingNavigation}
        onOpenChange={(isOpen) => {
          if (!isOpen) {
            dismissConfirmation();
          }
        }}
        open={isConfirmationOpen}
      />
    </>
  );
}

export { MentorWorkspaceShell };
