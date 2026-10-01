"use client";

import { useCallback, useEffect, useRef, useState } from "react";

import { RefreshCw } from "@/lib/icons";
import type { TryoutOperationsView } from "@/lib/tryout/operations-view";
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
  const [lastUpdatedAt, setLastUpdatedAt] = useState<string | null>(null);
  const refreshInFlight = useRef(false);
  const automaticFailureCount = useRef(0);

  const refresh = useCallback(async () => {
    if (refreshInFlight.current) return;
    refreshInFlight.current = true;
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
    }
  }, [initial.id]);

  const retryRefresh = useCallback(() => {
    automaticFailureCount.current = 0;
    void refresh();
  }, [refresh]);

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
    refreshMessage,
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
        Perbarui data
      </Button>
      <div className="text-right text-xs text-secondary-500" aria-live="polite">
        {refreshState === "refreshing" ? "Memperbarui data Tryout…" : updatedLabel ? `Data diperbarui ${updatedLabel}` : "Menunggu pembaruan data"}
      </div>
    </div>
  );
}

function TryoutRefreshNotice({ message, onRetry }: { message: string | null; onRetry: () => void }) {
  if (!message) return null;
  return (
    <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-[var(--warning-200)] bg-[var(--warning-50)] px-4 py-3.5 text-sm leading-6 text-[var(--voyage-warm-sun-ink)]" role="alert">
      <span>Data mungkin tertinggal. {message}</span>
      <Button onClick={onRetry} size="sm" variant="outline">Coba lagi</Button>
    </div>
  );
}

export { TryoutRefreshNotice, TryoutRefreshToolbar, useTryoutOperationsRefresh };
