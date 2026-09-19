"use client";

import { useState } from "react";

import { Archive, Copy, FilePenLine, Trash2 } from "@/lib/icons";
import {
  ReferenceSurface,
} from "@/components/dashboard/reference-dashboard-primitives";
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

type AdministrationAction = "archive" | "delete";

function KaptenTryoutSettingsPageModule({
  draft,
  error,
  hasActiveAttempt,
  onArchive,
  onDelete,
  onDuplicate,
  onUnpublish,
  saving,
}: {
  draft: {
    locked: boolean;
    status: "draft" | "published";
    title: string;
  };
  error?: string | null;
  hasActiveAttempt: boolean;
  onArchive: () => void;
  onDelete: () => void;
  onDuplicate: () => void;
  onUnpublish: () => void;
  saving: boolean;
}) {
  const [pendingAction, setPendingAction] = useState<AdministrationAction | null>(null);
  const isPublished = draft.status === "published";
  const canDelete = !isPublished && !draft.locked;
  const canDraft = isPublished && !hasActiveAttempt;

  const confirmAction = () => {
    if (pendingAction === "archive") onArchive();
    if (pendingAction === "delete") onDelete();
    setPendingAction(null);
  };

  return (
    <>
      <ReferenceSurface
        as="section"
        aria-labelledby="tryout-settings-administration-title"
        className="mt-4 grid gap-5 p-5 sm:p-7"
      >
        <div className="grid gap-1">
          <h2
            className="text-xl font-semibold tracking-[-0.025em] text-secondary-900"
            id="tryout-settings-administration-title"
          >
            Administrasi
          </h2>
          <p className="max-w-2xl text-sm leading-6 text-secondary-600">
            Kelola status dan salinan Tryout ini. Riwayat peserta tetap tersimpan
            saat Tryout dikembalikan ke draf atau diarsipkan.
          </p>
        </div>

        {error ? (
          <p
            className="rounded-2xl border border-danger-500/20 bg-danger-500/10 px-4 py-3 text-sm leading-6 text-danger-600"
            role="alert"
          >
            {error}
          </p>
        ) : null}

        <div className="grid gap-3 sm:grid-cols-2">
          {isPublished ? (
            <Button
              disabled={saving || !canDraft}
              onClick={onUnpublish}
              title={
                canDraft
                  ? "Kembalikan Tryout ke draf"
                  : "Tunggu sampai semua peserta selesai sebelum menjadikan Tryout draf."
              }
              type="button"
              variant="brandOutline"
            >
              <FilePenLine />
              Jadikan draf
            </Button>
          ) : null}
          {isPublished || draft.locked ? (
            <Button
              disabled={saving}
              onClick={onDuplicate}
              type="button"
              variant="brandOutline"
            >
              <Copy />
              Buat draf perubahan
            </Button>
          ) : null}
          <Button
            disabled={saving}
            onClick={() => setPendingAction("archive")}
            type="button"
            variant="dangerOutline"
          >
            <Archive />
            Arsipkan Tryout
          </Button>
          {canDelete ? (
            <Button
              disabled={saving}
              onClick={() => setPendingAction("delete")}
              type="button"
              variant="dangerOutline"
            >
              <Trash2 />
              Hapus Tryout
            </Button>
          ) : null}
        </div>
      </ReferenceSurface>

      <AlertDialog
        onOpenChange={(open) => {
          if (!open && !saving) setPendingAction(null);
        }}
        open={Boolean(pendingAction)}
      >
        <AlertDialogContent pending={saving} variant="danger">
          <AlertDialogHeader>
            <AlertDialogMedia variant="danger">
              {pendingAction === "archive" ? <Archive /> : <Trash2 />}
            </AlertDialogMedia>
            <AlertDialogTitle>
              {pendingAction === "archive"
                ? "Arsipkan Tryout?"
                : "Hapus Tryout?"}
            </AlertDialogTitle>
            <AlertDialogDescription>
              {pendingAction === "archive"
                ? `“${draft.title}” akan dipindahkan ke arsip dan tidak tersedia untuk akses baru.`
                : "Tryout draf dan seluruh konfigurasi soalnya akan dihapus permanen. Tindakan ini tidak dapat dibatalkan."}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={saving}>Batal</AlertDialogCancel>
            <AlertDialogAction
              disabled={saving}
              onClick={(event) => {
                event.preventDefault();
                confirmAction();
              }}
              variant="destructive"
            >
              {saving
                ? "Memproses…"
                : pendingAction === "archive"
                  ? "Arsipkan"
                  : "Hapus Tryout"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}

export { KaptenTryoutSettingsPageModule };
