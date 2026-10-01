"use client";

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

function getLockBannerPresentation(state: AuthoringLockState, resourceLabel: string, holderName: string, hasLocalChanges: boolean) {
  if (state === "owned" || state === "acquiring" || state === "uncertain") return null;
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
  const presentation = getLockBannerPresentation(state, resourceLabel, holderName, hasLocalChanges);
  usePageStatusToast({
    active: presentation !== null,
    message: presentation?.title ?? "",
    description: presentation?.description,
    variant: state === "locked" ? "warning" : "error",
    action: presentation && onRetry ? { label: "Coba lagi", onClick: onRetry } : undefined,
  });

  return null;
}

export {
  AUTHORING_LOCK_STATES,
  AUTHORING_LOCK_STATE_LABELS,
  ResourceAuthoringLockBanner,
};
export type { AuthoringLockState };
