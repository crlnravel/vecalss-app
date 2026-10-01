"use client";

import { useState } from "react";

import { Button } from "@/components/ui/button";
import { Check, Copy } from "@/lib/icons";

function isMaskedValue(value: string) {
  const normalized = value.trim();
  return !normalized || /^[*•·…]+$/u.test(normalized);
}

async function copyValueToClipboard(value: string) {
  try {
    await navigator.clipboard.writeText(value);
    return true;
  } catch {
    const textarea = document.createElement("textarea");
    textarea.value = value;
    textarea.setAttribute("aria-hidden", "true");
    textarea.style.position = "fixed";
    textarea.style.opacity = "0";
    document.body.appendChild(textarea);
    textarea.select();

    try {
      return document.execCommand("copy");
    } finally {
      textarea.remove();
    }
  }
}

function handleCopyValue({
  masked,
  setCopyBlocked,
  setCopied,
  value,
}: {
  masked: boolean;
  setCopyBlocked: (blocked: boolean) => void;
  setCopied: (copied: boolean) => void;
  value: string;
}) {
  if (masked) {
    setCopyBlocked(true);
    return;
  }

  void copyValueToClipboard(value).then((copied) => {
    if (!copied) return;
    setCopyBlocked(false);
    setCopied(true);
    window.setTimeout(() => setCopied(false), 1600);
  });
}

function CopyValueButtonLabel({ copied, copyBlocked, iconOnly, label, masked }: { copied: boolean; copyBlocked: boolean; iconOnly: boolean; label: string; masked: boolean }) {
  if (iconOnly) return null;

  return <span>{masked || copyBlocked ? "Tidak tersedia" : copied ? "Tersalin" : label}</span>;
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

  return (
    <Button
      aria-label={ariaLabel ?? (masked ? "Nilai tersamarkan tidak dapat disalin" : `${label} value`)}
      className={iconOnly ? "justify-center" : undefined}
      disabled={masked}
      onClick={() => handleCopyValue({ masked, setCopyBlocked, setCopied, value })}
      size={iconOnly ? "icon" : "default"}
      title={masked ? "Nilai tersamarkan tidak dapat disalin" : undefined}
      type="button"
      variant={iconOnly ? "outline" : "outline"}
    >
      {copied ? <Check aria-hidden="true" size={14} /> : <Copy aria-hidden="true" size={14} />}
      <CopyValueButtonLabel copied={copied} copyBlocked={copyBlocked} iconOnly={iconOnly} label={label} masked={masked} />
      <span aria-live="polite" className="sr-only">
        {masked ? "Nilai tersamarkan tidak dapat disalin." : copied ? "Nilai berhasil disalin." : ""}
      </span>
    </Button>
  );
}

export { CopyValueButton };
