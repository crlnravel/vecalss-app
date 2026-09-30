"use client";

import { useState } from "react";

import {
  Archive,
  Copy,
  Eye,
  EyeOff,
  FilePenLine,
  Trash2,
  Upload,
} from "@/lib/icons";
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
  onPublish,
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
  onPublish: () => void;
  onSetHidden: (isHidden: boolean) => void;
  onUnpublish: () => void;
  saving: boolean;
}) {
  const [pendingAction, setPendingAction] =
    useState<AdministrationAction | null>(null);

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

        {error ? <p className="rounded-2xl border border-danger-500/20 bg-danger-500/10 px-4 py-3 text-sm leading-6 text-danger-600" role="alert">{error}</p> : null}
        <TryoutAdministrationActionRows draft={draft} hasActiveAttempt={hasActiveAttempt} onArchive={() => setPendingAction("archive")} onDelete={() => setPendingAction("delete")} onDuplicate={onDuplicate} onPublish={onPublish} onSetHidden={onSetHidden} onUnpublish={onUnpublish} saving={saving} />
      </ReferenceSurface>

      <TryoutActionConfirmationDialog draftTitle={draft.title} onConfirm={confirmAction} onOpenChange={(open) => { if (!open && !saving) setPendingAction(null); }} pendingAction={pendingAction} saving={saving} />
    </>
  );
}

function TryoutAdministrationActionRows({ draft, hasActiveAttempt, onArchive, onDelete, onDuplicate, onPublish, onSetHidden, onUnpublish, saving }: {
  draft: { isHidden: boolean; locked: boolean; status: "draft" | "published" };
  hasActiveAttempt: boolean;
  onArchive: () => void;
  onDelete: () => void;
  onDuplicate: () => void;
  onPublish: () => void;
  onSetHidden: (isHidden: boolean) => void;
  onUnpublish: () => void;
  saving: boolean;
}) {
  const isPublished = draft.status === "published";
  const canDelete = !isPublished && !draft.locked;
  const canDraft = isPublished && !draft.locked && !hasActiveAttempt;
  const draftDisabledReason = draft.locked
    ? "Tryout sudah terkunci karena peserta telah mulai mengerjakan. Buat draf perubahan untuk menyiapkan versi baru."
    : "Tunggu sampai semua peserta selesai sebelum menjadikan Tryout draf.";
  return (
    <div>
      {!isPublished && !draft.locked ? <AdministrationActionRow action="Terbitkan Tryout" description="Terbitkan Tryout setelah judul, bagian, dan soal sudah siap."><Button aria-busy={saving} disabled={saving} onClick={onPublish} type="button" variant="brand"><Upload aria-hidden="true" />{saving ? "Menerbitkan…" : "Terbitkan"}</Button></AdministrationActionRow> : null}
      {isPublished ? <PublishedTryoutActions canDraft={canDraft} draft={draft} draftDisabledReason={draftDisabledReason} onSetHidden={onSetHidden} onUnpublish={onUnpublish} saving={saving} /> : null}
      {isPublished || draft.locked ? <AdministrationActionRow action="Buat draf perubahan" description="Buat salinan draf untuk menyiapkan perubahan tanpa mengubah Tryout yang sedang terbit."><Button disabled={saving} onClick={onDuplicate} type="button" variant="brandOutline"><Copy />Buat draf perubahan</Button></AdministrationActionRow> : null}
      <AdministrationActionRow action="Arsipkan Tryout" description="Sembunyikan Tryout dari daftar aktif tanpa menghapusnya."><Button disabled={saving} onClick={onArchive} type="button" variant="dangerOutline"><Archive />Arsipkan Tryout</Button></AdministrationActionRow>
      {canDelete ? <AdministrationActionRow action="Hapus Tryout" description="Hapus Tryout beserta soal dan pengaturannya secara permanen."><Button disabled={saving} onClick={onDelete} type="button" variant="dangerOutline"><Trash2 />Hapus Tryout</Button></AdministrationActionRow> : null}
    </div>
  );
}

function PublishedTryoutActions({ canDraft, draft, draftDisabledReason, onSetHidden, onUnpublish, saving }: {
  canDraft: boolean;
  draft: { isHidden: boolean; locked: boolean; status: "draft" | "published" };
  draftDisabledReason: string;
  onSetHidden: (isHidden: boolean) => void;
  onUnpublish: () => void;
  saving: boolean;
}) {
  return (
    <>
      <AdministrationActionRow action="Jadikan draf" description={canDraft ? "Kembalikan Tryout ke draf sebelum ada peserta yang mulai mengerjakan." : draftDisabledReason}>
        <Button disabled={saving || !canDraft} onClick={onUnpublish} title={canDraft ? "Kembalikan Tryout ke draf" : draftDisabledReason} type="button" variant="brandOutline"><FilePenLine />Jadikan draf</Button>
      </AdministrationActionRow>
      <AdministrationActionRow
        action={draft.isHidden ? "Tampilkan Tryout" : "Sembunyikan Tryout"}
        description={draft.isHidden ? "Tampilkan kembali Tryout di katalog siswa agar siswa dapat mendaftar atau memulai pengerjaan baru." : "Tryout tidak muncul di katalog siswa dan tidak menerima pendaftaran atau pengerjaan baru. Pengerjaan yang sedang berjalan dan riwayat hasil tetap tersedia."}
      >
        <Button disabled={saving} onClick={() => onSetHidden(!draft.isHidden)} type="button" variant="brandOutline">
          {draft.isHidden ? <Eye aria-hidden="true" /> : <EyeOff aria-hidden="true" />}
          {draft.isHidden ? "Tampilkan lagi" : "Sembunyikan"}
        </Button>
      </AdministrationActionRow>
    </>
  );
}

function TryoutActionConfirmationDialog({ draftTitle, onConfirm, onOpenChange, pendingAction, saving }: {
  draftTitle: string;
  onConfirm: () => void;
  onOpenChange: (open: boolean) => void;
  pendingAction: AdministrationAction | null;
  saving: boolean;
}) {
  const isArchive = pendingAction === "archive";
  return (
      <AlertDialog onOpenChange={onOpenChange} open={Boolean(pendingAction)}>
        <AlertDialogContent pending={saving} variant="danger">
          <AlertDialogHeader>
            <AlertDialogMedia variant="danger">
              {isArchive ? <Archive /> : <Trash2 />}
            </AlertDialogMedia>
            <AlertDialogTitle>
              {isArchive
                ? "Arsipkan Tryout?"
                : "Hapus Tryout?"}
            </AlertDialogTitle>
            <AlertDialogDescription>
              {isArchive
                ? `“${draftTitle}” akan dipindahkan ke arsip dan tidak tersedia untuk akses baru.`
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
                : isArchive
                  ? "Arsipkan"
                  : "Hapus Tryout"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
  );
}

export { KaptenTryoutSettingsPageModule };
