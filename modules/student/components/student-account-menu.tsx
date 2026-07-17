"use client";

import Link from "next/link";
import { useState } from "react";
import { AlertTriangle, Bell, LogOut, Settings, UserRound } from "lucide-react";

import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
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
import { getInitials } from "@/modules/student/components/student-sidebar";

type StudentAccountMenuItem = "notifications";

const studentAccountMenuItemClassName =
  "hover:bg-primary-50 focus:bg-primary-50 data-highlighted:bg-primary-50";

function StudentAccountMenu({
  extraItem,
  session,
}: {
  extraItem?: StudentAccountMenuItem;
  session: SessionContext;
}) {
  const initials = getInitials(session.user.fullName);
  const [isLogoutDialogOpen, setIsLogoutDialogOpen] = useState(false);

  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger
          render={
            <Button
              aria-label="Buka menu pengguna"
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
            <DropdownMenuItem
              className={studentAccountMenuItemClassName}
              render={<Link href="/settings#profil" />}
            >
              <UserRound />
              Profil
            </DropdownMenuItem>
            <DropdownMenuItem
              className={studentAccountMenuItemClassName}
              render={<Link href="/settings" />}
            >
              <Settings />
              Pengaturan
            </DropdownMenuItem>
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
                Kamu perlu masuk kembali untuk melanjutkan belajar di dashboard.
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
              <input name="audience" type="hidden" value="student" />
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

export { StudentAccountMenu };
export type { StudentAccountMenuItem };
