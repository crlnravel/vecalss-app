"use client";

import { useCallback, useEffect, useRef, useState } from "react";

import { RefreshCw } from "@/lib/icons";
import type { TryoutOperationsView } from "@/lib/tryout/operations-view";
import { usePageStatusToast } from "@/components/ui/use-page-status-toast";
import { refreshTryoutLiveAction } from "@/modules/mentor/tryout-operations-actions";
import { Button } from "@/components/ui/button";

const LIVE_REFRESH_INTERVAL_MS = 15_000;
const MAX_AUTO_REFRESH_FAILURES = 3;

const timestampFormatter = new Intl.DateTimeFormat("id-ID", {
  hour: "2-digit",
  minute: "2-digit",
  second: "2-digit",
  timeZone: "Asia/Jakarta",
});

function formatTimestamp(value: string | null) {
  if (!value) return null;
  return timestampFormatter.format(new Date(value));
}

function useTryoutOperationsRefresh(initial: TryoutOperationsView) {
  const [view, setView] = useState(initial);
  const [refreshState, setRefreshState] = useState<"idle" | "refreshing" | "error">("idle");
  const [refreshMessage, setRefreshMessage] = useState<string | null>(null);
  const [manualRefreshPending, setManualRefreshPending] = useState(false);
  const [lastUpdatedAt, setLastUpdatedAt] = useState<string | null>(null);
  const refreshInFlight = useRef(false);
  const automaticFailureCount = useRef(0);

  const refresh = useCallback(async (showPendingStatus = false) => {
    if (refreshInFlight.current) return;
    refreshInFlight.current = true;
    if (showPendingStatus) setManualRefreshPending(true);
    setRefreshState("refreshing");
    try {
      const result = await refreshTryoutLiveAction(initial.id);
      if (!result.ok) {
        automaticFailureCount.current += 1;
        setRefreshState("error");
        setRefreshMessage(automaticFailureCount.current >= MAX_AUTO_REFRESH_FAILURES
          ? "Pembaruan otomatis Tryout dihentikan setelah beberapa kali gagal. Coba lagi secara manual."
          : result.message);
        return;
      }
      automaticFailureCount.current = 0;
      setView(result.result);
      setLastUpdatedAt(result.serverUpdatedAt);
      setRefreshState("idle");
      setRefreshMessage(null);
    } catch {
      automaticFailureCount.current += 1;
      setRefreshState("error");
      setRefreshMessage(automaticFailureCount.current >= MAX_AUTO_REFRESH_FAILURES
        ? "Pembaruan otomatis Tryout dihentikan setelah beberapa kali gagal. Coba lagi secara manual."
        : "Data operasional Tryout belum berhasil diperbarui. Coba lagi.");
    } finally {
      refreshInFlight.current = false;
      if (showPendingStatus) setManualRefreshPending(false);
    }
  }, [initial.id]);

  const retryRefresh = useCallback(() => {
    automaticFailureCount.current = 0;
    void refresh(true);
  }, [refresh]);

  usePageStatusToast({
    active: manualRefreshPending || Boolean(refreshMessage),
    description: !manualRefreshPending && refreshMessage
      ? `Data mungkin tertinggal. ${refreshMessage}`
      : undefined,
    message: manualRefreshPending
      ? "Memperbarui data Tryout…"
      : "Data Tryout belum berhasil diperbarui",
    variant: manualRefreshPending ? "info" : "warning",
    action: refreshMessage && !manualRefreshPending
      ? { label: "Coba lagi", onClick: retryRefresh }
      : undefined,
  });

  useEffect(() => {
    const poll = () => {
      if (document.visibilityState === "visible" && automaticFailureCount.current < MAX_AUTO_REFRESH_FAILURES) {
        void refresh();
      }
    };
    const interval = window.setInterval(poll, LIVE_REFRESH_INTERVAL_MS);
    const onVisibilityChange = () => {
      if (document.visibilityState === "visible") poll();
    };
    document.addEventListener("visibilitychange", onVisibilityChange);
    return () => {
      window.clearInterval(interval);
      document.removeEventListener("visibilitychange", onVisibilityChange);
    };
  }, [refresh]);

  return {
    lastUpdatedAt,
    refreshState,
    retryRefresh,
    updatedLabel: formatTimestamp(lastUpdatedAt),
    view,
  };
}

function TryoutRefreshToolbar({
  ariaLabel,
  onRefresh,
  refreshState,
  updatedLabel,
}: {
  ariaLabel: string;
  onRefresh: () => void;
  refreshState: "idle" | "refreshing" | "error";
  updatedLabel: string | null;
}) {
  return (
    <div className="flex flex-col items-end gap-1.5">
      <Button
        aria-label={ariaLabel}
        disabled={refreshState === "refreshing"}
        onClick={onRefresh}
        size="sm"
        variant="outline"
      >
        <RefreshCw className={refreshState === "refreshing" ? "animate-spin" : undefined} data-icon="inline-start" />
        {refreshState === "refreshing" ? "Memperbarui…" : "Perbarui data"}
      </Button>
      {updatedLabel ? <p className="text-right text-xs text-secondary-500">Pembaruan terakhir {updatedLabel}</p> : null}
    </div>
  );
}

export { TryoutRefreshToolbar, useTryoutOperationsRefresh };
