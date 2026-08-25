"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

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
import { Button } from "@/components/ui/button";
import { ArrowUp } from "@/lib/icons";
import { setTryoutDefaultOpenRegistrationSessionAction } from "@/modules/mentor/tryout-actions";

const defaultAuditReason = "Mengganti sesi utama pendaftaran dari daftar sesi.";

function KaptenTryoutSessionPrimaryAction({
  currentPrimaryName,
  disabled = false,
  sessionId,
  sessionName,
}: {
  currentPrimaryName?: string | null;
  disabled?: boolean;
  sessionId: string;
  sessionName: string;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);

  const handleOpen = () => {
    if (disabled || busy) return;
    setNotice(null);
    setOpen(true);
  };

  const handleConfirm = async () => {
    if (busy) return;

    setBusy(true);
    setNotice(null);
    try {
      const result = await setTryoutDefaultOpenRegistrationSessionAction(sessionId, defaultAuditReason);
      if (!result.ok) {
        setNotice(result.message ?? "Sesi utama pendaftaran tidak dapat diperbarui.");
        return;
      }
      setOpen(false);
      router.refresh();
    } catch (error) {
      setNotice(error instanceof Error ? error.message : "Sesi utama pendaftaran tidak dapat diperbarui.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <>
      <Button
        aria-haspopup="dialog"
        disabled={disabled}
        onClick={handleOpen}
        size="xs"
        title={disabled ? "Sesi harus aktif dan memiliki rilis konten." : undefined}
        type="button"
        variant="brandOutline"
      >
        <ArrowUp aria-hidden="true" />
        Buat sesi utama
      </Button>

      <AlertDialog
        onOpenChange={(nextOpen) => {
          if (!busy) setOpen(nextOpen);
        }}
        open={open}
      >
        <AlertDialogContent pending={busy} variant="info">
          <AlertDialogHeader>
            <AlertDialogTitle>Buat sesi utama?</AlertDialogTitle>
            <AlertDialogDescription>
              <span className="font-semibold text-secondary-900">{sessionName}</span> akan menjadi tujuan pendaftaran terbuka.
              {currentPrimaryName
                ? ` Sesi utama saat ini, ${currentPrimaryName}, akan digantikan.`
                : " Peserta baru akan ditempatkan ke sesi ini."} Perubahan ini dicatat otomatis di audit log.
            </AlertDialogDescription>
          </AlertDialogHeader>

          {notice ? (
            <p className="rounded-2xl border border-student-status-danger-border bg-student-status-danger-bg px-3 py-2 text-sm leading-5 text-student-status-danger-fg" role="alert">
              {notice}
            </p>
          ) : null}

          <AlertDialogFooter>
            <AlertDialogCancel disabled={busy}>Batal</AlertDialogCancel>
            <AlertDialogAction
              disabled={busy}
              onClick={(event) => {
                event.preventDefault();
                void handleConfirm();
              }}
              variant="brand"
            >
              {busy ? "Memproses…" : "Buat sesi utama"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}

export { KaptenTryoutSessionPrimaryAction };
