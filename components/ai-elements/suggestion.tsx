import * as React from "react";

import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

/** Horizontal row of starter prompts. It scrolls sideways on narrow screens instead of wrapping. */
function Suggestions({ className, ...props }: React.ComponentProps<"div">) {
  return <div className={cn("flex gap-2 overflow-x-auto pb-1", className)} {...props} />;
}

function Suggestion({
  suggestion,
  onClick,
  className,
  ...props
}: Omit<React.ComponentProps<typeof Button>, "onClick"> & {
  suggestion: string;
  onClick?: (suggestion: string) => void;
}) {
  return (
    <Button
      className={cn("shrink-0 rounded-full", className)}
      onClick={() => onClick?.(suggestion)}
      size="sm"
      type="button"
      variant="outline"
      {...props}
    >
      {suggestion}
    </Button>
  );
}

export { Suggestion, Suggestions };
