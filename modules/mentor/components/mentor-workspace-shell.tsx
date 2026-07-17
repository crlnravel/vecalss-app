"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { AlertTriangle, LogOut, Search } from "lucide-react";
import { useEffect, useRef, useState, type ReactNode } from "react";

import { Avatar, AvatarFallback } from "@/components/ui/avatar";
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
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  SidebarInset,
  SidebarProvider,
  SidebarTrigger,
} from "@/components/ui/sidebar";
import type { SessionContext } from "@/lib/auth/types";
import { cn } from "@/lib/utils";
import { logoutAction } from "@/modules/auth/actions";
import {
  MentorSidebar,
  getInitials,
} from "@/modules/mentor/components/mentor-sidebar";

type PendingNavigation = {
  continueNavigation: () => void;
};

function KaptenAccountMenu({ session }: { session: SessionContext }) {
  const initials = getInitials(session.user.fullName);
  const [isLogoutDialogOpen, setIsLogoutDialogOpen] = useState(false);

  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger
          render={
            <Button
              aria-label="Buka menu Kapten"
              className="rounded-full p-1"
              size="icon-sm"
              type="button"
              variant="ghost"
            />
          }
        >
          <Avatar className="size-9 border border-primary-100">
            <AvatarFallback className="bg-primary-700 text-xs font-semibold text-white">
              {initials}
            </AvatarFallback>
          </Avatar>
        </DropdownMenuTrigger>

        <DropdownMenuContent align="end" className="w-64">
          <DropdownMenuLabel>
            <span className="block text-sm font-semibold text-secondary-900">
              {session.user.fullName}
            </span>
            <span className="block truncate text-xs">{session.user.email}</span>
          </DropdownMenuLabel>
          <DropdownMenuSeparator />
          <DropdownMenuGroup>
            <DropdownMenuItem render={<Link href="/mentor/dashboard" />}>
              Dashboard
            </DropdownMenuItem>
            <DropdownMenuItem render={<Link href="/mentor/materi" />}>
              Materi
            </DropdownMenuItem>
            <DropdownMenuItem render={<Link href="/mentor/quiz" />}>
              Quiz
            </DropdownMenuItem>
            <DropdownMenuItem render={<Link href="/mentor/settings" />}>
              Pengaturan
            </DropdownMenuItem>
            <DropdownMenuItem onClick={() => setIsLogoutDialogOpen(true)}>
              Keluar
            </DropdownMenuItem>
          </DropdownMenuGroup>
        </DropdownMenuContent>
      </DropdownMenu>

      <Dialog onOpenChange={setIsLogoutDialogOpen} open={isLogoutDialogOpen}>
        <DialogContent className="max-w-[calc(100%-2rem)] gap-0 overflow-hidden rounded-4xl bg-white p-0 sm:max-w-[440px]">
          <div className="flex items-start gap-3 px-5 py-5 md:px-6 md:py-6">
            <div className="flex size-12 shrink-0 items-center justify-center rounded-full bg-primary-50 text-primary-700">
              <AlertTriangle className="size-6" />
            </div>
            <div className="min-w-0">
              <DialogTitle className="text-xl font-semibold text-secondary-900">
                Keluar dari akun?
              </DialogTitle>
              <DialogDescription className="mt-2 text-sm leading-6 text-secondary-500">
                Kamu perlu masuk kembali untuk melanjutkan mengelola konten di
                dashboard.
              </DialogDescription>
            </div>
          </div>

          <DialogFooter className="flex-row justify-end border-t border-primary-100 bg-secondary-50/60 px-5 py-4 md:px-6">
            <DialogClose
              render={
                <Button type="button" variant="ghost">
                  Batal
                </Button>
              }
            />
            <form action={logoutAction}>
              <input name="audience" type="hidden" value="tutor" />
              <Button
                className="border-red-700 bg-red-700 text-white hover:bg-red-800 focus-visible:border-red-700 focus-visible:ring-red-700/25"
                type="submit"
                variant="destructive"
              >
                Ya, keluar
              </Button>
            </form>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}

