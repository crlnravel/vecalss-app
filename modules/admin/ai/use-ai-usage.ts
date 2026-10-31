"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { VeraAiUsageBreakdownDto } from "@/lib/admin/ai/contracts";
import { startOfWibDay } from "@/lib/admin/ai/periods";

export type MetricOption = "quota_units" | "requests" | "tokens" | "cost";
export type PeriodOption = "today" | "7days" | "30days";

export function useAiUsage() {
  const [metric, setMetric] = useState<MetricOption>("quota_units");
  const [period, setPeriod] = useState<PeriodOption>("today");
  const [data, setData] = useState<VeraAiUsageBreakdownDto | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [lastRefreshedAt, setLastRefreshedAt] = useState<Date | null>(null);
  const request = useRef({ id: 0, controller: null as AbortController | null });

  const cancelRequest = useCallback(() => {
    request.current.id += 1;
    request.current.controller?.abort();
  }, []);

  function prepareSelection() {
    cancelRequest();
    setError(null);
    setIsLoading(true);
  }

  function selectMetric(value: MetricOption) {
    if (value === metric) return;
    prepareSelection();
    setMetric(value);
  }

  function selectPeriod(value: PeriodOption) {
    if (value === period) return;
    prepareSelection();
    setPeriod(value);
  }

  const loadUsage = useCallback(async () => {
    cancelRequest();
    const id = request.current.id;
    const controller = new AbortController();
    request.current.controller = controller;
    setIsLoading(true);
    setError(null);
    const to = new Date();
    const from = startOfWibDay(to);
    from.setUTCDate(from.getUTCDate() - (period === "today" ? 0 : period === "7days" ? 6 : 29));
    const params = new URLSearchParams({ metric, groupBy: "feature", from: from.toISOString(), to: to.toISOString(), timezone: "Asia/Jakarta" });
    try {
      const res = await fetch(`/api/admin/ai/usage?${params}`, { cache: "no-store", signal: controller.signal });
      if (!res.ok) throw new Error("Usage unavailable");
      const json = await res.json() as VeraAiUsageBreakdownDto;
      if (id !== request.current.id || controller.signal.aborted) return;
      setData(json);
      setLastRefreshedAt(new Date());
    } catch {
      if (id !== request.current.id || controller.signal.aborted) return;
      setError("Data penggunaan Vera AI belum berhasil dimuat. Segarkan halaman untuk mencoba lagi.");
    } finally {
      if (id === request.current.id && !controller.signal.aborted) setIsLoading(false);
    }
  }, [metric, period, cancelRequest]);

  useEffect(() => {
    const timer = window.setTimeout(() => void loadUsage(), 0);
    return () => { window.clearTimeout(timer); cancelRequest(); };
  }, [loadUsage, cancelRequest]);

  return { metric, period, data, isLoading, error, lastRefreshedAt, selectMetric, selectPeriod, loadUsage };
}
