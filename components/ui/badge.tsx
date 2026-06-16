import { cva, type VariantProps } from "class-variance-authority";

import { cn } from "@/lib/utils";

const badgeVariants = cva(
  "inline-flex items-center rounded-[7px] px-[7px] font-medium leading-none whitespace-nowrap",
  {
    variants: {
      variant: {
        accent: "bg-accent-300 text-secondary-900",
        mint: "bg-primary-200 text-secondary-900",
        neutral: "bg-white text-secondary-900",
      },
      size: {
        section: "text-[32px] md:text-[40px]",
        card: "text-[24px] md:text-[30px]",
        footer: "text-[20px] leading-[26px]",
      },
    },
    defaultVariants: {
      variant: "accent",
      size: "card",
    },
  },
);

type BadgeProps = React.ComponentProps<"span"> & VariantProps<typeof badgeVariants>;

function Badge({ className, size, variant, ...props }: BadgeProps) {
  return (
    <span
      data-slot="badge"
      className={cn(badgeVariants({ variant, size }), className)}
      {...props}
    />
  );
}

export { Badge, badgeVariants };
