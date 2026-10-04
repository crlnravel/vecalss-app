"use client";

import { Trash2 } from "@/lib/icons";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader,
  AlertDialogMedia, AlertDialogTitle,
} from "@/components/ui/alert-dialog";

function MateriDeleteDialog({ open, pending, onOpenChange, onConfirm }: {
  open: boolean;
  pending: boolean;
  onOpenChange: (open: boolean) => void;
  onConfirm: () => void;
}) {
  return (
    <AlertDialog onOpenChange={(next) => { if (!pending) onOpenChange(next); }} open={open}>
      <AlertDialogContent size="sm" variant="danger">
        <AlertDialogHeader>
          <AlertDialogMedia variant="danger"><Trash2 /></AlertDialogMedia>
          <AlertDialogTitle>Hapus materi?</AlertDialogTitle>
          <AlertDialogDescription>
            Materi dan progres belajarnya akan dihapus permanen. File PDF tetap tersimpan di pustaka media.
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel disabled={pending}>Batal</AlertDialogCancel>
          <AlertDialogAction type="button" aria-busy={pending} disabled={pending} onClick={(event) => { event.preventDefault(); onConfirm(); }} variant="destructive">
            {pending ? "Menghapus…" : "Hapus materi"}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}

export { MateriDeleteDialog };
