import Link from "next/link";
import type { ReactNode } from "react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { fieldControlClassName, fieldLabelClassName } from "@/components/ui/field-constants";
import { Textarea } from "@/components/ui/textarea";
import type { SessionContext } from "@/lib/auth/types";
import { Info } from "@/lib/icons";
import { cn } from "@/lib/utils";
import { PortalShell } from "@/modules/portal/components/portal-shell";

const SEVERITY_LABELS = { critical: "Kritis", high: "Tinggi", low: "Rendah", medium: "Sedang" } as const;
const SEVERITY_TONES = { critical: "danger", high: "danger", low: "neutral", medium: "attention" } as const;
const STATE_LABELS = { acknowledged: "Sudah dilihat", closed: "Ditutup", escalated: "Dieskalasi", open: "Baru" } as const;
const STATE_TONES = { acknowledged: "info", closed: "neutral", escalated: "attention", open: "danger" } as const;

function SeverityBadge({ severity }: { severity: keyof typeof SEVERITY_LABELS }) {
  return <Badge size="xs" tone={SEVERITY_TONES[severity]}>{SEVERITY_LABELS[severity]}</Badge>;
}

function StateBadge({ state }: { state: keyof typeof STATE_LABELS }) {
  return <Badge size="xs" tone={STATE_TONES[state]}>{STATE_LABELS[state]}</Badge>;
}

const dateTimeFormat = new Intl.DateTimeFormat("id-ID", { dateStyle: "medium", timeStyle: "short", timeZone: "Asia/Jakarta" });
const dateFormat = new Intl.DateTimeFormat("id-ID", { dateStyle: "medium", timeZone: "Asia/Jakarta" });

function formatDateTime(value: Date | string | null) {
  return value ? dateTimeFormat.format(new Date(value)) : "—";
}

function formatDate(value: Date | string | null) {
  return value ? dateFormat.format(new Date(value)) : "—";
}

const TABS = [
  { href: "/admin/fraud", id: "cases", label: "Kasus" },
  { href: "/admin/fraud/blocks", id: "blocks", label: "Blokir" },
  { href: "/admin/fraud/orders", id: "orders", label: "Pesanan" },
  { href: "/admin/fraud/report", id: "report", label: "Laporan bulanan" },
] as const;

function FraudPage({
  active,
  children,
  done,
  error,
  session,
  title,
}: {
  active: (typeof TABS)[number]["id"];
  children: ReactNode;
  done?: string;
  error?: string;
  session: SessionContext;
  title: string;
}) {
  return (
    <PortalShell activeAdminSection="fraud" audience="admin" description="Pantau kasus dan blokir yang menjaga pembayaran." session={session} title="Fraud">
      <section aria-labelledby="fraud-title" className="mx-auto w-full max-w-4xl">
        <header className="mb-4 space-y-1">
          <h1 className="font-heading text-xl font-semibold tracking-tight text-secondary-900" id="fraud-title">{title}</h1>
        </header>
        <div className="mb-6 min-w-0 overflow-x-auto [scrollbar-width:thin]">
          <nav aria-label="Bagian fraud" className="flex min-w-full w-max items-center gap-6 border-b border-primary-100">
            {TABS.map((tab) => (
              <Link
                aria-current={tab.id === active ? "page" : undefined}
                className={cn(
                  "inline-flex min-h-11 shrink-0 items-center border-b-2 border-transparent px-1 text-sm font-medium whitespace-nowrap text-secondary-600 transition-colors hover:text-primary-800 focus-visible:outline-none focus-visible:ring-3 focus-visible:ring-inset focus-visible:ring-primary-700/30 motion-reduce:transition-none",
                  tab.id === active && "border-primary-800 text-primary-900",
                )}
                href={tab.href}
                key={tab.id}
              >
                {tab.label}
              </Link>
            ))}
          </nav>
        </div>
        {done ? <p className="mb-4 flex items-start gap-2 text-sm leading-6 text-student-status-success-fg" role="status"><Info aria-hidden="true" className="mt-0.5 size-4 shrink-0" />{done}</p> : null}
        {error ? <p className="mb-4 flex items-start gap-2 text-sm leading-6 text-student-status-danger-fg" role="alert"><Info aria-hidden="true" className="mt-0.5 size-4 shrink-0" />{error}</p> : null}
        {children}
      </section>
    </PortalShell>
  );
}

function Panel({ children, title }: { children: ReactNode; title: string }) {
  return (
    <section className="mb-6 rounded-card border border-primary-100 bg-white p-4 sm:p-5">
      <h2 className="mb-3 font-heading text-base font-semibold text-secondary-900">{title}</h2>
      {children}
    </section>
  );
}

function Field({ children, label }: { children: ReactNode; label: string }) {
  return (
    <div className="min-w-0 space-y-0.5">
      <dt className="text-xs text-secondary-600">{label}</dt>
      <dd className="break-words text-sm font-medium leading-5 text-secondary-900 [overflow-wrap:anywhere]">{children}</dd>
    </div>
  );
}

/**
 * A small form that posts to a server action. Owner-only forms are disabled
 * for everyone else, with the reason said in words; the server refuses either
 * way, so disabling is a courtesy, not the control.
 */
function ReasonForm({
  action,
  children,
  disabled,
  disabledNote,
  hidden,
  label,
  submit,
  tone = "default",
}: {
  action: (form: FormData) => Promise<void>;
  children?: ReactNode;
  disabled?: boolean;
  disabledNote?: string;
  hidden: Record<string, string | number>;
  label: string;
  submit: string;
  tone?: "default" | "destructive" | "outline";
}) {
  return (
    <form action={action} className="min-w-0 space-y-2 rounded-control border border-primary-100 p-3">
      {Object.entries(hidden).map(([name, value]) => <input key={name} name={name} type="hidden" value={value} />)}
      <fieldset className="min-w-0 space-y-2" disabled={disabled}>
        <legend className={cn(fieldLabelClassName, "mb-1")}>{label}</legend>
        {children}
        <label className="sr-only" htmlFor={`reason-${submit}-${Object.values(hidden).join("-")}`}>Alasan tertulis</label>
        <Textarea
          className={cn(fieldControlClassName, "min-h-20")}
          id={`reason-${submit}-${Object.values(hidden).join("-")}`}
          maxLength={500}
          minLength={10}
          name="reason"
          placeholder="Tulis alasannya (10 sampai 500 karakter)"
          required
        />
        <Button type="submit" variant={tone}>{submit}</Button>
      </fieldset>
      {disabled && disabledNote ? <p className="text-xs leading-5 text-secondary-600">{disabledNote}</p> : null}
    </form>
  );
}

const OWNER_ONLY_NOTE = "Hanya pemilik yang bisa melakukan ini.";
const OWNER_UNSET_NOTE = "Pemilik belum ditetapkan di pengaturan server, jadi tindakan ini dikunci.";

function ownerNote(authority: { isOwner: boolean; ownerConfigured: boolean }) {
  return authority.ownerConfigured ? OWNER_ONLY_NOTE : OWNER_UNSET_NOTE;
}

function firstParam(value: string | string[] | undefined) {
  return Array.isArray(value) ? value[0] : value;
}

export {
  Field,
  formatDate,
  formatDateTime,
  FraudPage,
  firstParam,
  ownerNote,
  Panel,
  ReasonForm,
  SEVERITY_LABELS,
  SeverityBadge,
  StateBadge,
};
