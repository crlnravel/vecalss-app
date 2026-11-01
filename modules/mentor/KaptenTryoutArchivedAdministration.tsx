"use client";

import { useState } from "react";

import { ReferenceSurface } from "@/components/dashboard/reference-dashboard-primitives";
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
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { showToast } from "@/components/ui/toast";
import { RotateCcw, Trash2 } from "@/lib/icons";
import { AdministrationActionRow } from "@/modules/mentor/components/administration-action-row";
import { deleteTryoutAction, restoreTryoutAction } from "@/modules/mentor/tryout-actions";

const DELETE_CONFIRMATION_WORD = "HAPUS";

type DeletionPlan = { activeAttemptCount: number; admissionCount: number; attemptCount: number; hasHistory: boolean };

function deleteDescription(plan: DeletionPlan) {
  if (plan.activeAttemptCount) return "Masih ada peserta yang sedang mengerjakan Tryout ini. Tunggu sampai pengerjaan selesai sebelum menghapusnya.";
  if (!plan.hasHistory) return "Hapus Tryout beserta soal dan pengaturannya secara permanen.";
  return `Hapus Tryout beserta soal, sesi, dan seluruh riwayat pengerjaan (${plan.attemptCount} pengerjaan, ${plan.admissionCount} peserta) secara permanen.`;
}

/** Settings-tab actions for an archived Tryout: bring it back, or delete it (with its history, after a typed confirmation). */
function KaptenTryoutArchivedAdministration({ plan, title, tryoutId }: { plan: DeletionPlan; title: string; tryoutId: string }) {
  const [confirmingDelete, setConfirmingDelete] = useState(false);
  const [confirmation, setConfirmation] = useState("");
  const canDelete = plan.activeAttemptCount === 0;
  const confirmed = !plan.hasHistory || confirmation.trim().toUpperCase() === DELETE_CONFIRMATION_WORD;
  const [pending, setPending] = useState<"delete" | "restore" | null>(null);

  const run = async (kind: "delete" | "restore") => {
    setPending(kind);
    try {
      const result = kind === "restore" ? await restoreTryoutAction(tryoutId) : await deleteTryoutAction(tryoutId, undefined, { withHistory: plan.hasHistory });
      if (!result.ok) {
        showToast(result.message, { variant: "error" });
        return;
      }
      window.location.assign(kind === "restore" ? `/mentor/tryout/${tryoutId}` : "/mentor/tryout");
    } catch (error) {
      showToast(error instanceof Error ? error.message : kind === "restore" ? "Tryout belum dapat dipulihkan. Coba lagi." : "Tryout belum dapat dihapus. Coba lagi.", { variant: "error" });
    } finally {
      setPending(null);
    }
  };

  return (
    <>
      <ReferenceSurface as="section" aria-labelledby="archived-tryout-administration" className="grid gap-5 p-5 sm:p-6" variant="raised">
        <h2 className="text-xl font-semibold tracking-[-0.025em] text-secondary-900" id="archived-tryout-administration">Administrasi</h2>
        <div>
          <AdministrationActionRow action="Pulihkan Tryout" description="Kembalikan Tryout dari arsip ke daftar aktif. Tryout yang sebelumnya terbit akan terbit lagi, sedangkan yang sebelumnya draf kembali menjadi draf.">
            <Button aria-busy={pending === "restore"} disabled={pending !== null} onClick={() => void run("restore")} type="button" variant="default"><RotateCcw aria-hidden="true" />{pending === "restore" ? "Memulihkan…" : "Pulihkan Tryout"}</Button>
          </AdministrationActionRow>
          <AdministrationActionRow
            action="Hapus Tryout"
            description={deleteDescription(plan)}
          >
            <Button disabled={!canDelete || pending !== null} onClick={() => { setConfirmation(""); setConfirmingDelete(true); }} type="button" variant="destructive"><Trash2 aria-hidden="true" />Hapus Tryout</Button>
          </AdministrationActionRow>
        </div>
      </ReferenceSurface>

      <AlertDialog onOpenChange={(open) => { if (!open && pending === null) setConfirmingDelete(false); }} open={confirmingDelete}>
        <AlertDialogContent pending={pending === "delete"} variant="danger">
          <AlertDialogHeader>
            <AlertDialogMedia variant="danger"><Trash2 /></AlertDialogMedia>
            <AlertDialogTitle>Hapus Tryout?</AlertDialogTitle>
            <AlertDialogDescription>
              {plan.hasHistory
                ? `“${title}” beserta seluruh soal, sesi, dan riwayat pengerjaan (${plan.attemptCount} pengerjaan, ${plan.admissionCount} peserta) akan dihapus permanen. Skor dan jawaban peserta tidak dapat dikembalikan.`
                : `“${title}” beserta seluruh soal dan pengaturannya akan dihapus permanen. Tindakan ini tidak dapat dibatalkan.`}
            </AlertDialogDescription>
          </AlertDialogHeader>
          {plan.hasHistory ? (
            <label className="grid gap-2 text-sm font-medium text-secondary-900">
              Ketik {DELETE_CONFIRMATION_WORD} untuk melanjutkan
              <Input autoComplete="off" disabled={pending !== null} onChange={(event) => setConfirmation(event.target.value)} value={confirmation} />
            </label>
          ) : null}
          <AlertDialogFooter>
            <AlertDialogCancel disabled={pending !== null}>Batal</AlertDialogCancel>
            <AlertDialogAction
              disabled={pending !== null || !confirmed}
              onClick={(event) => {
                event.preventDefault();
                void run("delete");
              }}
              variant="destructive"
            >
              {pending === "delete" ? "Memproses…" : "Hapus Tryout"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}

export { KaptenTryoutArchivedAdministration };
