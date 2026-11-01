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
import { Ellipsis } from "@/lib/icons";
import type { VeraSessionSummary } from "@/lib/vera/conversations";
import { cn } from "@/lib/utils";

/** One session in the sidebar: open it, rename it inline, archive or restore it, or delete it after a confirmation. */
export function VeraSessionRow({
  session,
  active,
  onOpen,
  onRename,
  onArchive,
  onDelete,
}: {
  session: VeraSessionSummary;
  active: boolean;
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
        className="h-10 w-full min-w-0 rounded-lg border border-border bg-card px-2 text-sm"
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
      <div className={cn("flex items-center gap-1 rounded-lg pr-1", active && "bg-muted")}>
        <button
          aria-current={active ? "true" : undefined}
          className="min-w-0 flex-1 truncate px-2 py-2 text-left text-sm"
          onClick={() => onOpen(session.id)}
          type="button"
        >
          {session.title}
        </button>
        <DropdownMenu>
          <DropdownMenuTrigger
            render={
              <Button aria-label={`Aksi untuk sesi ${session.title}`} size="icon-sm" type="button" variant="quiet" />
            }
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
