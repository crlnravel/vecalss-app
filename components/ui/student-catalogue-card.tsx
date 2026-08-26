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

type StudentCatalogueCardFrameProps = Omit<
  React.ComponentProps<"article">,
  "className"
> & {
  className?: string;
  variant: StudentCatalogueCardVariant;
};

function StudentCatalogueCardFrame({
  className,
  variant,
  ...props
}: StudentCatalogueCardFrameProps) {
  return (
    <article
      data-content-variant={variant}
      data-slot="student-catalogue-card"
      className={cn(studentCatalogueCardVariants({ variant }), className)}
      {...props}
    />
  );
}

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
  StudentCatalogueCardFrame,
  StudentCatalogueCard,
};
export type {
  StudentCatalogueCardFrameProps,
  StudentCatalogueCardProps,
  StudentCatalogueCardVariant,
};
