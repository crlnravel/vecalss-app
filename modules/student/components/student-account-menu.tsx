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
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
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
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import type { SessionContext } from "@/lib/auth/types";
import { logoutAction } from "@/modules/auth/actions";
import { getInitials } from "@/modules/student/components/student-sidebar-utils";

type StudentAccountMenuItem = "notifications";
type AccountMenuAudience = "admin" | "student" | "tutor" | "affiliator" | "developer";
type AccountMenuUser = Pick<SessionContext["user"], "id" | "email" | "fullName">;
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
  affiliator: "Affiliator",
  admin: "Admin",
  developer: "Developer",
  student: "Siswa",
  tutor: "Kapten",
};

const studentAccountMenuItemClassName =
  "hover:bg-primary-50 focus:bg-primary-50 data-highlighted:bg-primary-50";
const navbarAvatarTriggerClassName =
	"rounded-control border-0 bg-transparent shadow-none transition-none hover:border-0 hover:bg-transparent hover:shadow-none focus-visible:border-transparent data-active:border-0 data-active:bg-transparent data-active:shadow-none motion-safe:active:shadow-none";

function LogoutDialogFooter() {
  const { pending } = useFormStatus();

  return (
    <AlertDialogFooter>
      <AlertDialogCancel disabled={pending} type="button">Batal</AlertDialogCancel>
      <AlertDialogAction disabled={pending} type="submit" variant="destructive">
        {pending ? "Keluar dari akun…" : "Keluar dari akun"}
      </AlertDialogAction>
    </AlertDialogFooter>
  );
}

function DebugAccountOptionContent({ account, isCurrent }: { account: DebugAccount; isCurrent: boolean }) {
  return <div className="flex min-w-0 flex-col gap-0.5 text-left"><div className="flex items-center gap-2"><span className="truncate font-semibold text-secondary-900">{account.fullName}</span>{isCurrent ? <Badge size="xs" tone="success">Aktif</Badge> : null}</div><div className="flex items-center gap-1.5 text-xs text-secondary-500"><span className="truncate">{account.email}</span><span>•</span><span className="font-medium text-secondary-700">{account.roles.map((role) => debugRoleLabels[role] ?? role).join(", ")}</span></div></div>;
}

function DebugAccountSelection({ debugAccounts, debugAccountsError, isLoadingDebugAccounts, selectedAccount, selectedAccountId, sessionUserId, setSelectedAccountId, switchingAccountId }: { debugAccounts: DebugAccount[] | null; debugAccountsError: string | null; isLoadingDebugAccounts: boolean; selectedAccount: DebugAccount | null; selectedAccountId: string; sessionUserId: string; setSelectedAccountId: (id: string) => void; switchingAccountId: string | null }) {
  if (isLoadingDebugAccounts) return <div className="flex min-h-24 items-center justify-center gap-2 text-sm text-secondary-600"><LoaderCircle className="animate-spin motion-reduce:animate-none" />Memuat daftar akun…</div>;
  if (debugAccountsError) return <p className="rounded-card border border-student-status-danger-border bg-student-status-danger-bg px-4 py-3 text-sm leading-6 text-student-status-danger-fg" role="alert">{debugAccountsError}</p>;
  if (!debugAccounts?.length) return <p className="rounded-card border border-primary-100 bg-primary-50/60 px-4 py-3 text-sm leading-6 text-secondary-600">Belum ada akun yang bisa dipilih.</p>;
  return <DropdownMenu><DropdownMenuTrigger aria-label="Pilih akun" disabled={switchingAccountId !== null} id="debug-account-select" render={<Button className="w-full justify-between gap-3 text-left" size="lg" variant="outline" />}>{selectedAccount ? <DebugAccountOptionContent account={selectedAccount} isCurrent={selectedAccount.id === sessionUserId} /> : <span className="text-secondary-500">Pilih akun…</span>}<ChevronDown aria-hidden="true" className="size-4 shrink-0" /></DropdownMenuTrigger><DropdownMenuContent align="start" className="w-(--anchor-width) min-w-[280px] p-1.5"><DropdownMenuRadioGroup onValueChange={setSelectedAccountId} value={selectedAccountId}>{debugAccounts.map((account) => <DropdownMenuRadioItem className="flex cursor-pointer items-center justify-between gap-3 rounded-control py-2.5 pr-8 pl-3" closeOnClick key={account.id} value={account.id}><DebugAccountOptionContent account={account} isCurrent={account.id === sessionUserId} /></DropdownMenuRadioItem>)}</DropdownMenuRadioGroup></DropdownMenuContent></DropdownMenu>;
}

function DebugAccountSwitchButton({ debugAccounts, debugAccountsError, isLoadingDebugAccounts, selectedAccountId, sessionUserId, switchAccount, switchingAccountId }: { debugAccounts: DebugAccount[] | null; debugAccountsError: string | null; isLoadingDebugAccounts: boolean; selectedAccountId: string; sessionUserId: string; switchAccount: (id: string) => Promise<void>; switchingAccountId: string | null }) {
  const disabled = !selectedAccountId || selectedAccountId === sessionUserId || switchingAccountId !== null || isLoadingDebugAccounts || Boolean(debugAccountsError) || !debugAccounts?.length;
  return <Button className="w-full sm:w-auto" disabled={disabled} onClick={() => { if (!disabled) void switchAccount(selectedAccountId); }} type="button" variant="default">{switchingAccountId !== null ? <><LoaderCircle className="animate-spin motion-reduce:animate-none" />Mengganti akun…</> : "Ganti akun"}</Button>;
}

