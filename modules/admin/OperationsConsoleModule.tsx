"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useActionState, useCallback, useEffect, useRef, useState } from "react";
import {
  Activity,
  ArrowUpRight,
  CheckCircle2,
  ChevronRight,
  CircleAlert,
  Clock3,
  FileClock,
  RefreshCw,
  ShieldCheck,
  UserPlus,
  Users,
  X,
} from "lucide-react";

import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import type { ExamEvent } from "@/generated/prisma/client";
import type {
  AdminOperationsSnapshot,
  OperationsAttentionItem,
  OperationsRecentImport,
} from "@/lib/admin/operations";
import {
  removeResolvedAttentionItems,
  replaceReissuedHandoff,
} from "@/lib/admin/operations/attention";
import { FormNotice } from "@/modules/auth/components/form-notice";
import { EMPTY_FORM_STATE } from "@/modules/auth/form-state";

import {
  acknowledgeEnrollmentHandoffAction,
  reissueEnrollmentHandoffAction,
} from "./actions";
import { CreateKaptenForm } from "./components/create-kapten-form";
import { CreateStudentForm } from "./components/create-student-form";
import { findVisibleFocusTarget, firstVisibleFocusTarget, isVisibleFocusTarget } from "./components/focus-target";
import { HandoffDeliveryNotice } from "./components/handoff-delivery-notice";

type OperationKey = "add-student" | "add-kapten" | "import-roster" | "exceptions";

const SNAPSHOT_STALE_AFTER_MS = 5 * 60 * 1000;

const operationLabels: Record<OperationKey, { detail: string; label: string }> = {
  "add-kapten": {
    detail: "Provision a tutor role and profile",
    label: "Add Kapten",
  },
  "add-student": {
    detail: "Create a student account and handoff",
    label: "Add student",
  },
  exceptions: {
    detail: "Resolve handoffs and imports needing a decision",
    label: "Review exceptions",
  },
  "import-roster": {
    detail: "Start a role-scoped roster import",
    label: "Import roster",
  },
};

function formatDate(value: string) {
  return new Intl.DateTimeFormat("en-US", {
    dateStyle: "medium",
    timeStyle: "short",
    timeZone: "UTC",
  }).format(new Date(value));
}

type SnapshotStatus = "checking" | "fresh" | "stale" | "error";

function getSnapshotAgeMs(value: string, now = Date.now()) {
  const timestamp = Date.parse(value);
  return Number.isFinite(timestamp) ? Math.max(0, now - timestamp) : Number.POSITIVE_INFINITY;
}

function SnapshotStatusBar({
  lastUpdatedAt,
  refreshHref,
}: {
  lastUpdatedAt: string;
  refreshHref: string;
}) {
  const [status, setStatus] = useState<SnapshotStatus>("checking");

  useEffect(() => {
    const checkAge = () => {
      const age = getSnapshotAgeMs(lastUpdatedAt);
      setStatus(
        age === Number.POSITIVE_INFINITY
          ? "error"
          : age >= SNAPSHOT_STALE_AFTER_MS
            ? "stale"
            : "fresh",
      );
    };

    checkAge();
    const interval = window.setInterval(checkAge, 30_000);
    return () => window.clearInterval(interval);
  }, [lastUpdatedAt]);

  const timestamp = Number.isFinite(Date.parse(lastUpdatedAt))
    ? `Last read ${formatDate(lastUpdatedAt)} UTC`
    : "Last read unavailable";
  const statusLabel = status === "stale"
    ? "Snapshot stale"
    : status === "error"
      ? "Snapshot time unavailable"
      : status === "checking"
        ? "Checking snapshot"
        : "Snapshot current";
  const statusClassName = status === "stale"
    ? "border-[#ead899] bg-[#fff5cf] text-[#725400]"
    : status === "error"
      ? "border-[#e3c2bb] bg-[#fff0ee] text-[#8b3f32]"
      : "border-white/15 bg-white/[0.08] text-[#c8e7d0]";
  const dotClassName = status === "stale"
    ? "bg-[#c49212]"
    : status === "error"
      ? "bg-[#b25343]"
      : "bg-[#91d6a5]";

  return (
    <div aria-live="polite" className={`flex flex-wrap items-center justify-end gap-x-2 gap-y-1 rounded-xl border px-3 py-2 text-xs ${statusClassName}`}>
      <span aria-hidden="true" className={`size-2 rounded-full ${dotClassName}`} />
      <span className="font-semibold">{statusLabel}</span>
      <span className="text-[0.72rem] opacity-85">{timestamp}</span>
      {status === "stale" ? <span className="basis-full text-[0.72rem]">Refresh before acting on this queue.</span> : null}
      {status === "error" ? <span className="basis-full text-[0.72rem]">Retry to recover the read timestamp.</span> : null}
      <Link
        aria-label="Refresh operations snapshot"
        className="ml-1 inline-flex min-h-11 items-center gap-1.5 rounded-lg px-2 font-bold text-current hover:bg-black/5 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#91d6a5]"
        href={refreshHref}
      >
        <RefreshCw size={14} />
        Refresh
      </Link>
    </div>
  );
}

