"use client";

import { useState } from "react";

import { Button } from "@/components/ui/button";
import { Check, Copy } from "@/lib/icons";

function isMaskedValue(value: string) {
  const normalized = value.trim();
  return !normalized || /^[*•·…]+$/u.test(normalized);
}

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
  const [copyBlocked, setCopyBlocked] = useState(false);
  const masked = isMaskedValue(value);

  async function handleCopy() {
    if (masked) {
      setCopyBlocked(true);
      return;
    }

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
      setCopyBlocked(false);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1600);
    }
  }

  return (
    <Button
      aria-label={ariaLabel ?? (masked ? "Nilai tersamarkan tidak dapat disalin" : `${label} value`)}
      className={iconOnly ? "justify-center" : undefined}
      disabled={masked}
      onClick={() => void handleCopy()}
      size={iconOnly ? "icon" : "default"}
      title={masked ? "Nilai tersamarkan tidak dapat disalin" : undefined}
      type="button"
      variant={iconOnly ? "ghost" : "brandOutline"}
    >
      {copied ? <Check aria-hidden="true" size={14} /> : <Copy aria-hidden="true" size={14} />}
      {!iconOnly ? <span>{masked || copyBlocked ? "Tidak tersedia" : copied ? "Tersalin" : label}</span> : null}
      <span aria-live="polite" className="sr-only">
        {masked ? "Nilai tersamarkan tidak dapat disalin." : copied ? "Nilai berhasil disalin." : ""}
      </span>
    </Button>
  );
}

export { CopyValueButton };
