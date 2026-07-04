"use client";

import { Bell, Home, LogOut, Settings, UserRound } from "lucide-react";

import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
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

type StudentAccountMenuItem = "home" | "notifications";

function StudentAccountMenu({
  extraItem = "home",
  session,
}: {
  extraItem?: StudentAccountMenuItem;
  session: SessionContext;
}) {
  const initials = getInitials(session.user.fullName);

  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        render={
          <Button
            aria-label="Open user menu"
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
          <DropdownMenuItem>
            <UserRound />
            Profile
          </DropdownMenuItem>
          <DropdownMenuItem>
            <Settings />
            Preferences
          </DropdownMenuItem>
          {extraItem === "notifications" ? (
            <DropdownMenuItem>
              <Bell />
              Notifications
            </DropdownMenuItem>
          ) : (
            <DropdownMenuItem>
              <Home />
              Student home
            </DropdownMenuItem>
          )}
        </DropdownMenuGroup>
        <DropdownMenuSeparator />
        <form action={logoutAction}>
          <input name="audience" type="hidden" value="student" />
          <DropdownMenuItem render={<button className="w-full" type="submit" />}>
            <LogOut />
            Log out
          </DropdownMenuItem>
        </form>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

export { StudentAccountMenu };
export type { StudentAccountMenuItem };
