"use client";

import { useState } from "react";

import { Archive, Copy, FilePenLine, Trash2 } from "@/lib/icons";
import { ReferenceSurface } from "@/components/dashboard/reference-dashboard-primitives";
import { Button } from "@/components/ui/button";
import { AdministrationActionRow } from "@/modules/mentor/components/administration-action-row";
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
  onSetHidden,
  onUnpublish,
  saving,
}: {
  draft: {
    isHidden: boolean;
    locked: boolean;
    status: "draft" | "published";
    title: string;
  };
  error?: string | null;
  hasActiveAttempt: boolean;
  onArchive: () => void;
  onDelete: () => void;
  onDuplicate: () => void;
  onSetHidden: (isHidden: boolean) => void;
  onUnpublish: () => void;
  saving: boolean;
}) {
  const [pendingAction, setPendingAction] =
    useState<AdministrationAction | null>(null);
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
        <h2
          className="text-xl font-semibold tracking-[-0.025em] text-secondary-900"
          id="tryout-settings-administration-title"
        >
          Administrasi
        </h2>

        {error ? (
          <p
            className="rounded-2xl border border-danger-500/20 bg-danger-500/10 px-4 py-3 text-sm leading-6 text-danger-600"
            role="alert"
          >
            {error}
          </p>
        ) : null}

        <div>
          {isPublished ? (
            <AdministrationActionRow
              action="Jadikan draf"
              description="Kembalikan Tryout ke draf setelah semua peserta selesai mengerjakan."
            >
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
            </AdministrationActionRow>
          ) : null}
          {isPublished ? (
            <AdministrationActionRow
              action={draft.isHidden ? "Tampilkan Tryout" : "Sembunyikan Tryout"}
              description={
                draft.isHidden
                  ? "Tampilkan kembali Tryout di katalog siswa agar siswa dapat mendaftar atau memulai pengerjaan baru."
                  : "Tryout tidak muncul di katalog siswa dan tidak menerima pendaftaran atau pengerjaan baru. Pengerjaan yang sedang berjalan dan riwayat hasil tetap tersedia."
              }
            >
              <Button
                disabled={saving}
                onClick={() => onSetHidden(!draft.isHidden)}
                type="button"
                variant="brandOutline"
              >
                {draft.isHidden ? "Tampilkan lagi" : "Sembunyikan"}
              </Button>
            </AdministrationActionRow>
          ) : null}
          {isPublished || draft.locked ? (
            <AdministrationActionRow
              action="Buat draf perubahan"
              description="Buat salinan draf untuk menyiapkan perubahan tanpa mengubah Tryout yang sedang terbit."
            >
              <Button
                disabled={saving}
                onClick={onDuplicate}
                type="button"
                variant="brandOutline"
              >
                <Copy />
                Buat draf perubahan
              </Button>
            </AdministrationActionRow>
          ) : null}
          <AdministrationActionRow
            action="Arsipkan Tryout"
            description="Sembunyikan Tryout dari daftar aktif tanpa menghapusnya."
          >
            <Button
              disabled={saving}
              onClick={() => setPendingAction("archive")}
              type="button"
              variant="dangerOutline"
            >
              <Archive />
              Arsipkan Tryout
            </Button>
          </AdministrationActionRow>
          {canDelete ? (
            <AdministrationActionRow
              action="Hapus Tryout"
              description="Hapus Tryout beserta soal dan pengaturannya secara permanen."
            >
              <Button
                disabled={saving}
                onClick={() => setPendingAction("delete")}
                type="button"
                variant="dangerOutline"
              >
                <Trash2 />
                Hapus Tryout
              </Button>
            </AdministrationActionRow>
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
