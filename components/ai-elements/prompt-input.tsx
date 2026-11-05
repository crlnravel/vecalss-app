import * as React from "react";

import { Button } from "@/components/ui/button";
import { fieldControlClassName } from "@/components/ui/field-constants";
import { ArrowUp, Stop } from "@/lib/icons";
import { cn } from "@/lib/utils";

/** Mirrors the AI Elements Prompt Input: a white card around a sunken field, with a submit or stop action. */
export type PromptInputStatus = "ready" | "submitted" | "streaming" | "error";

function PromptInput({ className, ...props }: React.ComponentProps<"form">) {
  return <form className={cn("w-full", className)} {...props} />;
}

function PromptInputBody({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      className={cn(
        "flex min-w-0 flex-col gap-2 rounded-card border border-primary-100 bg-white p-2 shadow-[0_18px_42px_-34px_color-mix(in_oklab,var(--voyage-forest)_48%,transparent)]",
        className,
      )}
      {...props}
    />
  );
}

/** Enter sends the message; Shift+Enter adds a line. */
function PromptInputTextarea({ className, onKeyDown, ...props }: React.ComponentProps<"textarea">) {
  return (
    <textarea
      className={cn(fieldControlClassName, "field-sizing-content max-h-40 resize-none", className)}
      onKeyDown={(event) => {
        onKeyDown?.(event);
        if (event.defaultPrevented) return;
        if (event.key === "Enter" && !event.shiftKey && !event.nativeEvent.isComposing) {
          event.preventDefault();
          event.currentTarget.form?.requestSubmit();
        }
      }}
      {...props}
    />
  );
}

function PromptInputFooter({ className, ...props }: React.ComponentProps<"div">) {
  return <div className={cn("flex items-center justify-between gap-2", className)} {...props} />;
}

function PromptInputSubmit({
  status = "ready",
  onStop,
  disabled,
  className,
  ...props
}: Omit<React.ComponentProps<typeof Button>, "onClick"> & {
  status?: PromptInputStatus;
  onStop?: () => void;
}) {
  if (status === "submitted" || status === "streaming") {
    return (
      <Button
        aria-label="Hentikan jawaban"
        className={cn("shrink-0", className)}
        onClick={onStop}
        size="icon"
        type="button"
        variant="outline"
        {...props}
      >
        <Stop weight="fill" />
      </Button>
    );
  }
  return (
    <Button
      aria-label="Kirim pesan"
      className={cn("shrink-0", className)}
      disabled={disabled}
      size="icon"
      type="submit"
      variant="default"
      {...props}
    >
      <ArrowUp weight="bold" />
    </Button>
  );
}

export { PromptInput, PromptInputBody, PromptInputFooter, PromptInputSubmit, PromptInputTextarea };