function MetricCard({
  accent,
  detail,
  label,
  value,
}: {
  accent: "mint" | "pending" | "sun";
  detail: string;
  label: string;
  value: number;
}) {
  return (
    <article className="relative min-w-0 overflow-hidden rounded-[18px] border border-white/15 bg-white/[0.075] px-3 py-4 sm:px-5">
      <span
        aria-hidden="true"
        className={`absolute right-4 top-4 size-2.5 rounded-full ${accent === "sun" ? "bg-[#ffd766]" : accent === "pending" ? "bg-[#ffd766]" : "bg-[#91d6a5]"}`}
      />
      <p className="max-w-[16ch] break-words text-xs font-bold uppercase tracking-[0.13em] text-[#c8e7d0]">{label}</p>
      <p className="mt-3 text-2xl font-bold leading-none tracking-[-0.04em] text-white sm:text-3xl xl:text-4xl">{value.toLocaleString("en-US")}</p>
      <p className="mt-1.5 break-words text-xs leading-5 text-[#a9d0b5]">{detail}</p>
    </article>
  );
}

function OperationControl({
  active,
  count,
  icon: Icon,
  onSelect,
  operation,
}: {
  active: boolean;
  count?: number;
  icon: typeof UserPlus;
  onSelect: () => void;
  operation: OperationKey;
}) {
  const { detail, label } = operationLabels[operation];

  return (
    <button
      aria-pressed={active}
      className={`group flex min-h-[88px] items-center gap-3 rounded-[18px] border px-4 py-3 text-left transition-[background-color,border-color,box-shadow,transform] duration-150 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#73bc8a] ${active ? "-translate-y-0.5 border-[#73bc8a] bg-[#e8f5eb] shadow-[0_18px_34px_-30px_rgba(1,76,56,0.8)]" : "border-[#d6e5db] bg-white hover:-translate-y-0.5 hover:border-[#a9d0b5] hover:bg-[#f8fcf9]"}`}
      onClick={onSelect}
      type="button"
    >
      <span className={`grid size-10 shrink-0 place-items-center rounded-xl ${active ? "bg-[#014c38] text-white" : "bg-[#eef8f1] text-[#176b4d]"}`}>
        <Icon size={18} strokeWidth={1.8} />
      </span>
      <span className="min-w-0 flex-1">
        <span className="flex items-center gap-2 text-sm font-bold text-[#173c2d]">
          {label}
          {typeof count === "number" ? (
            <span className={`rounded-full px-2 py-0.5 text-xs font-bold ${count > 0 ? "bg-[#fff0bc] text-[#725400]" : "bg-[#eef8f1] text-[#176b4d]"}`}>
              {count}
            </span>
          ) : null}
        </span>
        <span className="mt-1 block text-xs leading-5 text-[#5f776a]">{detail}</span>
      </span>
      <ChevronRight aria-hidden="true" className="shrink-0 text-[#8aa997] transition-transform group-hover:translate-x-0.5" size={17} />
    </button>
  );
}

function AttentionRow({
  item,
  onOpen,
}: {
  item: OperationsAttentionItem;
  onOpen: (item: OperationsAttentionItem, trigger: HTMLButtonElement) => void;
}) {
  return (
    <button
      className="group flex min-h-16 w-full items-center gap-3 border-b border-[#e7f0ea] px-1 py-3 text-left last:border-b-0 focus-visible:rounded-xl focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#73bc8a]"
      data-attention-row="true"
      data-attention-trigger="true"
      onClick={(event) => onOpen(item, event.currentTarget)}
      type="button"
    >
      <span aria-hidden="true" className={`grid size-9 shrink-0 place-items-center rounded-xl ${item.kind === "import" ? "bg-[#fff5cf] text-[#725400]" : "bg-[#eef8f1] text-[#176b4d]"}`}>
        {item.kind === "import" ? <FileClock size={16} /> : <Clock3 size={16} />}
      </span>
      <span className="min-w-0 flex-1">
        <span className="flex flex-wrap items-center gap-x-2 gap-y-1">
          <span className="truncate text-sm font-bold text-[#173c2d]">{item.title}</span>
          <span className={`rounded-full px-2 py-0.5 text-xs font-bold ${item.kind === "import" ? "bg-[#fff5cf] text-[#725400]" : "bg-[#eef8f1] text-[#176b4d]"}`}>
            {item.statusLabel}
          </span>
        </span>
        <span className="mt-1 block truncate text-xs text-[#5f776a]">{item.detail}</span>
      </span>
      <span className="hidden shrink-0 text-xs text-[#8aa997] sm:block">{formatDate(item.createdAt)}</span>
      <ChevronRight aria-hidden="true" className="shrink-0 text-[#8aa997] transition-transform group-hover:translate-x-0.5" size={16} />
    </button>
  );
}

