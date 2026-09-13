import { TypedRouteState } from "@/components/ui/typed-route-state";
import { buildAdminStudentPreviewRoute } from "@/lib/student/preview-routes";

type AdminStudentPreviewUnavailableVariant = "context" | "resource" | "unsupported";

const variantCopy: Record<AdminStudentPreviewUnavailableVariant, {
  context: string;
  kind: "error" | "unavailable";
  title: string;
}> = {
  context: {
    context: "Kembali ke Admin untuk memperbaiki capability atau fixture preview yang dikelola.",
    kind: "error",
    title: "Preview siswa tidak tersedia",
  },
  resource: {
    context: "Context siswa preview tetap aman. Kembali ke katalog untuk memilih resource yang tersedia.",
    kind: "unavailable",
    title: "Konten preview tidak tersedia",
  },
  unsupported: {
    context: "Context siswa preview tetap aman. Kembali ke Beranda preview untuk melanjutkan dari surface yang didukung.",
    kind: "unavailable",
    title: "Surface preview belum didukung",
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
  const safeReturnLabel = returnLabel ?? (variant === "context" ? "Kembali ke admin" : "Kembali ke Beranda preview");

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
