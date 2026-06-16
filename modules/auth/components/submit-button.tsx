"use client";

import { useFormStatus } from "react-dom";

import { Button } from "@/components/ui/button";

function SubmitButton({
  children,
  pendingLabel,
  ...props
}: React.ComponentProps<typeof Button> & {
  pendingLabel?: string;
}) {
  const { pending } = useFormStatus();

  return (
    <Button
      aria-disabled={pending}
      disabled={pending}
      {...props}
    >
      {pending ? (pendingLabel ?? "Working...") : children}
    </Button>
  );
}

export { SubmitButton };
