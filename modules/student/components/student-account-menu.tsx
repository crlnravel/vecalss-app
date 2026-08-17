"use client";

import Link from "next/link";
import { useState } from "react";
import { useFormStatus } from "react-dom";
import { AlertTriangle, Bell, LayoutDashboard, LogOut, Settings, UserRound } from "@/lib/icons";

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
  extraItem,
  session,
}: {
  audience?: AccountMenuAudience;
  extraItem?: StudentAccountMenuItem;
  session: SessionContext;
}) {
  const initials = getInitials(session.user.fullName);
  const [isLogoutDialogOpen, setIsLogoutDialogOpen] = useState(false);
  const isTutor = audience === "tutor";
  const isAdmin = audience === "admin";
  const profileHref = isTutor ? "/mentor/settings#akun" : "/settings#profil";
  const settingsHref = "/mentor/settings";

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
          <DropdownMenuItem
            className={studentAccountMenuItemClassName}
            onClick={() => setIsLogoutDialogOpen(true)}
          >
            <LogOut />
            Keluar
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>

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
