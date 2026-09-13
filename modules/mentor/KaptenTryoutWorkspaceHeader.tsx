"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, type ReactNode } from "react";

import { ChevronLeft, Copy, Ellipsis, FilePenLine } from "@/lib/icons";
import {
  ReferenceStatusBadge,
} from "@/components/dashboard/reference-dashboard-primitives";
import { Button } from "@/components/ui/button";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { duplicateTryoutAction, unpublishTryoutAction } from "@/modules/mentor/tryout-actions";
import { cn } from "@/lib/utils";

type TryoutWorkspaceTab = "identity" | "subtests" | "operations" | "participants";
type PrimaryNavigationEvent = {
  altKey: boolean;
  button: number;
  ctrlKey: boolean;
  metaKey: boolean;
  preventDefault: () => void;
  shiftKey: boolean;
};

const workspaceTabs: Array<{ label: string; value: TryoutWorkspaceTab }> = [
  { label: "Informasi", value: "identity" },
  { label: "Subtest", value: "subtests" },
  { label: "Operasional", value: "operations" },
  { label: "Peserta", value: "participants" },
];

function workspaceHref(
  id: string,
  tab: TryoutWorkspaceTab,
  parentId?: string,
) {
  const encodedId = encodeURIComponent(id);
  const parentSuffix = parentId ? `&parent=${encodeURIComponent(parentId)}` : "";
  if (tab === "identity") {
    return parentId
      ? `/mentor/tryout/${encodedId}?parent=${encodeURIComponent(parentId)}`
      : `/mentor/tryout/${encodedId}`;
  }
  if (tab === "subtests") return `/mentor/tryout/${encodedId}?workspace=sections${parentSuffix}`;
  if (tab === "participants") return `/mentor/tryout/${encodedId}/operations/participants${parentId ? `?parent=${encodeURIComponent(parentId)}` : ""}`;
  return `/mentor/tryout/${encodedId}/operations${parentId ? `?parent=${encodeURIComponent(parentId)}` : ""}`;
}

function handlePrimaryNavigation(
  event: PrimaryNavigationEvent,
  href: string,
  onNavigate?: (href: string, event: PrimaryNavigationEvent) => void,
) {
  if (
    event.button !== 0
    || event.metaKey
    || event.ctrlKey
    || event.shiftKey
    || event.altKey
  ) return;
  onNavigate?.(href, event);
}

function TryoutWorkspaceHeader({
  actions,
  activeTab,
  backHref = "/mentor/tryout",
  backLabel = "Kembali ke semua Tryout",
  id,
  onNavigate,
  parentId,
  showTabs = true,
  status,
  title,
}: {
  actions?: ReactNode;
  activeTab: TryoutWorkspaceTab;
  backHref?: string;
  backLabel?: string;
  id: string;
  onNavigate?: (href: string, event: PrimaryNavigationEvent) => void;
  parentId?: string;
  showTabs?: boolean;
  status: string;
  title: string;
}) {
  return (
    <div className="grid min-w-0 gap-5">
      <div className="flex min-w-0 items-start justify-between gap-4">
        <div className="flex min-w-0 items-start gap-3">
          <Button
            aria-label={backLabel}
            className="mt-1 min-h-11 min-w-11 shrink-0 rounded-xl text-secondary-500 hover:bg-primary-50 hover:text-secondary-900"
            nativeButton={false}
            onClick={(event) => handlePrimaryNavigation(event, backHref, onNavigate)}
            render={<Link href={backHref} />}
            size="icon"
            title={backLabel}
            variant="ghost"
          >
            <ChevronLeft aria-hidden="true" className="size-5" />
          </Button>
          <div className="min-w-0">
            <div className="flex min-w-0 flex-wrap items-center gap-x-3 gap-y-2">
              <h1 className="min-w-0 break-words font-heading text-2xl font-semibold tracking-[-0.03em] text-secondary-900 sm:text-3xl">
                {title}
              </h1>
              <ReferenceStatusBadge appearance="mentor" size="sm" status={status} />
            </div>
          </div>
        </div>
        {actions ? <div className="flex shrink-0 items-center gap-2">{actions}</div> : null}
      </div>

      {showTabs ? (
        <nav aria-label="Bagian Tryout" className="grid grid-cols-4 border-b border-primary-100">
          {workspaceTabs.map((tab) => {
            const href = workspaceHref(id, tab.value, parentId);
            const active = activeTab === tab.value;
            return (
              <Link
                aria-current={active ? "page" : undefined}
                className={cn(
                  "flex min-h-11 min-w-0 items-center justify-center border-b-2 px-1 py-2 text-center text-xs font-medium transition-colors motion-reduce:transition-none sm:px-3 sm:text-sm",
                  active
                    ? "border-voyage-deep bg-primary-50/70 text-voyage-deep"
                    : "border-transparent text-voyage-muted-ink hover:bg-primary-50/60 hover:text-voyage-ink",
                  "focus-visible:border-voyage-leaf focus-visible:bg-primary-50 focus-visible:text-voyage-deep focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-voyage-leaf/35",
                )}
                href={href}
                key={tab.value}
                onClick={(event) => handlePrimaryNavigation(event, href, onNavigate)}
              >
                {tab.label}
              </Link>
            );
          })}
        </nav>
      ) : null}
    </div>
  );
}

