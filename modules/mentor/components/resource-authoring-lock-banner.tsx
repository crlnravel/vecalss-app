"use client";

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
import { usePageStatusToast } from "@/components/ui/use-page-status-toast";
import { useResourceEditLock } from "@/modules/mentor/resource-edit-lock-provider";

const AUTHORING_LOCK_STATES = [
  "acquiring",
  "owned",
  "locked",
  "uncertain",
  "lost",
] as const;

type AuthoringLockState = (typeof AUTHORING_LOCK_STATES)[number];

const AUTHORING_LOCK_STATE_LABELS: Record<AuthoringLockState, string> = {
  acquiring: "Menyiapkan halaman",
  owned: "Siap diedit",
  locked: "Sedang diedit",
  uncertain: "Memeriksa halaman",
  lost: "Perubahan dijeda",
};

const AUTHORING_LOCK_STATE_COPY: Record<
  AuthoringLockState,
  { description: string; title: string }
> = {
  acquiring: {
    description:
      "Tombol perubahan akan aktif setelah halaman selesai diperiksa.",
    title: "Menyiapkan halaman…",
  },
  owned: {
    description: "Anda dapat melakukan perubahan pada {resource}.",
    title: "Siap diedit",
  },
  locked: {
    description:
      "Untuk sementara, {resource} ini hanya bisa dilihat. Coba lagi setelah sesi pengeditan selesai.",
    title: "Sedang diedit oleh {holder}",
  },
  uncertain: {
    description:
      "Tombol perubahan akan aktif setelah halaman selesai diperiksa.",
    title: "Memeriksa halaman…",
  },
  lost: {
    description:
      "Pemeriksaan selesai. Perubahan yang belum disimpan pada {resource} masih terlihat, tetapi belum dapat disimpan.",
    title: "Perubahan sedang dijeda",
  },
};

/** This tab is out of date: another tab took over, or it already saved newer content. */
type OutOfDateKind = "opened_elsewhere" | "changed_elsewhere";

function outOfDateKind(state: AuthoringLockState, lastError: string | null): OutOfDateKind | null {
  if (state !== "lost") return null;
  if (lastError === "lease_taken_over") return "opened_elsewhere";
  if (lastError === "stale_content") return "changed_elsewhere";
  return null;
}

const OUT_OF_DATE_COPY: Record<OutOfDateKind, { action: string; description: string; title: string }> = {
  changed_elsewhere: {
    action: "Muat versi terbaru",
    description: "{resource} ini sudah disimpan dari tab atau perangkat lain, jadi perubahan di sini belum bisa disimpan.",
    title: "Sudah diubah di tab lain",
  },
  opened_elsewhere: {
    action: "Edit di sini",
    description: "{resource} ini sedang dibuka di tab atau perangkat lain, jadi perubahan di sini dijeda.",
    title: "Dibuka di tab lain",
  },
};

function getLockBannerPresentation(state: AuthoringLockState, resourceLabel: string, holderName: string, hasLocalChanges: boolean, outOfDate: OutOfDateKind | null = null) {
  if (state === "owned" || state === "acquiring" || state === "uncertain") return null;
  if (outOfDate) {
    const copy = OUT_OF_DATE_COPY[outOfDate];
    return {
      description: `${copy.description.replace("{resource}", resourceLabel)}${hasLocalChanges ? " Perubahan yang belum disimpan tetap ada di layar." : ""}`,
      title: copy.title,
    };
  }
  const isQuestionBankLock = state === "locked" && resourceLabel === "Bank Soal";
  const stateCopy = AUTHORING_LOCK_STATE_COPY[state];
  const description = isQuestionBankLock
    ? "Untuk sementara, Bank Soal ini hanya bisa dilihat. Coba lagi setelah sesi pengeditan selesai."
    : stateCopy.description.replace("{resource}", resourceLabel);
  const title = isQuestionBankLock
    ? `Soal sedang diedit oleh ${holderName}`
    : stateCopy.title.replace("{holder}", holderName);
  return {
    description: `${description}${hasLocalChanges && !isQuestionBankLock ? " Perubahan yang belum disimpan tetap ada di layar." : ""}`,
    title,
  };
}

function ResourceAuthoringLockBanner({
  hasLocalChanges = false,
  holderName: providedHolderName,
  onRetry,
  resourceLabel = "ruang kerja ini",
  state,
}: {
  className?: string;
  hasLocalChanges?: boolean;
  holderName?: string;
  onRetry?: () => void;
  resourceLabel?: string;
  state: AuthoringLockState;
}) {
  const resourceLock = useResourceEditLock();
  const holderName = providedHolderName ?? resourceLock.holderName ?? "Kapten lain";
  const outOfDate = outOfDateKind(state, resourceLock.lastError);
  const presentation = getLockBannerPresentation(state, resourceLabel, holderName, hasLocalChanges, outOfDate);
  const [isConfirmOpen, setIsConfirmOpen] = useState(false);
  // Reloading is the one reliable way to pick up what the other tab saved and to take the
  // lease back (the new page acquires it). Local edits would be lost, so ask first.
  const loadLatest = () => {
    if (hasLocalChanges) setIsConfirmOpen(true);
    else window.location.reload();
  };
  usePageStatusToast({
    active: presentation !== null,
    message: presentation?.title ?? "",
    description: presentation?.description,
    variant: state === "locked" || outOfDate ? "warning" : "error",
    action: !presentation
      ? undefined
      : outOfDate
        ? { label: OUT_OF_DATE_COPY[outOfDate].action, onClick: loadLatest }
        : onRetry
          ? { label: "Coba lagi", onClick: onRetry }
          : undefined,
  });

  if (!outOfDate) return null;
  return (
    <AlertDialog onOpenChange={setIsConfirmOpen} open={isConfirmOpen}>
      <AlertDialogContent size="sm" variant="danger">
        <AlertDialogHeader>
          <AlertDialogTitle>Muat versi terbaru?</AlertDialogTitle>
          <AlertDialogDescription>
            Perubahan yang belum disimpan di tab ini akan hilang, lalu halaman memuat versi terbaru.
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>Tetap di sini</AlertDialogCancel>
          <AlertDialogAction onClick={() => window.location.reload()} variant="destructive">
            Buang dan muat ulang
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}

export {
  AUTHORING_LOCK_STATES,
  AUTHORING_LOCK_STATE_LABELS,
  ResourceAuthoringLockBanner,
};
export type { AuthoringLockState };
