"use client";

import { useState } from "react";

import { ReferenceSurface } from "@/components/dashboard";
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
    <ReferenceSurface
      aria-label="Kode referral"
      className="flex min-w-0 flex-wrap items-center justify-between gap-4 p-5 sm:p-6"
      variant="inset"
    >
      <div className="min-w-0">
        <p className="text-sm text-secondary-500">Kode referral</p>
        <div className="mt-1 flex min-w-0 items-center gap-3">
          <code className="truncate font-mono text-xl font-semibold tracking-[0.12em] text-primary-900">
            {code}
          </code>
          <span className="shrink-0 text-xs text-secondary-500">
            {isActive ? "Aktif" : "Nonaktif"}
          </span>
        </div>
      </div>
      <Button
        aria-label={copied ? "Kode referral tersalin" : "Salin kode referral"}
        className="shrink-0"
        disabled={!isActive}
        onClick={() => void copyCode()}
        type="button"
        variant="brandOutline"
        size="sm"
      >
        {copied ? <Check aria-hidden="true" /> : <Copy aria-hidden="true" />}
        <span aria-live="polite">{copied ? "Tersalin" : "Salin kode"}</span>
      </Button>
    </ReferenceSurface>
  );
}

export { AffiliatorReferralCodeCard };
