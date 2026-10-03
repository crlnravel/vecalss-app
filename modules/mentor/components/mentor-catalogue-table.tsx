"use client";

import type { ReactNode } from "react";

import { DataTable, type DataTableProps } from "@/components/ui/data-table";
import { cn } from "@/lib/utils";

type MentorCatalogueTableProps<T> = DataTableProps<T> & {
  breadcrumb?: ReactNode;
  footer?: ReactNode;
  headerActions?: ReactNode;
  headingIcon?: ReactNode;
  wrapperClassName?: string;
};

function MentorCatalogueTable<T>({
  breadcrumb,
  footer,
  headerActions,
  headingIcon,
  wrapperClassName,
  ...tableProps
}: MentorCatalogueTableProps<T>) {
  return (
    <section
      className={cn("overflow-hidden rounded-2xl bg-white", wrapperClassName)}
    >
      {breadcrumb || headerActions || headingIcon ? (
        <div className="flex flex-wrap items-center gap-3 border-b border-primary-100 px-4 py-3 sm:px-5">
          {headingIcon ? (
            <span
              aria-hidden="true"
              className="grid size-9 shrink-0 place-items-center rounded-xl bg-primary-50 text-primary-800"
            >
              {headingIcon}
            </span>
          ) : null}
          {breadcrumb ? (
            <div className="min-w-0 flex-1">{breadcrumb}</div>
          ) : null}
        </div>
      ) : null}
      <DataTable {...tableProps} />
      {footer}
    </section>
  );
}

export { MentorCatalogueTable };
export type { MentorCatalogueTableProps };
