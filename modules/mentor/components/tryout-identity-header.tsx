import type { ReactNode } from "react";
import { ReferenceSurface } from "@/components/dashboard/reference-dashboard-primitives";
import { StatusBadge } from "@/modules/mentor/KaptenTryoutStatusBadge";

/** Title, status, and the banner + description, always visible on every workspace tab. */
export function TryoutIdentityHeader({
  children,
  status,
  title,
}: {
  children: ReactNode;
  status: string;
  title: ReactNode;
}) {
  return (
    <ReferenceSurface as="section" aria-label="Informasi Tryout" className="grid min-w-0 w-full gap-3 p-5 sm:p-7">
      {title}
      <div><StatusBadge status={status} /></div>
      <div className="grid min-w-0 gap-6 pt-1">{children}</div>
    </ReferenceSurface>
  );
}
