import * as React from "react";

import {
  InputGroup,
  InputGroupAddon,
  InputGroupButton,
  InputGroupTextarea,
} from "@/components/ui/input-group";
import { ArrowUp, Stop } from "@/lib/icons";
import { cn } from "@/lib/utils";

/** Mirrors the AI Elements Prompt Input: a form around an input group, with a submit or stop action. */
export type PromptInputStatus = "ready" | "submitted" | "streaming" | "error";

function PromptInput({ className, ...props }: React.ComponentProps<"form">) {
  return <form className={cn("w-full", className)} {...props} />;
}

function PromptInputBody({ className, ...props }: React.ComponentProps<typeof InputGroup>) {
  return <InputGroup className={cn("h-auto rounded-3xl bg-card", className)} {...props} />;
}

/** Enter sends the message; Shift+Enter adds a line. */
function PromptInputTextarea({ className, onKeyDown, ...props }: React.ComponentProps<typeof InputGroupTextarea>) {
  return (
    <InputGroupTextarea
      className={cn("max-h-40 min-h-16 p-3", className)}
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

function PromptInputFooter({ className, ...props }: React.ComponentProps<typeof InputGroupAddon>) {
  return <InputGroupAddon align="block-end" className={cn("justify-between gap-2 px-3 pb-3", className)} {...props} />;
}

function PromptInputSubmit({
  status = "ready",
  onStop,
  disabled,
  className,
  ...props
}: Omit<React.ComponentProps<typeof InputGroupButton>, "onClick"> & {
  status?: PromptInputStatus;
  onStop?: () => void;
}) {
  if (status === "submitted" || status === "streaming") {
    return (
      <InputGroupButton
        aria-label="Hentikan jawaban"
        className={cn("rounded-full", className)}
        onClick={onStop}
        size="icon-sm"
        type="button"
        variant="outline"
        {...props}
      >
        <Stop weight="fill" />
      </InputGroupButton>
    );
  }
  return (
    <InputGroupButton
      aria-label="Kirim pesan"
      className={cn("rounded-full", className)}
      disabled={disabled}
      size="icon-sm"
      type="submit"
      variant="default"
      {...props}
    >
      <ArrowUp weight="bold" />
    </InputGroupButton>
  );
}

export { PromptInput, PromptInputBody, PromptInputFooter, PromptInputSubmit, PromptInputTextarea };