function AttentionList({
  attention,
  attentionTotal,
  onOpen,
}: {
  attention: OperationsAttentionItem[];
  attentionTotal: number;
  onOpen: (item: OperationsAttentionItem, trigger: HTMLButtonElement) => void;
}) {
  if (attention.length === 0) {
    const hasRemainingAttention = attentionTotal > 0;

    return (
      <div className="mt-5 rounded-[18px] border border-dashed border-[#c9dfd0] bg-[#f8fcf9] px-4 py-6 text-center focus:outline-2 focus:outline-offset-2 focus:outline-[#73bc8a]" data-attention-queue-notice="true" tabIndex={-1}>
        <CheckCircle2 className="mx-auto text-[#2f8a5d]" size={21} />
        <p className="mt-2 text-sm font-bold text-[#173c2d]">{hasRemainingAttention ? "No more items in this slice" : "No attention items right now"}</p>
        <p className="mt-1 text-xs leading-5 text-[#5f776a]">
          {hasRemainingAttention
            ? `${attentionTotal} ${attentionTotal === 1 ? "item remains" : "items remain"} in the queue outside this visible slice. Refresh to load the latest signals.`
            : "New handoffs and imports will appear here when a decision is needed."}
        </p>
      </div>
    );
  }

  return (
    <div className="mt-4">
      {attention.map((item) => <AttentionRow item={item} key={`${item.kind}-${item.id}`} onOpen={onOpen} />)}
    </div>
  );
}

function attentionQueueSummary(displayedCount: number, total: number) {
  if (total === 0) {
    return "No attention items";
  }

  return total > displayedCount ? `Showing ${displayedCount} of ${total}` : `${total} open`;
}

function AttentionPanel({
  attention,
  attentionTotal,
  onOpen,
}: {
  attention: OperationsAttentionItem[];
  attentionTotal: number;
  onOpen: (item: OperationsAttentionItem, trigger: HTMLButtonElement) => void;
}) {
  const queueSummary = attentionQueueSummary(attention.length, attentionTotal);

  return (
    <section className="rounded-[22px] border border-[#d6e5db] bg-white p-5 shadow-[0_20px_46px_-42px_rgba(1,76,56,0.6)] sm:p-6">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h2 className="text-xl font-bold tracking-[-0.03em] text-[#173c2d] focus:outline-2 focus:outline-offset-2 focus:outline-[#73bc8a]" id="attention-queue-heading" tabIndex={-1}>Attention queue</h2>
          <p className="mt-1 max-w-[55ch] text-sm leading-6 text-[#5f776a]">Open a row to see the smallest next action without rebuilding the context.</p>
        </div>
        <span className="hidden items-center gap-1.5 rounded-full bg-[#eef8f1] px-3 py-1.5 text-xs font-semibold text-[#176b4d] sm:flex">
          <Activity size={14} /> {queueSummary}
        </span>
      </div>
      <AttentionList attention={attention} attentionTotal={attentionTotal} onOpen={onOpen} />
    </section>
  );
}

function MobileAttentionQueue({
  attention,
  attentionTotal,
  onOpen,
}: {
  attention: OperationsAttentionItem[];
  attentionTotal: number;
  onOpen: (item: OperationsAttentionItem, trigger: HTMLButtonElement) => void;
}) {
  const [open, setOpen] = useState(false);
  const triggerRef = useRef<HTMLButtonElement | null>(null);
  const wasOpen = useRef(false);
  const queueSummary = attentionQueueSummary(attention.length, attentionTotal);
  const queuePrompt = attentionTotal === 0
    ? "No attention items right now"
    : attention.length === 0
      ? `No more items in this slice · ${attentionTotal} remain`
      : `${queueSummary} need a decision`;

  useEffect(() => {
    if (wasOpen.current && !open) {
      triggerRef.current?.focus();
    }
    wasOpen.current = open;
  }, [open]);

  function handleOpenChange(nextOpen: boolean) {
    setOpen(nextOpen);
  }

  function handleItemOpen(item: OperationsAttentionItem, rowTrigger: HTMLButtonElement) {
    setOpen(false);
    onOpen(item, triggerRef.current ?? rowTrigger);
  }

  return (
    <div className="md:hidden">
      <button
        aria-controls="mobile-attention-queue-sheet"
        aria-expanded={open}
        aria-haspopup="dialog"
        className="flex min-h-14 w-full items-center gap-3 rounded-[18px] border border-[#d6e5db] bg-white px-4 text-left shadow-[0_18px_40px_-38px_rgba(1,76,56,0.55)] transition hover:border-[#a9d0b5] hover:bg-[#f8fcf9] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#73bc8a]"
        data-attention-trigger="true"
        onClick={() => setOpen(true)}
        ref={triggerRef}
        type="button"
      >
        <span className="grid size-9 shrink-0 place-items-center rounded-xl bg-[#eef8f1] text-[#176b4d]"><Activity size={16} /></span>
        <span className="min-w-0 flex-1">
          <span className="block text-sm font-bold text-[#173c2d]">Open attention queue</span>
          <span className="mt-0.5 block text-xs text-[#5f776a]">{queuePrompt}</span>
        </span>
        <ChevronRight aria-hidden="true" className="shrink-0 text-[#8aa997]" size={17} />
      </button>

      <Sheet onOpenChange={handleOpenChange} open={open}>
        <SheetContent className="h-[100dvh] w-full max-w-none rounded-none border-[#d6e5db] bg-[#f7faf8] p-0 md:hidden" id="mobile-attention-queue-sheet" side="right">
          <SheetHeader className="border-b border-[#d6e5db] bg-white px-5 py-6 pr-14">
            <SheetTitle className="text-[#173c2d]">Attention queue</SheetTitle>
          <SheetDescription className="mt-1 text-[#5f776a]">{attentionTotal === 0 ? "There is nothing to resolve right now." : attention.length === 0 ? `${attentionTotal} remain outside this visible slice. Refresh before choosing the next action.` : `${queueSummary} need a decision. Select one to open its next action.`}</SheetDescription>
          </SheetHeader>
          <div className="flex-1 overflow-y-auto px-5 pb-8">
            <AttentionList attention={attention} attentionTotal={attentionTotal} onOpen={handleItemOpen} />
          </div>
        </SheetContent>
      </Sheet>
    </div>
  );
}

