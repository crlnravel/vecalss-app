"use client";

import { useEffect, useRef, useState } from "react";

import { Button } from "@/components/ui/button";
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
import { Ellipsis } from "@/lib/icons";
import type { VeraSessionSummary } from "@/lib/vera/conversations";
import { cn } from "@/lib/utils";
import { sessionTime } from "@/modules/vera/session-day";

/**
 * One conversation in the list: its title, and the time of its last update under it. The active one sits on the Sea-Glass Wash with a
 * Voyage border. Its menu renames it, archives or restores it, or deletes it after a confirmation.
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
    );
  }

  return (
    <>
      <div
        className={cn(
          "flex items-center gap-1 rounded-control border pr-1 transition-colors motion-reduce:transition-none",
          active ? "border-voyage-leaf bg-accent text-accent-foreground" : "border-transparent text-foreground hover:bg-accent/60",
        )}
      >
        <button
          aria-current={active ? "true" : undefined}
          className="flex min-h-16 min-w-0 flex-1 flex-col justify-center gap-0.5 rounded-control px-3 py-2 text-left"
          onClick={() => onOpen(session.id)}
          type="button"
        >
          <span className="truncate text-sm font-medium">{session.title}</span>
          <span className="text-xs text-muted-foreground tabular-nums">{sessionTime(session.updatedAt, now)}</span>
        </button>
        <DropdownMenu>
          <DropdownMenuTrigger
            render={<Button aria-label="Opsi percakapan" size="icon" type="button" variant="quiet" />}
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
      </div>
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
