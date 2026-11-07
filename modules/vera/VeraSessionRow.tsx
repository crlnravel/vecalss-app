"use client";

import { useEffect, useRef, useState } from "react";

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
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { fieldControlClassName } from "@/components/ui/field-constants";
import { SidebarMenuAction, SidebarMenuButton, SidebarMenuItem } from "@/components/ui/sidebar";
import { Ellipsis } from "@/lib/icons";
import type { VeraSessionSummary } from "@/lib/vera/conversations";
import { cn } from "@/lib/utils";
import { studentSidebarItemClassName } from "@/modules/student/components/student-sidebar";
import { sessionTime } from "@/modules/vera/session-day";

/**
 * One conversation in the list, as an item of the sidebar: its title, with the time of its last update under it. The active one takes the
 * sidebar's own active look. Its menu renames it, archives or restores it, or deletes it after a confirmation.
 */
export function VeraSessionRow({
  session,
  active,
  now,
  onOpen,
  onRename,
  onArchive,
  onDelete,
}: {
  session: VeraSessionSummary;
  active: boolean;
  now: Date;
  onOpen: (id: string) => void;
  onRename: (id: string, title: string) => void;
  onArchive: (id: string, toArchive: boolean) => void;
  onDelete: (id: string) => void;
}) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(session.title);
  const [confirming, setConfirming] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (editing) inputRef.current?.select();
  }, [editing]);

  function commit() {
    const title = draft.trim();
    setEditing(false);
    if (title && title !== session.title) onRename(session.id, title);
  }

  if (editing) {
    return (
      <SidebarMenuItem>
        <input
          aria-label="Nama sesi"
          className={fieldControlClassName}
          maxLength={120}
          onBlur={commit}
          onChange={(event) => setDraft(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === "Enter") {
              event.preventDefault();
              commit();
            } else if (event.key === "Escape") {
              event.preventDefault();
              setDraft(session.title);
              setEditing(false);
            }
          }}
          ref={inputRef}
          value={draft}
        />
      </SidebarMenuItem>
    );
  }

  return (
    <>
      <SidebarMenuItem>
        <SidebarMenuButton
          aria-current={active ? "true" : undefined}
          className={cn(studentSidebarItemClassName, "py-1 pr-9")}
          isActive={active}
          onClick={() => onOpen(session.id)}
        >
          <span className="flex min-w-0 flex-col">
            <span className="truncate text-sm font-medium">{session.title}</span>
            <span className="text-xs text-muted-foreground tabular-nums">{sessionTime(session.updatedAt, now)}</span>
          </span>
        </SidebarMenuButton>
        <DropdownMenu>
          <DropdownMenuTrigger
            render={<SidebarMenuAction aria-label="Opsi percakapan" className="top-3 peer-data-[size=default]/menu-button:top-3" />}
          >
            <Ellipsis />
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            <DropdownMenuItem
              onClick={() => {
                setDraft(session.title);
                setEditing(true);
              }}
            >
              Ganti nama
            </DropdownMenuItem>
            <DropdownMenuItem onClick={() => onArchive(session.id, !session.archived)}>
              {session.archived ? "Pulihkan" : "Arsipkan"}
            </DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuItem className="text-destructive" onClick={() => setConfirming(true)}>
              Hapus
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </SidebarMenuItem>
      <AlertDialog onOpenChange={setConfirming} open={confirming}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Hapus sesi ini?</AlertDialogTitle>
            <AlertDialogDescription>Sesi ini dan semua pesannya akan dihapus permanen.</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Batal</AlertDialogCancel>
            <AlertDialogAction onClick={() => onDelete(session.id)}>Hapus</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
