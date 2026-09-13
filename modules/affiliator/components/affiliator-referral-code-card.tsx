"use client";

import { useState } from "react";

import { Button } from "@/components/ui/button";
import { Check, Copy } from "@/lib/icons";

function AffiliatorReferralCodeCard({
  code,
  isActive,
}: {
  code: string;
  isActive: boolean;
}) {
  const [copied, setCopied] = useState(false);

  async function copyCode() {
    if (!isActive || !navigator.clipboard) return;

    try {
      await navigator.clipboard.writeText(code);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1800);
    } catch {
      setCopied(false);
    }
  }

  return (
    <div className="flex min-w-0 flex-col gap-3 rounded-3xl border border-primary-100 bg-primary-50/70 p-4 shadow-[inset_0_1px_0_color-mix(in_oklab,var(--voyage-surface)_80%,transparent),inset_0_-2px_8px_color-mix(in_oklab,var(--voyage-forest)_8%,transparent)] sm:flex-row sm:items-center sm:justify-between sm:gap-5">
      <div className="min-w-0">
        <p className="text-ui-xs font-semibold tracking-[0.12em] text-secondary-500 uppercase">
          {isActive ? "Kode aktif" : "Kode tidak aktif"}
        </p>
        <code className="mt-1 block truncate font-mono text-2xl font-semibold tracking-[0.12em] text-primary-900">
          {code}
        </code>
      </div>
      <Button
        aria-label={copied ? "Kode referral tersalin" : "Salin kode referral"}
        className="w-full sm:w-auto"
        disabled={!isActive}
        onClick={() => void copyCode()}
        type="button"
        variant="brand"
      >
        {copied ? <Check aria-hidden="true" /> : <Copy aria-hidden="true" />}
        <span aria-live="polite">{copied ? "Tersalin" : "Salin kode"}</span>
      </Button>
    </div>
  );
}

export { AffiliatorReferralCodeCard };
