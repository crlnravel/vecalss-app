"use client";

import Link from "next/link";
import { useState } from "react";
import { useFormStatus } from "react-dom";
import {
  AlertTriangle,
  Bell,
  LayoutDashboard,
  LoaderCircle,
  LogOut,
  Settings,
  UserRound,
  Users,
} from "@/lib/icons";

import { useDebugAccountSwitcher } from "@/components/debug-account-switcher-provider";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogMedia,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import type { SessionContext } from "@/lib/auth/types";
import { logoutAction } from "@/modules/auth/actions";
import { getInitials } from "@/modules/student/components/student-sidebar-utils";

type StudentAccountMenuItem = "notifications";
type AccountMenuAudience = "admin" | "student" | "tutor";
type DebugAccount = {
  email: string;
  fullName: string;
  id: string;
  mustChangePassword: boolean;
  onboardingStatus: string | null;
  roles: string[];
};

type DebugAccountsResponse = {
  accounts?: DebugAccount[];
  error?: string;
};

type DebugSwitchAccountResponse = {
  destination?: string;
  error?: string;
};

const debugRoleLabels: Record<string, string> = {
  admin: "Admin",
  student: "Siswa",
  tutor: "Kapten",
};

const studentAccountMenuItemClassName =
  "hover:bg-primary-50 focus:bg-primary-50 data-highlighted:bg-primary-50";

function LogoutDialogFooter() {
  const { pending } = useFormStatus();

  return (
    <AlertDialogFooter>
      <AlertDialogCancel disabled={pending} type="button">Batal</AlertDialogCancel>
      <AlertDialogAction disabled={pending} type="submit" variant="destructive">
        {pending ? "Keluar…" : "Ya, keluar"}
      </AlertDialogAction>
    </AlertDialogFooter>
  );
}

function AccountRoleLabels({ roles }: { roles: string[] }) {
  return (
    <span className="flex flex-wrap gap-1.5">
      {roles.map((role) => (
        <span
          className="rounded-full bg-primary-50 px-2 py-1 text-ui-xs font-semibold text-primary-800"
          key={role}
        >
          {debugRoleLabels[role] ?? role}
        </span>
      ))}
    </span>
  );
}

