"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useActionState, useCallback, useEffect, useRef, useState } from "react";
import {
  Activity,
  ArrowUpRight,
  CheckCircle2,
  ChevronRight,
  Clock3,
  FileClock,
  UserPlus,
  X,
} from "@/lib/icons";

import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import type { ExamEvent } from "@/generated/prisma/client";
import type {
  AdminOperationsSnapshot,
  OperationsAttentionItem,
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
import {
  ADMIN_CARD_CLASS_NAME,
  ADMIN_STATUS_CLASS_NAMES,
  ADMIN_STATUS_FILL_CLASS_NAMES,
} from "./admin-ui-contract";
import { CreateKaptenForm } from "./components/create-kapten-form";
import { CreateStudentForm } from "./components/create-student-form";
import { findVisibleFocusTarget, firstVisibleFocusTarget, isVisibleFocusTarget } from "./components/focus-target";
import { HandoffDeliveryNotice } from "./components/handoff-delivery-notice";

type OperationKey = "add-student" | "add-kapten" | "import-roster" | "exceptions";

const operationLabels: Record<OperationKey, { detail: string; label: string }> = {
  "add-kapten": {
    detail: "Create a Kapten account",
    label: "Add Kapten",
  },
  "add-student": {
    detail: "Create a student account",
    label: "Add student",
  },
  exceptions: {
    detail: "Resolve open issues",
    label: "Review exceptions",
  },
  "import-roster": {
    detail: "Upload a roster CSV",
    label: "Import roster",
  },
};

const operationsDateFormatter = new Intl.DateTimeFormat("en-US", {
  dateStyle: "medium",
  timeStyle: "short",
  timeZone: "UTC",
});

function formatDate(value: string) {
  return operationsDateFormatter.format(new Date(value));
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
      className={`group flex min-h-[88px] items-center gap-3 rounded-3xl border px-4 py-3 text-left transition-[background-color,border-color,box-shadow,transform] duration-150 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary-300 ${active ? "-translate-y-0.5 border-primary-300 bg-primary-50 shadow-[0_18px_34px_-30px_rgba(1,76,56,0.8)]" : "border-primary-100 bg-white hover:-translate-y-0.5 hover:border-primary-200 hover:bg-secondary-50"}`}
      onClick={onSelect}
      type="button"
    >
      <span className={`grid size-10 shrink-0 place-items-center rounded-xl ${active ? "bg-primary-700 text-white" : "bg-primary-50 text-primary-800"}`}>
        <Icon size={18} strokeWidth={1.8} />
      </span>
      <span className="min-w-0 flex-1">
        <span className="flex items-center gap-2 text-sm font-semibold text-secondary-900">
          {label}
          {typeof count === "number" ? (
            <span className={`rounded-full px-2 py-0.5 text-xs font-semibold ${count > 0 ? ADMIN_STATUS_FILL_CLASS_NAMES.warning : ADMIN_STATUS_FILL_CLASS_NAMES.success}`}>
              {count}
            </span>
          ) : null}
        </span>
        <span className="mt-1 block text-xs leading-5 text-secondary-600">{detail}</span>
      </span>
      <ChevronRight aria-hidden="true" className="shrink-0 text-secondary-400 transition-transform group-hover:translate-x-0.5" size={17} />
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
      className="group flex min-h-16 w-full items-center gap-3 border-b border-primary-100 px-1 py-3 text-left last:border-b-0 focus-visible:rounded-xl focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary-300"
      data-attention-row="true"
      data-attention-trigger="true"
      onClick={(event) => onOpen(item, event.currentTarget)}
      type="button"
    >
      <span aria-hidden="true" className={`grid size-9 shrink-0 place-items-center rounded-xl ${item.kind === "import" ? ADMIN_STATUS_FILL_CLASS_NAMES.warning : ADMIN_STATUS_FILL_CLASS_NAMES.success}`}>
        {item.kind === "import" ? <FileClock size={16} /> : <Clock3 size={16} />}
      </span>
      <span className="min-w-0 flex-1">
        <span className="flex flex-wrap items-center gap-x-2 gap-y-1">
          <span className="truncate text-sm font-semibold text-secondary-900">{item.title}</span>
          <span className={`rounded-full px-2 py-0.5 text-xs font-semibold ${item.kind === "import" ? ADMIN_STATUS_FILL_CLASS_NAMES.warning : ADMIN_STATUS_FILL_CLASS_NAMES.success}`}>
            {item.statusLabel}
          </span>
        </span>
        <span className="mt-1 block truncate text-xs text-secondary-600">{item.detail}</span>
      </span>
      <span className="hidden shrink-0 text-xs text-secondary-400 sm:block">{formatDate(item.createdAt)}</span>
      <ChevronRight aria-hidden="true" className="shrink-0 text-secondary-400 transition-transform group-hover:translate-x-0.5" size={16} />
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
      <div className="mt-5 rounded-3xl border border-dashed border-primary-200 bg-primary-50/70 px-4 py-6 text-center focus:outline-2 focus:outline-offset-2 focus:outline-primary-300" data-attention-queue-notice="true" tabIndex={-1}>
        <CheckCircle2 className="mx-auto text-primary-600" size={21} />
        <p className="mt-2 text-sm font-semibold text-secondary-900">{hasRemainingAttention ? "No more items in this slice" : "No attention items right now"}</p>
        <p className="mt-1 text-xs leading-5 text-secondary-600">
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
    <section className={`${ADMIN_CARD_CLASS_NAME} p-5 sm:p-6`}>
      <div className="flex items-start justify-between gap-4">
        <div>
          <h2 className="text-xl font-semibold tracking-[-0.03em] text-secondary-900 focus:outline-2 focus:outline-offset-2 focus:outline-primary-300" id="attention-queue-heading" tabIndex={-1}>Attention queue</h2>
          <p className="mt-1 max-w-[55ch] text-sm leading-6 text-secondary-600">Open a row to see the smallest next action without rebuilding the context.</p>
        </div>
        <span className="hidden items-center gap-1.5 rounded-full bg-primary-50 px-3 py-1.5 text-xs font-semibold text-primary-800 sm:flex">
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
        className="flex min-h-14 w-full items-center gap-3 rounded-3xl border border-primary-100 bg-white px-4 text-left shadow-[0_18px_40px_-38px_rgba(1,76,56,0.55)] transition hover:border-primary-200 hover:bg-secondary-50 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary-300"
        data-attention-trigger="true"
        onClick={() => setOpen(true)}
        ref={triggerRef}
        type="button"
      >
        <span className="grid size-9 shrink-0 place-items-center rounded-xl bg-primary-50 text-primary-800"><Activity size={16} /></span>
        <span className="min-w-0 flex-1">
          <span className="block text-sm font-semibold text-secondary-900">Open attention queue</span>
          <span className="mt-0.5 block text-xs text-secondary-600">{queuePrompt}</span>
        </span>
        <ChevronRight aria-hidden="true" className="shrink-0 text-secondary-400" size={17} />
      </button>

      <Sheet onOpenChange={handleOpenChange} open={open}>
        <SheetContent className="h-[100dvh] w-full max-w-none rounded-none border-primary-100 bg-secondary-50 p-0 md:hidden" id="mobile-attention-queue-sheet" side="right">
          <SheetHeader className="border-b border-primary-100 bg-white px-5 py-6 pr-14">
            <SheetTitle className="text-secondary-900">Attention queue</SheetTitle>
          <SheetDescription className="mt-1 text-secondary-600">{attentionTotal === 0 ? "There is nothing to resolve right now." : attention.length === 0 ? `${attentionTotal} remain outside this visible slice. Refresh before choosing the next action.` : `${queueSummary} need a decision. Select one to open its next action.`}</SheetDescription>
          </SheetHeader>
          <div className="flex-1 overflow-y-auto px-5 pb-8">
            <AttentionList attention={attention} attentionTotal={attentionTotal} onOpen={handleItemOpen} />
          </div>
        </SheetContent>
      </Sheet>
    </div>
  );
}