function importStatusClassName(status: string) {
  if (status === "completed") {
    return "bg-[#eef8f1] text-[#176b4d]";
  }

  if (status === "queued" || status === "processing") {
    return "bg-[#e8f5eb] text-[#176b4d]";
  }

  if (status === "failed" || status === "partial" || status === "draft") {
    return "bg-[#fff5cf] text-[#725400]";
  }

  return "bg-[#edf1ee] text-[#5f776a]";
}

function RecentImportsLedger({ recentImports }: { recentImports: OperationsRecentImport[] }) {
  return (
    <div className="mt-6 border-t border-[#c9dfd0] pt-5">
      <h3 className="text-base font-bold text-[#173c2d]">Recent imports</h3>
      {recentImports.length === 0 ? (
        <p className="mt-3 rounded-[18px] border border-dashed border-[#c9dfd0] bg-white/65 px-4 py-4 text-sm leading-6 text-[#5f776a]">No roster imports have been recorded yet.</p>
      ) : (
        <ol className="mt-3 divide-y divide-[#c9dfd0]">
          {recentImports.map((item) => (
            <li key={item.id}>
              <Link className="flex min-w-0 items-start gap-3 py-3 first:pt-0 last:pb-0 focus-visible:rounded-xl focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#73bc8a]" href={item.href}>
                <FileClock aria-hidden="true" className="mt-0.5 shrink-0 text-[#176b4d]" size={16} />
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-sm font-semibold text-[#173c2d]">{item.sourceFilename}</span>
                  <span className="mt-1 block truncate text-xs leading-5 text-[#5f776a]">{item.role === "kapten" ? "Kapten" : "Students"} · {item.rowCount} rows · Updated {formatDate(item.updatedAt)} UTC</span>
                </span>
                <span className={`shrink-0 rounded-full px-2 py-1 text-xs font-bold ${importStatusClassName(item.status)}`}>{item.statusLabel}</span>
              </Link>
            </li>
          ))}
        </ol>
      )}
    </div>
  );
}

function ActivityPanel({
  audits,
  recentImports,
}: {
  audits: AdminOperationsSnapshot["audits"];
  recentImports: OperationsRecentImport[];
}) {
  return (
    <section className="rounded-[22px] border border-[#d6e5db] bg-[#eef8f1] p-5 sm:p-6">
      <div className="flex items-start justify-between gap-4">
        <h2 className="text-xl font-bold tracking-[-0.03em] text-[#173c2d]">Recent activity</h2>
        <ShieldCheck aria-hidden="true" className="text-[#2f8a5d]" size={20} />
      </div>
      {audits.length === 0 ? (
        <p className="mt-5 rounded-[18px] border border-[#c9dfd0] bg-white/65 px-4 py-5 text-sm leading-6 text-[#5f776a]">No audit activity has been recorded yet.</p>
      ) : (
        <ol className="mt-4 space-y-3">
          {audits.map((audit) => (
            <li className="flex gap-3" key={audit.id}>
              <span aria-hidden="true" className="mt-1.5 size-2 shrink-0 rounded-full bg-[#2f8a5d]" />
              <div className="min-w-0">
                <p className="truncate text-sm font-semibold text-[#173c2d]">{audit.action}</p>
                <p className="mt-0.5 text-xs leading-5 text-[#5f776a]">{audit.actorName} · {formatDate(audit.occurredAt)}</p>
              </div>
            </li>
          ))}
        </ol>
      )}
      <RecentImportsLedger recentImports={recentImports} />
    </section>
  );
}

function HandoffAttentionAction({
  item,
  onAcknowledged,
  onReissued,
}: {
  item: OperationsAttentionItem;
  onAcknowledged: (handoffId: string) => void;
  onReissued: (replacementHandoffId: string) => void;
}) {
  const [initialHandoffId] = useState(() => item.id);
  const hasReissued = item.id !== initialHandoffId;
  const isAcknowledgement = item.status === "released" && !hasReissued;
  const isAwaitingAcknowledgement = item.status === "released" || hasReissued;
  const action = isAcknowledgement
    ? acknowledgeEnrollmentHandoffAction
    : reissueEnrollmentHandoffAction;
  const [state, formAction, pending] = useActionState(action, EMPTY_FORM_STATE);
  const successHandled = useRef(false);
  const router = useRouter();

  const acknowledgeAndRefresh = useCallback((handoffId: string) => {
    onAcknowledged(handoffId);
    router.refresh();
  }, [onAcknowledged, router]);

  useEffect(() => {
    if (state.status !== "success") {
      successHandled.current = false;
      return;
    }

    if (successHandled.current) {
      return;
    }
    successHandled.current = true;

    const handoffId = state.handoffId ?? item.id;
    if (isAcknowledgement) {
      acknowledgeAndRefresh(handoffId);
    } else {
      onReissued(handoffId);
      // Reissue creates a replacement handoff in the same transaction. Keep
      // the local queue open until that replacement is acknowledged, then
      // reconcile the server snapshot so closing this sheet cannot hide it.
      router.refresh();
    }
  }, [acknowledgeAndRefresh, isAcknowledgement, item.id, onReissued, router, state.handoffId, state.status]);

  if (item.sourceImportRowId && !isAwaitingAcknowledgement) {
    return (
      <p className="rounded-xl border border-[#ead899] bg-[#fff5cf] px-3 py-3 text-xs leading-5 text-[#725400]">
        Reissue is disabled for this import-sourced handoff until an authenticated handoff-file recovery workflow is reachable. Open Imports to inspect the source record; do not replace this handoff from the directory.
      </p>
    );
  }

  return (
    <div className="space-y-3 rounded-[18px] border border-[#d6e5db] bg-[#f8fcf9] p-4">
      <p className="text-sm font-bold text-[#173c2d]">{isAwaitingAcknowledgement ? "Confirm handoff delivery" : "Replace this handoff"}</p>
      <p className="text-xs leading-5 text-[#5f776a]">
        {isAwaitingAcknowledgement
          ? "Record that the released credential reached the recipient so it leaves the attention queue."
          : "Reissuing revokes the current credential and creates a replacement using the same delivery method."}
      </p>
      {state.message ? <FormNotice compact tone={state.status === "success" ? "success" : "danger"}>{state.message}</FormNotice> : null}
      {state.status === "success" && hasReissued ? (
        <HandoffDeliveryNotice onAcknowledged={() => acknowledgeAndRefresh(state.handoffId ?? item.id)} state={state} />
      ) : null}
      {state.status !== "success" ? (
        <form action={formAction} className="space-y-3">
          <input name="handoffId" type="hidden" value={item.id} />
          <label className="flex items-start gap-2 text-xs leading-5 text-[#5f776a]">
            <input className="mt-1" name="confirmation" required type="checkbox" value={isAwaitingAcknowledgement ? "acknowledge" : "reissue"} />
            <span>{isAwaitingAcknowledgement ? "I confirm this handoff was delivered." : "I understand the current handoff will be revoked."}</span>
          </label>
          <Button className="min-h-11" disabled={pending} size="sm" type="submit" variant="brand">
            {pending ? "Saving…" : isAwaitingAcknowledgement ? "Acknowledge handoff" : "Reissue handoff"}
          </Button>
        </form>
      ) : null}
    </div>
  );
}

function importActionErrorMessage(code?: string) {
  switch (code) {
    case "import_not_found":
      return "That import is no longer available. Refresh the console.";
    case "invalid_import_state":
      return "This import changed state. Refresh the console before trying again.";
    case "active_claims":
      return "This import is still being processed. Wait for the worker to finish before retrying.";
    case "no_failed_rows":
      return "There are no failed rows left to retry. Refresh the console.";
    case "request_too_large":
      return "The import action request was too large.";
    default:
      return "The import action could not be completed. Refresh the console and try again.";
  }
}

function ImportAttentionAction({
  item,
  onResolved,
}: {
  item: OperationsAttentionItem;
  onResolved: () => void;
}) {
  const router = useRouter();
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const isDraft = item.status === "draft";
  const actionLabel = isDraft ? "Cancel draft import" : "Retry failed rows";

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setPending(true);
    setError(null);

    try {
      const response = await fetch(`/api/admin/imports/${encodeURIComponent(item.id)}/${isDraft ? "cancel" : "retry"}`, {
        body: isDraft
          ? undefined
          : JSON.stringify({
            expectedGeneration: item.dispatchGeneration,
            idempotencyKey: crypto.randomUUID(),
          }),
        cache: "no-store",
        credentials: "same-origin",
        headers: isDraft ? undefined : { "Content-Type": "application/json" },
        method: "POST",
      });

      if (!response.ok) {
        const payload = await response.json().catch(() => null) as { error?: string } | null;
        setError(importActionErrorMessage(payload?.error));
        return;
      }

      onResolved();
      router.refresh();
    } catch {
      setError(importActionErrorMessage());
    } finally {
      setPending(false);
    }
  }

  return (
    <div className="space-y-3 rounded-[18px] border border-[#d6e5db] bg-[#f8fcf9] p-4">
      <p className="text-sm font-bold text-[#173c2d]">{isDraft ? "Discard this draft" : "Retry this import"}</p>
      <p className="text-xs leading-5 text-[#5f776a]">
        {isDraft
          ? "Cancelling removes the abandoned draft from the review queue without changing accounts."
          : "Retry only the failed rows through the existing authenticated import worker boundary."}
      </p>
      {error ? <FormNotice compact tone="danger">{error}</FormNotice> : null}
      <form className="space-y-3" onSubmit={handleSubmit}>
        <label className="flex items-start gap-2 text-xs leading-5 text-[#5f776a]">
          <input className="mt-1" name="confirmation" required type="checkbox" value="confirm" />
          <span>{isDraft ? "I understand this draft will be cancelled." : "I understand the failed rows will be queued again."}</span>
        </label>
        <Button className="min-h-11" disabled={pending} size="sm" type="submit" variant="brand">
          {pending ? "Updating…" : actionLabel}
        </Button>
      </form>
    </div>
  );
}

