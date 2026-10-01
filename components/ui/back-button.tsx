import type { ComponentProps, ReactNode } from "react";
import Link from "next/link";

import { ChevronLeft } from "@/lib/icons";

import { Button } from "./button";

type BackButtonProps = Omit<
  ComponentProps<typeof Button>,
  "aria-label" | "children" | "nativeButton" | "render" | "title"
> & {
  children?: ReactNode;
  href: string;
  label: string;
};

function BackButton({
  children = <ChevronLeft aria-hidden="true" />,
  href,
  label,
  size = "icon",
  variant,
  ...props
}: BackButtonProps) {
  return (
    <Button
      aria-label={label}
      nativeButton={false}
      render={<Link href={href} />}
      size={size}
      title={label}
      variant={variant ?? (size?.startsWith("icon") ? "quiet" : "outline")}
      {...props}
    >
      {children}
    </Button>
  );
}

export { BackButton };
export type { BackButtonProps };
