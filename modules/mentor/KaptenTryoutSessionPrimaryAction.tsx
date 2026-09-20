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
import { showToast } from "@/components/ui/toast";
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

  const handleOpen = () => {
    if (disabled || busy) return;
    setOpen(true);
  };

  const handleConfirm = async () => {
    if (busy) return;

    setBusy(true);
    try {
      const result = await setTryoutDefaultOpenRegistrationSessionAction(sessionId, defaultAuditReason);
      if (!result.ok) {
        showToast(
          result.message ?? "Sesi utama pendaftaran tidak dapat diperbarui.",
          { variant: "error" },
        );
        return;
      }
      setOpen(false);
      showToast("Sesi utama pendaftaran berhasil diperbarui.", {
        variant: "success",
      });
      router.refresh();
    } catch (error) {
      showToast(
        error instanceof Error
          ? error.message
          : "Sesi utama pendaftaran tidak dapat diperbarui.",
        { variant: "error" },
      );
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