function DebugAccountSwitcherDialog({
  debugAccounts,
  debugAccountsError,
  isDebugSwitcherOpen,
  isLoadingDebugAccounts,
  selectedAccount,
  selectedAccountId,
  sessionUserId,
  setIsDebugSwitcherOpen,
  setSelectedAccountId,
  switchAccount,
  switchingAccountId,
}: {
  debugAccounts: DebugAccount[] | null;
  debugAccountsError: string | null;
  isDebugSwitcherOpen: boolean;
  isLoadingDebugAccounts: boolean;
  selectedAccount: DebugAccount | null;
  selectedAccountId: string;
  sessionUserId: string;
  setIsDebugSwitcherOpen: (open: boolean) => void;
  setSelectedAccountId: (id: string) => void;
  switchAccount: (id: string) => Promise<void>;
  switchingAccountId: string | null;
}) {
  return (
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
          <DialogTitle>Ganti akun</DialogTitle>
        </DialogHeader>

        <div aria-live="polite" className="min-h-24"><DebugAccountSelection debugAccounts={debugAccounts} debugAccountsError={debugAccountsError} isLoadingDebugAccounts={isLoadingDebugAccounts} selectedAccount={selectedAccount} selectedAccountId={selectedAccountId} sessionUserId={sessionUserId} setSelectedAccountId={setSelectedAccountId} switchingAccountId={switchingAccountId} /></div>

        <DialogFooter>
          <DebugAccountSwitchButton debugAccounts={debugAccounts} debugAccountsError={debugAccountsError} isLoadingDebugAccounts={isLoadingDebugAccounts} selectedAccountId={selectedAccountId} sessionUserId={sessionUserId} switchAccount={switchAccount} switchingAccountId={switchingAccountId} />
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function AccountLogoutDialog({
  audience,
  isLogoutDialogOpen,
  setIsLogoutDialogOpen,
}: {
  audience: AccountMenuAudience;
  isLogoutDialogOpen: boolean;
  setIsLogoutDialogOpen: (open: boolean) => void;
}) {
  return (
    <AlertDialog onOpenChange={setIsLogoutDialogOpen} open={isLogoutDialogOpen}>
      <AlertDialogContent variant="warning">
        <AlertDialogHeader>
          <AlertDialogMedia variant="warning"><AlertTriangle /></AlertDialogMedia>
          <AlertDialogTitle>Keluar dari akun?</AlertDialogTitle>
          <AlertDialogDescription>
            Kamu perlu masuk kembali untuk melanjutkan.
          </AlertDialogDescription>
        </AlertDialogHeader>
        <form action={logoutAction}>
          <input name="audience" type="hidden" value={audience} />
          <LogoutDialogFooter />
        </form>
      </AlertDialogContent>
    </AlertDialog>
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
  session: { user: AccountMenuUser };
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
  const isAffiliator = audience === "affiliator";
  const isDeveloper = audience === "developer";
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
        throw new Error("Daftar akun belum dapat dimuat.");
      }

      setDebugAccounts(payload.accounts);
      const currentInList = payload.accounts.find((a) => a.id === session.user.id);
      setSelectedAccountId(currentInList ? currentInList.id : (payload.accounts[0]?.id ?? ""));
    } catch {
      setDebugAccountsError(
        "Daftar akun belum dapat dimuat. Coba lagi.",
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
        throw new Error("Akun belum dapat diganti.");
      }

      window.location.assign(payload.destination);
    } catch {
      setDebugAccountsError(
        "Akun belum dapat diganti. Coba lagi.",
      );
      setSwitchingAccountId(null);
    }
  }

  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger
          aria-label="Menu akun"
          render={
            <Button
              className={navbarAvatarTriggerClassName}
              size="icon"
              variant="outline"
            />
          }
        >
          <Avatar size="lg">
            <AvatarFallback>{initials}</AvatarFallback>
          </Avatar>
        </DropdownMenuTrigger>
        <DropdownMenuContent
          align="end"
          className="w-56"
          sideOffset={8}
        >
          <div className="flex flex-col gap-1 px-2 py-1.5">
            <span className="truncate text-sm font-semibold text-secondary-900">
              {session.user.fullName}
            </span>
            <span className="truncate text-xs text-secondary-500">
              {session.user.email}
            </span>
          </div>
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
            ) : null}
            {isAffiliator ? (
              <DropdownMenuItem
                className={studentAccountMenuItemClassName}
                render={<Link href="/affiliator/dashboard" />}
              >
                <LayoutDashboard />
                Dashboard
              </DropdownMenuItem>
            ) : null}
            {!isAdmin && !isTutor && !isAffiliator && !isDeveloper ? (
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
                Ganti akun
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
        <DebugAccountSwitcherDialog
          debugAccounts={debugAccounts}
          debugAccountsError={debugAccountsError}
          isDebugSwitcherOpen={isDebugSwitcherOpen}
          isLoadingDebugAccounts={isLoadingDebugAccounts}
          selectedAccount={selectedAccount}
          selectedAccountId={selectedAccountId}
          sessionUserId={session.user.id}
          setIsDebugSwitcherOpen={setIsDebugSwitcherOpen}
          setSelectedAccountId={setSelectedAccountId}
          switchAccount={switchAccount}
          switchingAccountId={switchingAccountId}
        />
      ) : null}

      <AccountLogoutDialog
        audience={audience}
        isLogoutDialogOpen={isLogoutDialogOpen}
        setIsLogoutDialogOpen={setIsLogoutDialogOpen}
      />
    </>
  );
}

export { StudentAccountMenu };
export type { AccountMenuAudience, AccountMenuUser, StudentAccountMenuItem };