function MentorWorkspaceShell({
  activeLabel,
  breadcrumbLabel,
  children,
  mainClassName,
  onNavigateAway,
  searchPlaceholder = "Cari konten, quiz, tryout, atau asset...",
  session,
  shouldGuardNavigation = false,
}: {
  activeLabel: string;
  breadcrumbLabel: string;
  children: ReactNode;
  mainClassName?: string;
  onNavigateAway?: () => boolean;
  searchPlaceholder?: string;
  session: SessionContext;
  shouldGuardNavigation?: boolean;
}) {
  const router = useRouter();
  const onNavigateAwayRef = useRef(onNavigateAway);
  const hasHistoryGuardRef = useRef(false);
  const pendingRouteContinuationRef = useRef<(() => void) | null>(null);
  const restoreSyntheticEntryRef = useRef(false);
  const allowHistoryTraversalRef = useRef(false);
  const [pendingNavigation, setPendingNavigation] =
    useState<PendingNavigation | null>(null);

  useEffect(() => {
    onNavigateAwayRef.current = onNavigateAway;
  }, [onNavigateAway]);

  function requestConfirmation(continueNavigation: () => void) {
    setPendingNavigation((current) => current ?? { continueNavigation });
  }

  function dismissConfirmation() {
    setPendingNavigation(null);
  }

  function confirmPendingNavigation() {
    const request = pendingNavigation;
    dismissConfirmation();
    request?.continueNavigation();
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
        requestConfirmation(() => consumeSyntheticEntry(navigate));
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
        requestConfirmation(() => {
          hasHistoryGuardRef.current = false;
          allowHistoryTraversalRef.current = true;
          // We are back on the synthetic entry. Skip both duplicate entries
          // to complete the originally requested browser Back in one action.
          window.history.go(-2);
        });
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
      <SidebarProvider>
        <div className="flex min-h-svh w-full bg-[#f7faf8] text-secondary-900">
          <MentorSidebar
            activeLabel={activeLabel}
            footerLabel="CMS Kapten"
            fullName={session.user.fullName}
          />

          <SidebarInset className="bg-transparent">
            <header className="sticky top-0 z-20 border-b border-primary-100/80 bg-[#f7faf8]/90 backdrop-blur-xl">
              <div className="flex min-h-16 items-center gap-3 px-4 md:px-6 lg:px-8">
                <SidebarTrigger className="shrink-0" />

                <div className="hidden min-w-0 flex-1 md:block">
                  <Breadcrumb>
                    <BreadcrumbList>
                      <BreadcrumbItem>
                        <BreadcrumbLink
                          href="/mentor/dashboard"
                          className="text-secondary-500"
                        >
                          Vecalss CMS
                        </BreadcrumbLink>
                      </BreadcrumbItem>
                      <BreadcrumbSeparator />
                      <BreadcrumbItem>
                        <BreadcrumbPage>{breadcrumbLabel}</BreadcrumbPage>
                      </BreadcrumbItem>
                    </BreadcrumbList>
                  </Breadcrumb>
                </div>

                <div className="relative ml-auto hidden w-full max-w-sm md:block">
                  <Search className="pointer-events-none absolute top-1/2 left-3 -translate-y-1/2 text-secondary-400" />
                  <Input
                    aria-label={searchPlaceholder}
                    className="h-10 rounded-full border-primary-100 bg-white pl-10 shadow-sm"
                    placeholder={searchPlaceholder}
                  />
                </div>

                <KaptenAccountMenu session={session} />
              </div>
            </header>

            <ScrollArea className="h-[calc(100svh-4rem)]">
              <main
                className={cn(
                  "mx-auto flex w-full max-w-[1420px] flex-col gap-7 px-4 py-8 md:px-8 lg:px-10 lg:py-10",
                  mainClassName,
                )}
              >
                {children}
              </main>
            </ScrollArea>
          </SidebarInset>
        </div>
      </SidebarProvider>

      <Dialog
        onOpenChange={(isOpen) => {
          if (!isOpen) {
            dismissConfirmation();
          }
        }}
        open={Boolean(pendingNavigation)}
      >
        <DialogContent
          className="gap-5 border-red-100 bg-white p-6 sm:max-w-lg"
          showCloseButton={false}
        >
          <div>
            <DialogTitle className="font-semibold text-secondary-900">
              Keluar dari editor?
            </DialogTitle>
            <DialogDescription className="mt-2 text-sm leading-6 text-secondary-500">
              Perubahan yang belum disimpan akan hilang jika Anda meninggalkan
              halaman ini.
            </DialogDescription>
          </div>
          <DialogFooter>
            <Button
              onClick={dismissConfirmation}
              type="button"
              variant="brandOutline"
            >
              Batal
            </Button>
            <Button
              className="border-red-700 bg-red-700 text-white hover:bg-red-800 focus-visible:border-red-700 focus-visible:ring-red-700/25"
              onClick={confirmPendingNavigation}
              type="button"
              variant="destructive"
            >
              Keluar tanpa menyimpan
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}

export { MentorWorkspaceShell };
