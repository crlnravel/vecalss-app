"use client";

import {
  CircleAlert,
  Clock,
  LockKeyhole,
  RefreshCw,
  ShieldCheck,
  ShieldAlert,
} from "@/lib/icons";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
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

function LockStateIcon({ state }: { state: AuthoringLockState }) {
  if (state === "owned") return <ShieldCheck aria-hidden="true" />;
  if (state === "locked") return <LockKeyhole aria-hidden="true" />;
  if (state === "acquiring") return <Clock aria-hidden="true" />;
  if (state === "uncertain") return <ShieldAlert aria-hidden="true" />;
  return <CircleAlert aria-hidden="true" />;
}

function ResourceAuthoringLockBanner({
  className,
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

  if (state === "owned" || state === "acquiring" || state === "uncertain") {
    return null;
  }

  const readOnly = state === "locked" || state === "lost";
  const stateCopy = AUTHORING_LOCK_STATE_COPY[state];
  const isQuestionBankLock =
    state === "locked" && resourceLabel === "Bank Soal";
  const title = isQuestionBankLock
    ? `Soal sedang diedit oleh ${holderName}`
    : stateCopy.title.replace("{holder}", holderName);
  const description = isQuestionBankLock
    ? "Untuk sementara, Bank Soal ini hanya bisa dilihat. Coba lagi setelah sesi pengeditan selesai."
    : stateCopy.description.replace("{resource}", resourceLabel);
  const toneClass =
    state === "locked"
      ? "border-amber-300 bg-amber-50 text-amber-950"
      : "border-student-status-danger-border bg-student-status-danger-bg text-student-status-danger-fg";

  return (
    <div className="pointer-events-none fixed inset-x-0 top-3 z-40 px-4 sm:px-6 lg:px-8">
      <section
        aria-describedby="resource-authoring-lock-description"
        aria-label="Status perubahan"
        className={cn(
          "pointer-events-auto mx-auto flex w-full flex-col gap-3 rounded-2xl border px-4 py-3 shadow-[0_18px_48px_-24px_color-mix(in_oklab,var(--voyage-forest)_45%,transparent)] backdrop-blur-md sm:flex-row sm:items-center sm:justify-between sm:px-5",
          toneClass,
          className,
          "max-w-[36rem]",
        )}
        data-authoring-lock-state={state}
        data-read-only={readOnly ? "true" : "false"}
        role={state === "lost" ? "alert" : "status"}
      >
        <div className="flex min-w-0 items-start gap-3">
          <span className="mt-0.5 grid size-8 shrink-0 place-items-center rounded-xl bg-white/70 text-current">
            <LockStateIcon state={state} />
          </span>
          <div className="min-w-0">
            <p className="font-semibold leading-5">{title}</p>
            <p
              className="mt-1 max-w-[65ch] text-sm leading-5 text-current/85"
              id="resource-authoring-lock-description"
            >
              {description}
              {hasLocalChanges && !isQuestionBankLock
                ? " Perubahan yang belum disimpan tetap ada di layar."
                : null}
            </p>
          </div>
        </div>

        <div className="flex shrink-0 flex-wrap items-center gap-2 sm:justify-end">
          {onRetry ? (
            <Button
              aria-label="Coba lagi"
              onClick={onRetry}
              size="sm"
              type="button"
              variant="brandOutline"
            >
              <RefreshCw data-icon="inline-start" />
              Coba lagi
            </Button>
          ) : null}
        </div>
      </section>
    </div>
  );
}

export {
  AUTHORING_LOCK_STATES,
  AUTHORING_LOCK_STATE_LABELS,
  ResourceAuthoringLockBanner,
};
export type { AuthoringLockState };