function OperationDetailSheet({
  item,
  onClose,
  onReissued,
  onResolved,
}: {
  item: OperationsAttentionItem | null;
  onClose: () => void;
  onReissued: (itemId: string, replacementHandoffId: string) => void;
  onResolved: (itemId: string, close: boolean) => void;
}) {
  return (
    <Sheet onOpenChange={(open) => { if (!open) onClose(); }} open={Boolean(item)}>
      <SheetContent className="w-full border-[#d6e5db] bg-[#f7faf8] p-0 sm:max-w-[440px]" side="right">
        <SheetHeader className="border-b border-[#d6e5db] bg-white px-5 py-6 pr-14">
          <SheetTitle className="text-[#173c2d]">{item?.label ?? "Attention item"}</SheetTitle>
          <SheetDescription className="mt-1 text-[#5f776a]">
            This item is still open in the PostgreSQL operations snapshot.
          </SheetDescription>
        </SheetHeader>
        {item ? (
          <div className="flex flex-1 flex-col px-5 py-6">
            <div className="rounded-[18px] border border-[#d6e5db] bg-white p-4">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <h3 className="text-lg font-bold text-[#173c2d]">{item.title}</h3>
                </div>
                <span className={`rounded-full px-2.5 py-1 text-xs font-bold ${item.kind === "import" ? "bg-[#fff5cf] text-[#725400]" : "bg-[#eef8f1] text-[#176b4d]"}`}>
                  {item.statusLabel}
                </span>
              </div>
              <p className="mt-4 text-sm leading-6 text-[#5f776a]">{item.detail}</p>
              <p className="mt-3 text-xs leading-5 text-[#8aa997]">Added {formatDate(item.createdAt)}</p>
            </div>
            <div className="mt-5">
              {item.kind === "handoff" ? (
                <HandoffAttentionAction
                  item={item}
                  onAcknowledged={(handoffId) => onResolved(handoffId, true)}
                  onReissued={(replacementHandoffId) => onReissued(item.id, replacementHandoffId)}
                />
              ) : item.status === "draft" || item.status === "partial" || item.status === "failed" ? (
                <ImportAttentionAction item={item} onResolved={() => onResolved(item.id, true)} />
              ) : (
                <p className="rounded-[18px] border border-[#d6e5db] bg-[#eef8f1] px-3 py-3 text-xs leading-5 text-[#5f776a]">
                  This import is already queued or processing. Review its live status in the Imports workspace before taking the next account action.
                </p>
              )}
            </div>
            <div className="mt-auto space-y-3 pt-6">
              <Link className="flex min-h-12 items-center justify-between rounded-xl bg-[#014c38] px-4 text-sm font-bold text-white transition hover:bg-[#176b4d] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#73bc8a]" href={item.href}>
                Open relevant workspace
                <ArrowUpRight size={17} />
              </Link>
              <button className="flex min-h-12 w-full items-center justify-center gap-2 rounded-xl border border-[#c9dfd0] bg-white px-4 text-sm font-semibold text-[#176b4d] hover:bg-[#eef8f1] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#73bc8a]" onClick={onClose} type="button">
                <X size={16} />
                Keep queue open
              </button>
            </div>
          </div>
        ) : null}
      </SheetContent>
    </Sheet>
  );
}

