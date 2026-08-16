"use client";

import { useState } from "react";

import { Check, Copy } from "@/lib/icons";

function CopyValueButton({
  ariaLabel,
  label = "Copy",
  value,
}: {
  ariaLabel?: string;
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
    <button
      aria-label={ariaLabel ?? `${label} value`}
      className="inline-flex min-h-9 shrink-0 items-center gap-1.5 rounded-lg border border-primary-200 bg-white px-2.5 text-xs font-semibold text-primary-800 transition-colors hover:border-primary-300 hover:bg-primary-50 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary-300"
      onClick={() => void handleCopy()}
      type="button"
    >
      {copied ? <Check aria-hidden="true" size={14} /> : <Copy aria-hidden="true" size={14} />}
      <span>{copied ? "Copied" : label}</span>
    </button>
  );
}

export { CopyValueButton };
