"use client";

import { useState } from "react";

import { Button } from "@/components/ui/button";
import { Check, Copy } from "@/lib/icons";

function CopyValueButton({
  ariaLabel,
  iconOnly = false,
   label = "Salin",
  value,
}: {
  ariaLabel?: string;
  iconOnly?: boolean;
  label?: string;
  value: string;
}) {
  const [copied, setCopied] = useState(false);

  async function handleCopy() {
    let didCopy = false;

    try {
      await navigator.clipboard.writeText(value);
      didCopy = true;
    } catch {
      const textarea = document.createElement("textarea");
      textarea.value = value;
      textarea.setAttribute("aria-hidden", "true");
      textarea.style.position = "fixed";
      textarea.style.opacity = "0";
      document.body.appendChild(textarea);
      textarea.select();

      try {
        didCopy = document.execCommand("copy");
      } finally {
        textarea.remove();
      }
    }

    if (didCopy) {
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1600);
    }
  }

  return (
    <Button
      aria-label={ariaLabel ?? `${label} value`}
      className={iconOnly ? "justify-center" : undefined}
      onClick={() => void handleCopy()}
      size={iconOnly ? "icon-sm" : "sm"}
      type="button"
      variant={iconOnly ? "ghost" : "brandOutline"}
    >
      {copied ? <Check aria-hidden="true" size={14} /> : <Copy aria-hidden="true" size={14} />}
       {!iconOnly ? <span>{copied ? "Tersalin" : label}</span> : null}
    </Button>
  );
}

export { CopyValueButton };
