import * as React from "react";
import Link from "next/link";

import { cn } from "@/lib/utils";
import { studentCatalogueCardVariants } from "./student-catalogue-card-variants";

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
};
export type {
  StudentCatalogueCardProps,
  StudentCatalogueCardVariant,
};
