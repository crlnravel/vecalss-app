import { TypedRouteState } from "@/components/ui/typed-route-state";
import { buildAdminStudentPreviewRoute } from "@/lib/student/preview-routes";

type AdminStudentPreviewUnavailableVariant = "context" | "resource" | "unsupported";

const variantCopy: Record<AdminStudentPreviewUnavailableVariant, {
  context: string;
  kind: "error" | "unavailable";
  title: string;
}> = {
  context: {
    context: "Kembali ke halaman admin dan coba buka pratinjau lagi. Jika masih tidak tersedia, hubungi tim admin.",
    kind: "error",
    title: "Pratinjau siswa tidak tersedia",
  },
  resource: {
    context: "Kembali ke katalog untuk memilih konten yang tersedia.",
    kind: "unavailable",
    title: "Konten pratinjau tidak tersedia",
  },
  unsupported: {
    context: "Kembali ke beranda pratinjau untuk melanjutkan.",
    kind: "unavailable",
    title: "Pratinjau belum tersedia",
  },
};

function AdminStudentPreviewUnavailable({
  as,
  className,
  description,
  returnHref,
  returnLabel,
  variant,
}: {
  as?: "main" | "section";
  className?: string;
  description: string;
  returnHref?: string;
  returnLabel?: string;
  variant: AdminStudentPreviewUnavailableVariant;
}) {
  const copy = variantCopy[variant];
  const safeReturnHref = returnHref ?? (variant === "context" ? "/admin" : buildAdminStudentPreviewRoute("/"));
  const safeReturnLabel = returnLabel ?? (variant === "context" ? "Kembali ke admin" : "Kembali ke beranda pratinjau");

  return (
    <TypedRouteState
      as={as ?? (variant === "context" ? "main" : "section")}
      className={className ?? (variant === "context" ? "min-h-svh" : "min-h-[40svh]")}
      context={copy.context}
      description={description}
      kind={copy.kind}
      returnHref={safeReturnHref}
      returnLabel={safeReturnLabel}
      title={copy.title}
    />
  );
}

export { AdminStudentPreviewUnavailable };
export type { AdminStudentPreviewUnavailableVariant };
