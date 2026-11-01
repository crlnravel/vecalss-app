"use client";

import { useState } from "react";

import { ReferenceSurface } from "@/components/dashboard";
import { Button } from "@/components/ui/button";
import { Check, Copy, Link2 } from "@/lib/icons";

type CopyTarget = "code" | "link";

function AffiliatorReferralCodeCard({
  code,
  isActive,
  referralLink,
}: {
  code: string;
  isActive: boolean;
  referralLink: string;
}) {
  const [copied, setCopied] = useState<CopyTarget | null>(null);

  async function copyValue(target: CopyTarget) {
    if (!isActive || !navigator.clipboard) return;

    try {
      await navigator.clipboard.writeText(target === "code" ? code : referralLink);
      setCopied(target);
      window.setTimeout(() => setCopied(null), 1800);
    } catch {
      setCopied(null);
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
      <div className="flex shrink-0 flex-wrap gap-2">
        <Button
          aria-label={copied === "code" ? "Kode referral tersalin" : "Salin kode referral"}
          disabled={!isActive}
          onClick={() => void copyValue("code")}
          type="button"
          variant="outline"
          size="sm"
        >
          {copied === "code" ? <Check aria-hidden="true" /> : <Copy aria-hidden="true" />}
          <span aria-live="polite">{copied === "code" ? "Tersalin" : "Salin kode"}</span>
        </Button>
        <Button
          aria-label={copied === "link" ? "Tautan referral tersalin" : "Salin tautan referral"}
          disabled={!isActive}
          onClick={() => void copyValue("link")}
          type="button"
          variant="outline"
          size="sm"
        >
          {copied === "link" ? <Check aria-hidden="true" /> : <Link2 aria-hidden="true" />}
          <span aria-live="polite">{copied === "link" ? "Tersalin" : "Salin tautan"}</span>
        </Button>
      </div>
    </ReferenceSurface>
  );
}

export { AffiliatorReferralCodeCard };
