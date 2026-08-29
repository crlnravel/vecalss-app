"use client";

import Link from "next/link";
import { useState } from "react";
import { useFormStatus } from "react-dom";
import {
  AlertTriangle,
  Bell,
  ChevronDown,
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
  DialogContent,
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
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
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
  const [selectedAccountId, setSelectedAccountId] = useState<string>("");
  const [debugAccountsError, setDebugAccountsError] = useState<string | null>(null);
  const [isLoadingDebugAccounts, setIsLoadingDebugAccounts] = useState(false);
  const [switchingAccountId, setSwitchingAccountId] = useState<string | null>(null);
  const isTutor = audience === "tutor";
  const isAdmin = audience === "admin";
  const profileHref = isTutor ? "/mentor/settings#akun" : "/settings#profil";
  const settingsHref = "/mentor/settings";
  const selectedAccount = debugAccounts?.find((account) => account.id === selectedAccountId) ?? null;

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
      const currentInList = payload.accounts.find((a) => a.id === session.user.id);
      setSelectedAccountId(currentInList ? currentInList.id : (payload.accounts[0]?.id ?? ""));
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
    if (debugAccounts) {
      const currentInList = debugAccounts.find((a) => a.id === session.user.id);
      setSelectedAccountId(currentInList ? currentInList.id : (debugAccounts[0]?.id ?? ""));
    } else {
      void loadDebugAccounts();
    }
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
          <DropdownMenuGroup>
            {isAdmin ? (
              <DropdownMenuItem
                className={studentAccountMenuItemClassName}
                render={<Link href="/admin" />}
              >
                <LayoutDashboard />
                Dashboard
              </DropdownMenuItem>
            ) : null}
            {!isAdmin && !isTutor ? (
              <DropdownMenuItem
                className={studentAccountMenuItemClassName}
                render={<Link href={profileHref} />}
              >
                <UserRound />
                Profil
              </DropdownMenuItem>
            ) : null}
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
            className="max-w-md"
            pending={switchingAccountId !== null}
            variant="info"
          >
            <DialogHeader>
              <DialogTitle>Ganti Akun</DialogTitle>
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
                <DropdownMenu>
                  <DropdownMenuTrigger
                    aria-label="Pilih Akun"
                    disabled={switchingAccountId !== null}
                    id="debug-account-select"
                    render={
                      <Button
                        className="h-auto min-h-14 w-full justify-between gap-3 rounded-2xl border-secondary-900/14 bg-white px-4 py-3 text-left text-sm font-normal text-secondary-900 hover:border-primary-300 hover:bg-primary-50/40"
                        variant="context"
                      />
                    }
                  >
                    {selectedAccount ? (
                      <div className="flex min-w-0 flex-1 flex-col items-start gap-0.5 text-left">
                        <div className="flex items-center gap-2">
                          <span className="truncate font-semibold text-secondary-900">
                            {selectedAccount.fullName}
                          </span>
                          {selectedAccount.id === session.user.id ? (
                            <span className="rounded-full bg-primary-50 px-2 py-0.5 text-[10px] font-bold text-primary-700">
                              Aktif
                            </span>
                          ) : null}
                        </div>
                        <div className="flex items-center gap-1.5 text-xs text-secondary-500">
                          <span className="truncate">{selectedAccount.email}</span>
                          <span>•</span>
                          <span className="font-medium text-secondary-700">
                            {selectedAccount.roles
                              .map((r) => debugRoleLabels[r] ?? r)
                              .join(", ")}
                          </span>
                        </div>
                      </div>
                    ) : (
                      <span className="text-secondary-500">Pilih akun…</span>
                    )}
                    <ChevronDown
                      aria-hidden="true"
                      className="size-4 shrink-0 text-secondary-500"
                    />
                  </DropdownMenuTrigger>
                  <DropdownMenuContent
                    align="start"
                    className="w-(--anchor-width) min-w-[280px] p-1.5"
                  >
                    <DropdownMenuRadioGroup
                      onValueChange={(value) => setSelectedAccountId(value)}
                      value={selectedAccountId}
                    >
                      {debugAccounts.map((account) => {
                        const isCurrentAccount = account.id === session.user.id;
                        return (
                          <DropdownMenuRadioItem
                            closeOnClick
                            key={account.id}
                            value={account.id}
                            className="flex items-center justify-between gap-3 py-2.5 pr-8 pl-3 rounded-2xl cursor-pointer"
                          >
                            <div className="flex min-w-0 flex-col gap-0.5 text-left">
                              <div className="flex items-center gap-2">
                                <span className="truncate font-semibold text-secondary-900">
                                  {account.fullName}
                                </span>
                                {isCurrentAccount ? (
                                  <span className="rounded-full bg-primary-50 px-1.5 py-0.5 text-[10px] font-bold text-primary-700">
                                    Aktif
                                  </span>
                                ) : null}
                              </div>
                              <div className="flex items-center gap-1.5 text-xs text-secondary-500">
                                <span className="truncate">{account.email}</span>
                                <span>•</span>
                                <span className="font-medium text-secondary-700">
                                  {account.roles
                                    .map((r) => debugRoleLabels[r] ?? r)
                                    .join(", ")}
                                </span>
                              </div>
                            </div>
                          </DropdownMenuRadioItem>
                        );
                      })}
                    </DropdownMenuRadioGroup>
                  </DropdownMenuContent>
                </DropdownMenu>
              ) : (
                <p className="rounded-2xl border border-primary-100 bg-primary-50/60 px-4 py-3 text-sm leading-6 text-secondary-600">
                  Belum ada akun aktif yang bisa dipilih.
                </p>
              )}
            </div>

            <DialogFooter>
              <Button
                className="w-full sm:w-auto"
                disabled={
                  !selectedAccountId ||
                  selectedAccountId === session.user.id ||
                  switchingAccountId !== null ||
                  isLoadingDebugAccounts ||
                  Boolean(debugAccountsError) ||
                  !debugAccounts?.length
                }
                onClick={() => {
                  if (selectedAccountId && selectedAccountId !== session.user.id) {
                    void switchAccount(selectedAccountId);
                  }
                }}
                type="button"
                variant="brand"
              >
                {switchingAccountId !== null ? (
                  <>
                    <LoaderCircle className="animate-spin" />
                    Memproses…
                  </>
                ) : (
                  "Ganti akun"
                )}
              </Button>
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
