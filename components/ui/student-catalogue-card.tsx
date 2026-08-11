import * as React from "react";
import Link from "next/link";
import { cva } from "class-variance-authority";

import { cn } from "@/lib/utils";

const studentCatalogueCardVariants = cva(
  "group relative min-w-0 overflow-hidden rounded-[2rem] border border-primary-100 outline-none shadow-[0_18px_42px_-34px_rgba(23,107,77,0.48)] transition-[border-color,box-shadow] duration-300 hover:border-primary-200 hover:shadow-[0_24px_52px_-30px_rgba(23,107,77,0.55)] focus-visible:ring-4 focus-visible:ring-primary-400/30 motion-reduce:transition-none",
  {
    variants: {
      variant: {
        materi:
          "grid min-h-[10.5rem] grid-cols-1 bg-[linear-gradient(110deg,#ffffff_0%,#ffffff_68%,#f1faf4_100%)] p-5 text-secondary-900 md:grid-cols-[5rem_minmax(0,1fr)_3rem] md:items-center md:gap-7 md:p-7",
        kuis:
          "flex min-h-[246px] flex-col bg-primary-100 p-6 text-primary-900 md:min-h-[270px] md:p-7",
        tryout: "flex flex-col bg-white",
      },
    },
  },
);

type StudentCatalogueCardVariant = "materi" | "kuis" | "tryout";

type StudentCatalogueCardProps = Omit<
  React.ComponentProps<typeof Link>,
  "className"
> & {
  className?: string;
  variant: StudentCatalogueCardVariant;
};

function StudentCatalogueCard({
  className,
  variant,
  ...props
}: StudentCatalogueCardProps) {
  return (
    <Link
      data-content-variant={variant}
      data-slot="student-catalogue-card"
      className={cn(studentCatalogueCardVariants({ variant }), className)}
      {...props}
    />
  );
}

export {
  StudentCatalogueCard,
  studentCatalogueCardVariants,
};
export type {
  StudentCatalogueCardProps,
  StudentCatalogueCardVariant,
};