function ActivityPanel({
  audits,
}: {
  audits: AdminOperationsSnapshot["audits"];
}) {
  return (
    <section>
      <h2 className="text-xl font-semibold tracking-[-0.03em] text-secondary-900">Recent activity</h2>
      {audits.length === 0 ? (
        <p className="mt-5 rounded-3xl border border-primary-200 bg-white/65 px-4 py-5 text-sm leading-6 text-secondary-600">No audit activity has been recorded yet.</p>
      ) : (
        <ol className="mt-4 space-y-3">
          {audits.slice(0, 10).map((audit) => (
            <li className="flex gap-3" key={audit.id}>
              <span aria-hidden="true" className="mt-1.5 size-2 shrink-0 rounded-full bg-primary-600" />
              <div className="min-w-0">
                <p className="truncate text-sm font-semibold text-secondary-900">{audit.action}</p>
                <p className="mt-0.5 text-xs leading-5 text-secondary-600">{audit.actorName} · {formatDate(audit.occurredAt)}</p>
              </div>
            </li>
          ))}
        </ol>
      )}
      <div className="mt-5 flex justify-center">
        <Button
          className="font-bold text-primary-700 hover:bg-transparent hover:text-primary-800"
          nativeButton={false}
          render={<Link href="/admin/audit-logs" />}
          size="default"
          variant="ghost"
        >
          See more
        </Button>
      </div>
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
  const router = useRouter();

  const acknowledgeAndRefresh = useCallback((handoffId: string) => {
    onAcknowledged(handoffId);
    router.refresh();
  }, [onAcknowledged, router]);

  const actionWithSuccess = useCallback(async (previousState: typeof EMPTY_FORM_STATE, formData: FormData) => {
    const nextState = await action(previousState, formData);
    if (nextState.status === "success") {
      const handoffId = nextState.handoffId ?? item.id;
      if (isAcknowledgement) {
        acknowledgeAndRefresh(handoffId);
      } else {
        // Reissue creates a replacement handoff in the same transaction. Keep
        // the local queue open until that replacement is acknowledged, then
        // reconcile the server snapshot so closing this sheet cannot hide it.
        onReissued(handoffId);
        router.refresh();
      }
    }
    return nextState;
  }, [acknowledgeAndRefresh, action, isAcknowledgement, item.id, onReissued, router]);
  const [state, formAction, pending] = useActionState(actionWithSuccess, EMPTY_FORM_STATE);

  if (item.sourceImportRowId && !isAwaitingAcknowledgement) {
    return (
      <p className={`rounded-2xl border px-3 py-3 text-xs leading-5 ${ADMIN_STATUS_CLASS_NAMES.warning}`}>
        Reissue is disabled for this import-sourced handoff until an authenticated handoff-file recovery workflow is reachable. Open the source import from the attention item to inspect it; do not replace this handoff from the directory.
      </p>
    );
  }

  return (
    <div className="space-y-3 rounded-3xl border border-primary-100 bg-secondary-50 p-4">
      <p className="text-sm font-semibold text-secondary-900">{isAwaitingAcknowledgement ? "Confirm handoff delivery" : "Replace this handoff"}</p>
      <p className="text-xs leading-5 text-secondary-600">
        {isAwaitingAcknowledgement
          ? "Record that the released credential reached the recipient so it leaves the attention queue."
          : "Reissuing revokes the current credential and creates a replacement using the same delivery method."}
      </p>
      {state.message ? <FormNotice compact tone={state.status === "success" ? "success" : "danger"}>{state.message}</FormNotice> : null}
      {state.status === "success" && hasReissued ? (
        <HandoffDeliveryNotice key={state.handoffId} onAcknowledged={() => acknowledgeAndRefresh(state.handoffId ?? item.id)} state={state} />
      ) : null}
      {state.status !== "success" ? (
        <form action={formAction} className="space-y-3">
          <input name="handoffId" type="hidden" value={item.id} />
          <label className="flex items-start gap-2 text-xs leading-5 text-secondary-600">
            <input className="mt-1" name="confirmation" required type="checkbox" value={isAwaitingAcknowledgement ? "acknowledge" : "reissue"} />
            <span>{isAwaitingAcknowledgement ? "I confirm this handoff was delivered." : "I understand the current handoff will be revoked."}</span>
          </label>
          <Button className="min-h-11" disabled={pending} size="sm" type="submit" variant={isAwaitingAcknowledgement ? "brand" : "destructive"}>
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
    <div className="space-y-3 rounded-3xl border border-primary-100 bg-secondary-50 p-4">
      <p className="text-sm font-semibold text-secondary-900">{isDraft ? "Discard this draft" : "Retry this import"}</p>
      <p className="text-xs leading-5 text-secondary-600">
        {isDraft
          ? "Cancelling removes the abandoned draft from the review queue without changing accounts."
          : "Retry only the failed rows through the existing authenticated import worker boundary."}
      </p>
      {error ? <FormNotice compact tone="danger">{error}</FormNotice> : null}
      <form className="space-y-3" onSubmit={handleSubmit}>
        <label className="flex items-start gap-2 text-xs leading-5 text-secondary-600">
          <input className="mt-1" name="confirmation" required type="checkbox" value="confirm" />
          <span>{isDraft ? "I understand this draft will be cancelled." : "I understand the failed rows will be queued again."}</span>
        </label>
        <Button className="min-h-11" disabled={pending} size="sm" type="submit" variant={isDraft ? "destructive" : "brand"}>
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
      <SheetContent className="w-full border-primary-100 bg-secondary-50 p-0 sm:max-w-[440px]" side="right">
        <SheetHeader className="border-b border-primary-100 bg-white px-5 py-6 pr-14">
          <SheetTitle className="text-secondary-900">{item?.label ?? "Attention item"}</SheetTitle>
          <SheetDescription className="mt-1 text-secondary-600">
            This item is still open in the PostgreSQL operations snapshot.
          </SheetDescription>
        </SheetHeader>
        {item ? (
          <div className="flex flex-1 flex-col px-5 py-6">
            <div className="rounded-3xl border border-primary-100 bg-white p-4">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <h3 className="text-lg font-semibold text-secondary-900">{item.title}</h3>
                </div>
                <span className={`rounded-full px-2.5 py-1 text-xs font-semibold ${item.kind === "import" ? ADMIN_STATUS_FILL_CLASS_NAMES.warning : ADMIN_STATUS_FILL_CLASS_NAMES.success}`}>
                  {item.statusLabel}
                </span>
              </div>
              <p className="mt-4 text-sm leading-6 text-secondary-600">{item.detail}</p>
              <p className="mt-3 text-xs leading-5 text-secondary-400">Added {formatDate(item.createdAt)}</p>
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
                <p className="rounded-3xl border border-primary-100 bg-primary-50 px-3 py-3 text-xs leading-5 text-secondary-600">
                  This import is already queued or processing. Open the source import from this item to review its live status before taking the next account action.
                </p>
              )}
            </div>
            <div className="mt-auto space-y-3 pt-6">
              <Button
                className="w-full justify-between"
                nativeButton={false}
                render={<Link href={item.href} />}
                size="lg"
                variant="brand"
              >
                Open relevant workspace
                <ArrowUpRight size={17} />
              </Button>
              <Button className="w-full" onClick={onClose} variant="brandOutline">
                <X size={16} />
                Keep queue open
              </Button>
            </div>
          </div>
        ) : null}
      </SheetContent>
    </Sheet>
  );
}

function OperationsConsoleModule({
  examEvents,
  selectedOperation: initialOperation,
  snapshot,
}: {
  examEvents: ExamEvent[];
  selectedOperation?: OperationKey;
  snapshot: AdminOperationsSnapshot;
}) {
  const [selectedOperation, setSelectedOperation] = useState<OperationKey | null>(initialOperation ?? null);
  const [selectedItem, setSelectedItem] = useState<OperationsAttentionItem | null>(null);
  const [resolvedAttentionState, setResolvedAttentionState] = useState<{ ids: Set<string>; snapshotAt: string }>(() => ({ ids: new Set(), snapshotAt: snapshot.lastUpdatedAt }));
  const [reissuedAttentionState, setReissuedAttentionState] = useState<{ replacements: Map<string, string>; snapshotAt: string }>(() => ({ replacements: new Map(), snapshotAt: snapshot.lastUpdatedAt }));
  const lastTrigger = useRef<HTMLButtonElement | null>(null);

  function openItem(item: OperationsAttentionItem, trigger: HTMLButtonElement) {
    lastTrigger.current = trigger;
    setSelectedItem(item);
  }

  function restoreAttentionFocus() {
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

  function closeSelectedItem() {
    setSelectedItem(null);
    window.requestAnimationFrame(restoreAttentionFocus);
  }

  function resolveAttention(itemId: string, close: boolean) {
    setResolvedAttentionState((current) => ({
      ids: new Set(current.snapshotAt === snapshot.lastUpdatedAt ? [...current.ids, itemId] : [itemId]),
      snapshotAt: snapshot.lastUpdatedAt,
    }));
    if (close) {
      closeSelectedItem();
    }
  }

  function reconcileReissuedHandoff(itemId: string, replacementHandoffId: string) {
    setReissuedAttentionState((current) => ({
      replacements: new Map(current.snapshotAt === snapshot.lastUpdatedAt
        ? [...current.replacements, [itemId, replacementHandoffId]]
        : [[itemId, replacementHandoffId]]),
      snapshotAt: snapshot.lastUpdatedAt,
    }));
    setSelectedItem((current) => current && current.id === itemId
      ? replaceReissuedHandoff(current, replacementHandoffId)
      : current);
  }

  function selectOperation(nextOperation: OperationKey | null) {
    setSelectedOperation(nextOperation);
    const params = new URLSearchParams(window.location.search);
    if (nextOperation === null || nextOperation === "exceptions") {
      params.delete("operation");
    } else {
      params.set("operation", nextOperation);
    }
    const query = params.toString();
    window.history.replaceState(null, "", query ? `/admin?${query}` : "/admin");
  }

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
      {selectedOperation === "exceptions" ? <p aria-live="polite" className="sr-only" data-attention-queue-announcement="true">{attentionQueueAnnouncement}</p> : null}
      <section>
        <div className="flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
          <h2 className="text-xl font-semibold tracking-[-0.03em] text-secondary-900">Quick actions</h2>
        </div>
        <div className="mt-4 grid gap-3 sm:grid-cols-2">
          <OperationControl active={selectedOperation === "add-student"} icon={UserPlus} onSelect={() => selectOperation("add-student")} operation="add-student" />
          <OperationControl active={selectedOperation === "add-kapten"} icon={UserPlus} onSelect={() => selectOperation("add-kapten")} operation="add-kapten" />
        </div>
      </section>

      {selectedOperation === "add-student" ? (
        <section aria-labelledby="operation-student-heading" className={`${ADMIN_CARD_CLASS_NAME} p-4 sm:p-6`}>
          <div className="mb-4 flex items-start justify-between gap-3">
            <div>
              <h2 className="text-xl font-semibold text-secondary-900" id="operation-student-heading">Add student</h2>
            </div>
            <Button aria-label="Close selected operation" onClick={() => selectOperation(null)} size="icon" variant="ghost"><X size={17} /></Button>
          </div>
          <CreateStudentForm examEvents={examEvents} />
        </section>
      ) : null}

      {selectedOperation === "add-kapten" ? (
        <section aria-labelledby="operation-kapten-heading" className={`${ADMIN_CARD_CLASS_NAME} p-4 sm:p-6`}>
          <div className="mb-4 flex items-start justify-between gap-3">
            <div>
              <h2 className="text-xl font-semibold text-secondary-900" id="operation-kapten-heading">Add Kapten</h2>
            </div>
            <Button aria-label="Close selected operation" onClick={() => selectOperation(null)} size="icon" variant="ghost"><X size={17} /></Button>
          </div>
          <CreateKaptenForm />
        </section>
      ) : null}

      {selectedOperation === "import-roster" ? (
        <section className={`${ADMIN_CARD_CLASS_NAME} p-5 sm:p-6`}>
          <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <h2 className="text-xl font-semibold text-secondary-900">Import roster</h2>
              <p className="mt-2 max-w-[58ch] text-sm leading-6 text-secondary-600">Bulk roster imports now start from the enrollment workspace, where you can review the preview before any account changes occur.</p>
            </div>
            <Button
              className="shrink-0"
              nativeButton={false}
              render={<Link href="/admin/enrollment" />}
              size="default"
              variant="brand"
            >
              Open enrollment <ArrowUpRight size={16} />
            </Button>
          </div>
        </section>
      ) : null}

      {selectedOperation === "exceptions" ? (
        <>
          <div className="hidden md:block"><AttentionPanel attention={visibleAttention} attentionTotal={visibleAttentionTotal} onOpen={openItem} /></div>
          <MobileAttentionQueue attention={visibleAttention} attentionTotal={visibleAttentionTotal} onOpen={openItem} />
        </>
      ) : null}

      <ActivityPanel audits={snapshot.audits} />

      <OperationDetailSheet item={selectedItem} onClose={closeSelectedItem} onReissued={reconcileReissuedHandoff} onResolved={resolveAttention} />
    </div>
  );
}

export { OperationsConsoleModule };
export type { OperationKey };
