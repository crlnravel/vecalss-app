"use client";

import {
  CircleAlert,
  Clock,
  LockKeyhole,
  RefreshCw,
  ShieldCheck,
  ShieldAlert,
} from "@/lib/icons";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuLabel,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

const AUTHORING_LOCK_STATES = [
  "acquiring",
  "owned",
  "locked",
  "uncertain",
  "lost",
] as const;

type AuthoringLockState = (typeof AUTHORING_LOCK_STATES)[number];

const AUTHORING_LOCK_STATE_LABELS: Record<AuthoringLockState, string> = {
  acquiring: "Menyiapkan izin",
  owned: "Bisa mengedit",
  locked: "Sedang diedit orang lain",
  uncertain: "Izin belum pasti",
  lost: "Izin berakhir",
};

const AUTHORING_LOCK_STATE_COPY: Record<
  AuthoringLockState,
  { description: string; title: string }
> = {
  acquiring: {
    description:
      "Perubahan dinonaktifkan sementara. Soal, preview, dan Ekspor CSV tetap dapat digunakan.",
    title: "Menyiapkan izin edit…",
  },
  owned: {
    description:
      "Anda memegang izin edit untuk Bank Soal ini. Perubahan lokal tetap berada di layar sampai disimpan.",
    title: "Izin edit aktif",
  },
  locked: {
    description:
      "Perubahan dinonaktifkan sementara. Anda tetap dapat melihat soal, membuka preview, dan mengekspor CSV.",
    title: "Sedang diedit oleh {holder}",
  },
  uncertain: {
    description:
      "Koneksi ke izin edit sedang diverifikasi. Perubahan dibekukan agar draf lokal tidak tertimpa.",
    title: "Izin edit belum pasti",
  },
  lost: {
    description:
      "Izin edit berakhir. Perubahan lokal tetap tersimpan di layar, tetapi simpan dan mutasi dinonaktifkan sampai izin diperoleh lagi.",
    title: "Izin edit berakhir",
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
  holderName = "Kapten lain",
  onRetry,
  onStateChange,
  remainingSeconds = 90,
  showScenarioPicker = false,
  state,
}: {
  className?: string;
  hasLocalChanges?: boolean;
  holderName?: string;
  onRetry?: () => void;
  onStateChange?: (state: AuthoringLockState) => void;
  remainingSeconds?: number;
  showScenarioPicker?: boolean;
  state: AuthoringLockState;
}) {
  const readOnly = state !== "owned";
  const stateCopy = AUTHORING_LOCK_STATE_COPY[state];
  const title = stateCopy.title.replace("{holder}", holderName);
  const toneClass =
    state === "owned"
      ? "border-primary-200 bg-primary-50/70 text-primary-950"
      : state === "locked" || state === "uncertain"
        ? "border-amber-300 bg-amber-50 text-amber-950"
        : "border-student-status-danger-border bg-student-status-danger-bg text-student-status-danger-fg";

  return (
    <section
      aria-describedby="resource-authoring-lock-description"
      aria-label="Status izin edit"
      className={cn(
        "flex flex-col gap-3 rounded-2xl border px-4 py-3.5 shadow-[0_14px_28px_-26px_color-mix(in_oklab,var(--voyage-forest)_45%,transparent)] sm:flex-row sm:items-start sm:justify-between",
        toneClass,
        className,
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
            className="mt-1 max-w-[70ch] text-sm leading-6 text-current/85"
            id="resource-authoring-lock-description"
          >
            {stateCopy.description}
            {state === "locked"
              ? ` Perkiraan izin tersedia lagi dalam ${remainingSeconds} detik.`
              : null}
            {hasLocalChanges && state !== "owned"
              ? " Draf yang belum disimpan tidak dihapus."
              : null}
          </p>
        </div>
      </div>

      <div className="flex shrink-0 flex-wrap items-center gap-2 sm:justify-end">
        {onRetry && state !== "owned" ? (
          <Button
            aria-label="Coba ambil izin edit lagi"
            onClick={onRetry}
            size="sm"
            type="button"
            variant="brandOutline"
          >
            <RefreshCw data-icon="inline-start" />
            Coba lagi
          </Button>
        ) : null}
        {showScenarioPicker && onStateChange ? (
          <DropdownMenu>
            <DropdownMenuTrigger
              aria-label="Simulasikan status edit"
              render={
                <Button
                  className="min-h-10 bg-white/80"
                  data-authoring-lock-scenario-picker="true"
                  size="sm"
                  type="button"
                  variant="reference"
                />
              }
            >
              Pratinjau status
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-64">
              <DropdownMenuLabel>Simulasikan status edit</DropdownMenuLabel>
              <DropdownMenuRadioGroup
                onValueChange={(value) => {
                  if (
                    AUTHORING_LOCK_STATES.includes(
                      value as AuthoringLockState,
                    )
                  ) {
                    onStateChange(value as AuthoringLockState);
                  }
                }}
                value={state}
              >
                {AUTHORING_LOCK_STATES.map((option) => (
                  <DropdownMenuRadioItem key={option} value={option}>
                    {AUTHORING_LOCK_STATE_LABELS[option]}
                  </DropdownMenuRadioItem>
                ))}
              </DropdownMenuRadioGroup>
            </DropdownMenuContent>
          </DropdownMenu>
        ) : null}
      </div>
    </section>
  );
}

export {
  AUTHORING_LOCK_STATES,
  AUTHORING_LOCK_STATE_LABELS,
  ResourceAuthoringLockBanner,
};
export type { AuthoringLockState };