function StudentAccountMenu({
  audience = "student",
  disableDebugAccountSwitcher = false,
  extraItem,
  session,
}: {
  audience?: AccountMenuAudience;
  disableDebugAccountSwitcher?: boolean;
  extraItem?: StudentAccountMenuItem;
  session: SessionContext;
}) {
  const initials = getInitials(session.user.fullName);
  const debugAccountSwitcherAvailable = useDebugAccountSwitcher();
  const debugAccountSwitcherEnabled = !disableDebugAccountSwitcher && debugAccountSwitcherAvailable;
  const [isLogoutDialogOpen, setIsLogoutDialogOpen] = useState(false);
  const [isDebugSwitcherOpen, setIsDebugSwitcherOpen] = useState(false);
  const [debugAccounts, setDebugAccounts] = useState<DebugAccount[] | null>(null);
  const [debugAccountsError, setDebugAccountsError] = useState<string | null>(null);
  const [isLoadingDebugAccounts, setIsLoadingDebugAccounts] = useState(false);
  const [switchingAccountId, setSwitchingAccountId] = useState<string | null>(null);
  const isTutor = audience === "tutor";
  const isAdmin = audience === "admin";
  const profileHref = isTutor ? "/mentor/settings#akun" : "/settings#profil";
  const settingsHref = "/mentor/settings";

  async function loadDebugAccounts() {
    if (debugAccounts || isLoadingDebugAccounts) {
      return;
    }

    setIsLoadingDebugAccounts(true);
    setDebugAccountsError(null);

    try {
      const response = await fetch("/api/debug/accounts", {
        cache: "no-store",
        headers: { Accept: "application/json" },
      });
      const payload = (await response.json()) as DebugAccountsResponse;

      if (!response.ok || !Array.isArray(payload.accounts)) {
        throw new Error(payload.error ?? "Daftar akun debug belum dapat dimuat.");
      }

      setDebugAccounts(payload.accounts);
    } catch (error) {
      setDebugAccountsError(
        error instanceof Error
          ? error.message
          : "Daftar akun debug belum dapat dimuat.",
      );
    } finally {
      setIsLoadingDebugAccounts(false);
    }
  }

  function openDebugSwitcher() {
    setDebugAccountsError(null);
    setIsDebugSwitcherOpen(true);
    void loadDebugAccounts();
  }

  async function switchAccount(userId: string) {
    setSwitchingAccountId(userId);
    setDebugAccountsError(null);

    try {
      const response = await fetch("/api/debug/switch-account", {
        body: JSON.stringify({ userId }),
        cache: "no-store",
        headers: {
          Accept: "application/json",
          "Content-Type": "application/json",
        },
        method: "POST",
      });
      const payload = (await response.json()) as DebugSwitchAccountResponse;

      if (!response.ok || !payload.destination) {
        throw new Error(payload.error ?? "Akun belum dapat diganti.");
      }

      window.location.assign(payload.destination);
    } catch (error) {
      setDebugAccountsError(
        error instanceof Error ? error.message : "Akun belum dapat diganti.",
      );
      setSwitchingAccountId(null);
    }
  }

  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger
          render={
            <Button
              aria-label={isAdmin ? "Buka menu admin" : isTutor ? "Buka menu Kapten" : "Buka menu pengguna"}
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
            {isAdmin ? (
              <DropdownMenuItem
                className={studentAccountMenuItemClassName}
                render={<Link href="/admin" />}
              >
                <LayoutDashboard />
                Dashboard
              </DropdownMenuItem>
            ) : (
              <DropdownMenuItem
                className={studentAccountMenuItemClassName}
                render={<Link href={profileHref} />}
              >
                <UserRound />
                Profil
              </DropdownMenuItem>
            )}
            {isTutor ? (
              <DropdownMenuItem
                className={studentAccountMenuItemClassName}
                render={<Link href={settingsHref} />}
              >
                <Settings />
                Pengaturan
              </DropdownMenuItem>
            ) : null}
            {extraItem === "notifications" ? (
              <DropdownMenuItem
                className={studentAccountMenuItemClassName}
                render={<Link href="/notifications" />}
              >
                <Bell />
                Notifikasi
              </DropdownMenuItem>
            ) : null}
          </DropdownMenuGroup>
          {debugAccountSwitcherEnabled ? (
            <>
              <DropdownMenuSeparator />
              <DropdownMenuItem
                className={studentAccountMenuItemClassName}
                onClick={openDebugSwitcher}
              >
                <Users />
                Ganti akun (debug)
              </DropdownMenuItem>
            </>
          ) : null}
          <DropdownMenuItem
            className={studentAccountMenuItemClassName}
            onClick={() => setIsLogoutDialogOpen(true)}
          >
            <LogOut />
            Keluar
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>

      {debugAccountSwitcherEnabled ? (
        <Dialog
          onOpenChange={(open) => {
            if (switchingAccountId === null) {
              setIsDebugSwitcherOpen(open);
            }
          }}
          open={isDebugSwitcherOpen}
        >
          <DialogContent
            className="max-w-lg"
            pending={switchingAccountId !== null}
            showCloseButton={false}
            variant="info"
          >
            <DialogHeader>
              <DialogTitle>Ganti akun untuk development</DialogTitle>
              <DialogDescription>
                Pilih akun aktif untuk menguji tampilan dan izin tiap role. Fitur ini hanya tersedia saat NODE_ENV=development dan DEBUG=true.
              </DialogDescription>
            </DialogHeader>

            <div aria-live="polite" className="min-h-24">
              {isLoadingDebugAccounts ? (
                <div className="flex min-h-24 items-center justify-center gap-2 text-sm text-secondary-600">
                  <LoaderCircle className="animate-spin" />
                  Memuat akun…
                </div>
              ) : debugAccountsError ? (
                <p
                  className="rounded-2xl border border-student-status-danger-border bg-student-status-danger-bg px-4 py-3 text-sm leading-6 text-student-status-danger-fg"
                  role="alert"
                >
                  {debugAccountsError}
                </p>
              ) : debugAccounts?.length ? (
                <div className="grid max-h-[min(28rem,calc(100svh-18rem))] gap-2 overflow-y-auto pr-1">
                  {debugAccounts.map((account) => {
                    const isCurrentAccount = account.id === session.user.id;
                    const isSwitching = switchingAccountId === account.id;

                    return (
                      <Button
                        className="h-auto min-h-16 w-full items-start justify-between gap-3 rounded-2xl px-3 py-3 text-left"
                        disabled={switchingAccountId !== null || isCurrentAccount}
                        key={account.id}
                        onClick={() => void switchAccount(account.id)}
                        type="button"
                        variant={isCurrentAccount ? "contextSelected" : "context"}
                      >
                        <span className="min-w-0">
                          <span className="block truncate font-semibold">{account.fullName}</span>
                          <span className="mt-0.5 block truncate text-xs font-normal text-secondary-500">
                            {account.email}
                          </span>
                          <span className="mt-2 block">
                            <AccountRoleLabels roles={account.roles} />
                          </span>
                        </span>
                        <span className="shrink-0 pt-0.5 text-xs font-semibold text-secondary-500">
                          {isSwitching ? "Memproses…" : isCurrentAccount ? "Aktif" : "Pilih"}
                        </span>
                      </Button>
                    );
                  })}
                </div>
              ) : (
                <p className="rounded-2xl border border-primary-100 bg-primary-50/60 px-4 py-3 text-sm leading-6 text-secondary-600">
                  Belum ada akun aktif yang bisa dipilih.
                </p>
              )}
            </div>

            <DialogFooter>
              <DialogClose
                disabled={switchingAccountId !== null}
                render={<Button type="button" variant="brandOutline" />}
              >
                Tutup
              </DialogClose>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      ) : null}

      <AlertDialog onOpenChange={setIsLogoutDialogOpen} open={isLogoutDialogOpen}>
        <AlertDialogContent variant="warning">
          <AlertDialogHeader>
            <AlertDialogMedia variant="warning"><AlertTriangle /></AlertDialogMedia>
            <AlertDialogTitle>Keluar dari akun?</AlertDialogTitle>
            <AlertDialogDescription>
              Kamu perlu masuk kembali untuk melanjutkan {isAdmin ? "mengelola operasional" : isTutor ? "mengelola konten" : "belajar"} di dashboard.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <form action={logoutAction}>
            <input name="audience" type="hidden" value={audience} />
            <LogoutDialogFooter />
          </form>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}

export { StudentAccountMenu };
export type { AccountMenuAudience, StudentAccountMenuItem };