type LifecycleAction = "duplicate" | "unpublish";

function TryoutLifecycleMenu({
  allowDuplicate,
  hasActiveAttempt = false,
  onDuplicate,
  onUnpublish,
  saving = false,
  status,
  tryoutId,
}: {
  allowDuplicate?: boolean;
  hasActiveAttempt?: boolean;
  onDuplicate?: () => void;
  onUnpublish?: () => void;
  saving?: boolean;
  status: string;
  tryoutId: string;
}) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);
  const [pendingAction, setPendingAction] = useState<LifecycleAction | null>(null);
  const showDuplicate = allowDuplicate ?? status === "published";
  const showUnpublish = status === "published";

  if (!showDuplicate && !showUnpublish) return null;

  const requestAction = (action: LifecycleAction) => {
    setActionError(null);
    if (action === "duplicate" && onDuplicate) {
      onDuplicate();
      return;
    }
    if (action === "unpublish" && onUnpublish) {
      onUnpublish();
      return;
    }
    setPendingAction(action);
  };

  const confirmAction = async () => {
    if (!pendingAction || busy) return;
    setBusy(true);
    setActionError(null);
    try {
      if (pendingAction === "duplicate") {
        const result = await duplicateTryoutAction(tryoutId);
        if (!result.ok) {
          setActionError(result.message);
          return;
        }
        setPendingAction(null);
        router.push(`/mentor/tryout/${result.result.id}?workspace=sections&parent=${encodeURIComponent(tryoutId)}`);
        return;
      }

      const result = await unpublishTryoutAction(tryoutId);
      if (!result.ok) {
        setActionError(result.message);
        return;
      }
      setPendingAction(null);
      router.push(`/mentor/tryout/${tryoutId}`);
    } catch (error) {
      setActionError(error instanceof Error ? error.message : "Tindakan Tryout belum dapat diproses.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger
          render={(
            <Button
              aria-label="Tindakan Tryout"
              className="min-h-11 min-w-11 rounded-xl"
              disabled={saving || busy}
              size="icon"
              title="Tindakan Tryout"
              type="button"
              variant="ghost"
            />
          )}
        >
          <Ellipsis aria-hidden="true" />
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="w-60">
          {showUnpublish ? (
            <DropdownMenuItem
              disabled={saving || busy || hasActiveAttempt}
              onClick={() => requestAction("unpublish")}
              title={hasActiveAttempt ? "Tunggu sampai semua peserta selesai sebelum menjadikan Tryout draf." : undefined}
            >
              <FilePenLine />
              Jadikan draf
            </DropdownMenuItem>
          ) : null}
          {showDuplicate ? (
            <DropdownMenuItem disabled={saving || busy} onClick={() => requestAction("duplicate")}>
              <Copy />
              Duplikat draf baru
            </DropdownMenuItem>
          ) : null}
        </DropdownMenuContent>
      </DropdownMenu>

      <AlertDialog
        onOpenChange={(open) => {
          if (!open && !busy) {
            setActionError(null);
            setPendingAction(null);
          }
        }}
        open={Boolean(pendingAction)}
      >
        <AlertDialogContent pending={busy} variant={pendingAction === "unpublish" ? "warning" : "info"}>
          <AlertDialogHeader>
            <AlertDialogTitle>{pendingAction === "unpublish" ? "Jadikan Tryout draf?" : "Duplikasi Tryout?"}</AlertDialogTitle>
            <AlertDialogDescription>
              {pendingAction === "unpublish"
                ? "Tryout tidak lagi tersedia untuk pendaftaran baru. Riwayat peserta dan AssessmentRelease tetap tersimpan. Perintah ini hanya dapat dilakukan saat tidak ada peserta yang sedang mengerjakan."
                : "Salinan akan dibuat sebagai draf yang dapat diedit. Riwayat peserta dan AssessmentRelease Tryout ini tetap tidak berubah."}
              {actionError ? <span className="mt-2 block text-sm text-danger-600" role="alert">{actionError}</span> : null}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={busy}>Batal</AlertDialogCancel>
            <AlertDialogAction
              disabled={busy || (pendingAction === "unpublish" && hasActiveAttempt)}
              onClick={(event) => {
                event.preventDefault();
                void confirmAction();
              }}
              variant="brand"
            >
              {pendingAction === "unpublish" ? (busy ? "Memproses…" : "Jadikan draf") : <><Copy />{busy ? "Menyalin…" : "Buat salinan"}</>}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}

export { TryoutLifecycleMenu, TryoutWorkspaceHeader };
export type { TryoutWorkspaceTab };
