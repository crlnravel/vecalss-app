"use client";

import { useState, type ReactNode } from "react";
import { ReferenceSurface } from "@/components/dashboard/reference-dashboard-primitives";
import { buttonVariants } from "@/components/ui/button-variants";
import { ChevronDown } from "@/lib/icons";
import { cn } from "@/lib/utils";
import { StatusBadge } from "@/modules/mentor/KaptenTryoutStatusBadge";

/** Keep identity fields mounted while switching workspaces or closing details. */
export function TryoutIdentityHeader({
  children,
  compact = true,
  status,
  title,
}: {
  children: ReactNode;
  compact?: boolean;
  status: string;
  title: ReactNode;
}) {
  const [informationOpen, setInformationOpen] = useState(false);
  return (
    <ReferenceSurface as="section" aria-label="Informasi Tryout" className="grid min-w-0 w-full gap-3 p-5 sm:p-7">
      {title}
      <div><StatusBadge status={status} /></div>
      <details className="group/identity min-w-0" open={!compact || informationOpen}>
        <summary
          className={cn(buttonVariants({ variant: "outline" }), "w-fit max-w-full gap-2 text-sm [&::-webkit-details-marker]:hidden", !compact && "hidden")}
          onClick={(event) => {
            event.preventDefault();
            setInformationOpen((open) => !open);
          }}
        >
          Informasi Tryout
          <ChevronDown aria-hidden="true" className="size-4 shrink-0 transition-transform group-open/identity:rotate-180 motion-reduce:transition-none" />
        </summary>
        <div className={cn("grid min-w-0 gap-6", compact && "pt-4")}>{children}</div>
      </details>
    </ReferenceSurface>
  );
}
