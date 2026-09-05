import { AlertCircle, FileImage, ImageOff, RefreshCw, Search, Upload } from "@/lib/icons";
import { Button } from "@/components/ui/button";
import { REFERENCE_CONTROL_CLASS_NAMES } from "@/components/dashboard/reference-dashboard-tokens";
import { cn } from "@/lib/utils";

type MediaLibraryRecoveryKind = "empty" | "error" | "filtered" | "storage";

function MediaLibraryRecoveryState({
  className,
  errorMessage,
  isPicker = false,
  kind,
  mediaLabel,
  onClear,
  onRetry,
  onUpload,
}: {
  className?: string;
  errorMessage?: string | null;
  isPicker?: boolean;
  kind: MediaLibraryRecoveryKind;
  mediaLabel: string;
  onClear?: () => void;
  onRetry?: () => void;
  onUpload?: () => void;
}) {
  const mediaName = mediaLabel.toLowerCase();
  const isFiltered = kind === "filtered";
  const isStorageUnavailable = kind === "storage";
  const Icon = kind === "error" ? AlertCircle : isStorageUnavailable ? ImageOff : isFiltered ? Search : FileImage;
  const title = kind === "error"
    ? "Library media belum dapat dibuka"
    : isStorageUnavailable
      ? "Penyimpanan media tidak tersedia"
      : isFiltered
        ? `${mediaLabel[0]?.toUpperCase() ?? "M"}${mediaLabel.slice(1)} tidak ditemukan`
        : `Belum ada ${mediaName}`;
  const description = kind === "error"
    ? errorMessage || "Koneksi ke library media belum berhasil. Coba lagi untuk memuat ulang daftar media."
    : isStorageUnavailable
      ? "Penyimpanan R2 belum dikonfigurasi, jadi upload dan preview media belum dapat digunakan. Coba lagi atau hubungi pemilik operasi setelah storage dikonfigurasi."
      : isFiltered
      ? "Tidak ada media yang cocok dengan pencarian atau filter ini. Hapus filter untuk melihat isi library."
        : onUpload
          ? `Belum ada ${mediaName} di folder ini. Upload ${mediaName} untuk mulai menyusun library.`
          : `Belum ada ${mediaName} di folder ini. Upload ${mediaName} setelah penyimpanan tersedia.`;

  return (
    <section
      aria-label={title}
      className={cn("flex min-h-[16rem] flex-col items-center justify-center rounded-3xl border border-dashed border-primary-200 bg-primary-50/25 px-5 py-10 text-center", className)}
      role={kind === "error" ? "alert" : "status"}
    >
      <div className={cn("mb-4 flex size-12 items-center justify-center rounded-2xl", kind === "error" ? "bg-student-status-danger-bg text-student-status-danger-fg" : isStorageUnavailable ? "bg-student-status-attention-bg text-student-status-attention-fg" : "bg-primary-50 text-primary-700")}>
        <Icon aria-hidden="true" className="size-6" />
      </div>
      <h2 className="text-base font-semibold text-secondary-900">{title}</h2>
      <p className="mt-2 max-w-[44ch] text-sm leading-6 text-secondary-600">{description}</p>
      <div className="mt-5 flex flex-wrap items-center justify-center gap-2">
        {isFiltered && onClear ? (
          <Button onClick={onClear} variant="brandOutline">
            Hapus pencarian/filter
          </Button>
        ) : null}
        {isStorageUnavailable && onRetry ? (
          <Button onClick={onRetry} variant="brandOutline">
            <RefreshCw data-icon="inline-start" />
            Coba lagi
          </Button>
        ) : null}
        {kind === "error" && onRetry ? (
          <Button onClick={onRetry} variant="brand">
            <RefreshCw data-icon="inline-start" />
            Coba lagi
          </Button>
        ) : null}
        {kind === "empty" && onUpload ? (
          <Button className={isPicker ? REFERENCE_CONTROL_CLASS_NAMES.file : undefined} onClick={onUpload} variant="brand">
            <Upload data-icon="inline-start" />
            Upload {mediaName}
          </Button>
        ) : null}
      </div>
    </section>
  );
}

export { MediaLibraryRecoveryState };
export type { MediaLibraryRecoveryKind };
