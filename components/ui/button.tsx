import { Button as ButtonPrimitive } from "@base-ui/react/button";
import type { VariantProps } from "class-variance-authority";

import { cn } from "@/lib/utils";
import { buttonVariants } from "./button-variants";

function Button({
  className,
  nativeButton,
  render,
  variant = "default",
  size = "default",
  ...props
}: ButtonPrimitive.Props & VariantProps<typeof buttonVariants>) {
  return (
    <ButtonPrimitive
      data-slot="button"
      className={cn(
        buttonVariants({ variant, size, className }),
        "motion-reduce:translate-y-0 motion-reduce:transform-none motion-reduce:transition-none",
      )}
      nativeButton={render ? false : nativeButton}
      render={render}
      {...props}
    />
  );
}

export { Button };