function OperationsConsoleModule({
  examEvents,
  refreshHref,
  selectedOperation: initialOperation = "exceptions",
  snapshot,
}: {
  examEvents: ExamEvent[];
  refreshHref: string;
  selectedOperation?: OperationKey;
  snapshot: AdminOperationsSnapshot;
}) {
  const [selectedOperation, setSelectedOperation] = useState<OperationKey>(initialOperation);
  const [selectedItem, setSelectedItem] = useState<OperationsAttentionItem | null>(null);
  const [resolvedAttentionState, setResolvedAttentionState] = useState<{ ids: Set<string>; snapshotAt: string }>(() => ({ ids: new Set(), snapshotAt: snapshot.lastUpdatedAt }));
  const [reissuedAttentionState, setReissuedAttentionState] = useState<{ replacements: Map<string, string>; snapshotAt: string }>(() => ({ replacements: new Map(), snapshotAt: snapshot.lastUpdatedAt }));
  const lastTrigger = useRef<HTMLButtonElement | null>(null);

  useEffect(() => {
    if (selectedItem === null) {
      const fallback = findVisibleFocusTarget({
        heading: document.getElementById("attention-queue-heading"),
        notice: firstVisibleFocusTarget("[data-attention-queue-notice]"),
        preferNotice: true,
        rowSelector: "[data-attention-row]",
        target: isVisibleFocusTarget(lastTrigger.current) ? lastTrigger.current : null,
        triggerSelector: "[data-attention-trigger]",
      });
      fallback?.focus();
    }
  }, [selectedItem]);

  function openItem(item: OperationsAttentionItem, trigger: HTMLButtonElement) {
    lastTrigger.current = trigger;
    setSelectedItem(item);
  }

  function resolveAttention(itemId: string, close: boolean) {
    setResolvedAttentionState((current) => {
      const next = current.snapshotAt === snapshot.lastUpdatedAt ? new Set(current.ids) : new Set<string>();
      next.add(itemId);
      return { ids: next, snapshotAt: snapshot.lastUpdatedAt };
    });
    if (close) {
      setSelectedItem(null);
    }
  }

  function reconcileReissuedHandoff(itemId: string, replacementHandoffId: string) {
    setReissuedAttentionState((current) => {
      const replacements = current.snapshotAt === snapshot.lastUpdatedAt
        ? new Map(current.replacements)
        : new Map<string, string>();
      replacements.set(itemId, replacementHandoffId);
      return { replacements, snapshotAt: snapshot.lastUpdatedAt };
    });
    setSelectedItem((current) => current && current.id === itemId
      ? replaceReissuedHandoff(current, replacementHandoffId)
      : current);
  }

  function selectOperation(nextOperation: OperationKey) {
    setSelectedOperation(nextOperation);
    const params = new URLSearchParams(window.location.search);
    if (nextOperation === "exceptions") {
      params.delete("operation");
    } else {
      params.set("operation", nextOperation);
    }
    const query = params.toString();
    window.history.replaceState(null, "", query ? `/admin?${query}` : "/admin");
  }

  const operationHeading = operationLabels[selectedOperation];
  const currentRefreshHref = selectedOperation === "exceptions"
    ? "/admin"
    : `/admin?operation=${selectedOperation}`;
  const resolvedAttentionIds = resolvedAttentionState.snapshotAt === snapshot.lastUpdatedAt
    ? resolvedAttentionState.ids
    : new Set<string>();
  const reissuedAttention = reissuedAttentionState.snapshotAt === snapshot.lastUpdatedAt
    ? reissuedAttentionState.replacements
    : new Map<string, string>();
  const visibleAttention = removeResolvedAttentionItems(
    snapshot.attention.map((item) => {
      const replacementHandoffId = reissuedAttention.get(item.id);
      return replacementHandoffId ? replaceReissuedHandoff(item, replacementHandoffId) : item;
    }),
    resolvedAttentionIds,
  );
  const visibleAttentionTotal = Math.max(0, snapshot.attentionTotal - resolvedAttentionIds.size);
  const attentionQueueAnnouncement = visibleAttentionTotal === 0
    ? "Attention queue is clear."
    : visibleAttention.length === 0
      ? `${visibleAttentionTotal} ${visibleAttentionTotal === 1 ? "attention item remains" : "attention items remain"} outside this visible queue slice.`
      : `${visibleAttentionTotal} ${visibleAttentionTotal === 1 ? "attention item remains" : "attention items remain"} in the queue.`;

  return (
    <div className="space-y-6">
      <p aria-live="polite" className="sr-only" data-attention-queue-announcement="true">{attentionQueueAnnouncement}</p>
      <section className="overflow-hidden rounded-[26px] bg-[#014c38] p-5 shadow-[0_28px_68px_-44px_rgba(1,76,56,0.72)] sm:p-6 lg:p-7">
        <div className="flex flex-col gap-5 lg:flex-row lg:items-end lg:justify-between">
          <div className="max-w-[62ch]">
            <h2 className="text-[clamp(1.7rem,3.2vw,2.7rem)] font-bold leading-[1.04] tracking-[-0.045em] text-white">
              Keep enrollment moving.
            </h2>
            <div className="mt-3 flex items-center gap-2 text-xs font-semibold text-[#9ed9aa]">
              <span aria-hidden="true" className="size-2 rounded-full bg-[#91d6a5]" /> Live PostgreSQL snapshot
            </div>
            <p className="mt-3 max-w-[58ch] text-sm leading-6 text-[#c8e7d0]">
              See the signals that need a decision, arm an operation, and resolve the next handoff without losing the roster context.
            </p>
          </div>
          <SnapshotStatusBar lastUpdatedAt={snapshot.lastUpdatedAt} refreshHref={currentRefreshHref || refreshHref} />
        </div>
        <div className="mt-6 grid min-w-0 grid-cols-2 gap-3 xl:grid-cols-4">
          <MetricCard accent="mint" detail="Accounts with an active student role" label="Active students" value={snapshot.counts.activeStudents} />
          <MetricCard accent="mint" detail="Accounts with an active Kapten role" label="Active Kapten" value={snapshot.counts.activeKapten} />
          <MetricCard accent="pending" detail="Handoffs awaiting release or acknowledgement" label="Awaiting handoff" value={snapshot.counts.awaitingHandoff} />
          <MetricCard accent="sun" detail="Draft, partial, or failed imports" label="Imports needing review" value={snapshot.counts.importsNeedingReview} />
        </div>
      </section>

      <section>
        <div className="flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <h2 className="text-xl font-bold tracking-[-0.03em] text-[#173c2d]">Choose the next operation</h2>
          </div>
          <p className="text-xs leading-5 text-[#5f776a]">Selected: <span className="font-bold text-[#173c2d]">{operationHeading.label}</span></p>
        </div>
        <div className="mt-4 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          <OperationControl active={selectedOperation === "add-student"} icon={UserPlus} onSelect={() => selectOperation("add-student")} operation="add-student" />
          <OperationControl active={selectedOperation === "add-kapten"} icon={UserPlus} onSelect={() => selectOperation("add-kapten")} operation="add-kapten" />
          <OperationControl count={snapshot.counts.importsNeedingReview} active={selectedOperation === "import-roster"} icon={FileClock} onSelect={() => selectOperation("import-roster")} operation="import-roster" />
          <OperationControl count={visibleAttentionTotal} active={selectedOperation === "exceptions"} icon={CircleAlert} onSelect={() => selectOperation("exceptions")} operation="exceptions" />
        </div>
      </section>

      {selectedOperation === "add-student" ? (
        <section aria-labelledby="operation-student-heading" className="rounded-[22px] border border-[#d6e5db] bg-white p-4 shadow-[0_20px_46px_-42px_rgba(1,76,56,0.6)] sm:p-6">
          <div className="mb-4 flex items-start justify-between gap-3">
            <div>
              <h2 className="text-xl font-bold text-[#173c2d]" id="operation-student-heading">Add student</h2>
            </div>
            <button aria-label="Close selected operation" className="grid size-11 place-items-center rounded-xl text-[#5f776a] hover:bg-[#eef8f1] hover:text-[#014c38] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#73bc8a]" onClick={() => selectOperation("exceptions")} type="button"><X size={17} /></button>
          </div>
          <CreateStudentForm examEvents={examEvents} />
        </section>
      ) : null}

      {selectedOperation === "add-kapten" ? (
        <section aria-labelledby="operation-kapten-heading" className="rounded-[22px] border border-[#d6e5db] bg-white p-4 shadow-[0_20px_46px_-42px_rgba(1,76,56,0.6)] sm:p-6">
          <div className="mb-4 flex items-start justify-between gap-3">
            <div>
              <h2 className="text-xl font-bold text-[#173c2d]" id="operation-kapten-heading">Add Kapten</h2>
            </div>
            <button aria-label="Close selected operation" className="grid size-11 place-items-center rounded-xl text-[#5f776a] hover:bg-[#eef8f1] hover:text-[#014c38] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#73bc8a]" onClick={() => selectOperation("exceptions")} type="button"><X size={17} /></button>
          </div>
          <CreateKaptenForm />
        </section>
      ) : null}

      {selectedOperation === "import-roster" ? (
        <section className="rounded-[22px] border border-[#d6e5db] bg-white p-5 shadow-[0_20px_46px_-42px_rgba(1,76,56,0.6)] sm:p-6">
          <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <h2 className="text-xl font-bold text-[#173c2d]">Import roster</h2>
              <p className="mt-2 max-w-[58ch] text-sm leading-6 text-[#5f776a]">Choose Students or Kapten on the imports workspace, then review the preview before any account changes occur.</p>
            </div>
            <Link className="inline-flex min-h-11 shrink-0 items-center justify-center gap-2 rounded-xl bg-[#014c38] px-4 text-sm font-bold text-white hover:bg-[#176b4d] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#73bc8a]" href="/admin/imports">Open imports <ArrowUpRight size={16} /></Link>
          </div>
        </section>
      ) : null}

      {selectedOperation === "exceptions" ? (
        <>
          <div className="hidden md:block"><AttentionPanel attention={visibleAttention} attentionTotal={visibleAttentionTotal} onOpen={openItem} /></div>
          <MobileAttentionQueue attention={visibleAttention} attentionTotal={visibleAttentionTotal} onOpen={openItem} />
        </>
      ) : null}

      <div className="grid gap-6 lg:grid-cols-[minmax(0,1.25fr)_minmax(300px,0.75fr)]">
        <div className="rounded-[22px] border border-[#d6e5db] bg-white p-5 sm:p-6">
          <div className="flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
            <div>
              <h2 className="text-xl font-bold tracking-[-0.03em] text-[#173c2d]">Browse the roster</h2>
            </div>
            <span className="text-xs text-[#5f776a]">Stable actions · search · status filters</span>
          </div>
          <div className="mt-4 grid gap-3 sm:grid-cols-2">
            <Link className="flex min-h-16 items-center justify-between rounded-[18px] border border-[#d6e5db] bg-[#f8fcf9] px-4 text-sm font-bold text-[#173c2d] hover:border-[#a9d0b5] hover:bg-[#eef8f1] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#73bc8a]" href="/admin/enrollment">
              Students <span className="grid size-9 place-items-center rounded-xl bg-white text-[#176b4d]"><Users size={17} /></span>
            </Link>
            <Link className="flex min-h-16 items-center justify-between rounded-[18px] border border-[#d6e5db] bg-[#f8fcf9] px-4 text-sm font-bold text-[#173c2d] hover:border-[#a9d0b5] hover:bg-[#eef8f1] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#73bc8a]" href="/admin/kapten">
              Kapten <span className="grid size-9 place-items-center rounded-xl bg-white text-[#176b4d]"><Users size={17} /></span>
            </Link>
          </div>
        </div>
        <ActivityPanel audits={snapshot.audits} recentImports={snapshot.recentImports} />
      </div>

      <OperationDetailSheet item={selectedItem} onClose={() => setSelectedItem(null)} onReissued={reconcileReissuedHandoff} onResolved={resolveAttention} />
    </div>
  );
}

export { OperationsConsoleModule };
export type { OperationKey };
