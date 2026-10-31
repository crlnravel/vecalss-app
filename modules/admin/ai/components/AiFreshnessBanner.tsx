"use client";

import { Clock, Info } from "@/lib/icons";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTitle, PopoverTrigger } from "@/components/ui/popover";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import type { FreshnessState } from "@/lib/admin/ai/contracts";

type AiFreshnessBannerProps = {
  policyVersion?: string | null;
  activatedAt?: string | null;
  freshness: FreshnessState;
};

type SourceState = FreshnessState["requests"]["state"] | FreshnessState["cost"]["state"];

const COMPACT_TIME = new Intl.DateTimeFormat("id-ID", {
  day: "numeric", month: "short", hour: "2-digit", minute: "2-digit", timeZone: "Asia/Jakarta",
});
const FULL_TIME = new Intl.DateTimeFormat("id-ID", {
  dateStyle: "medium", timeStyle: "short", timeZone: "Asia/Jakarta",
});

function stateLabel(state: SourceState) {
  if (state === "live" || state === "fresh") return "Terkini";
  if (state === "snapshot") return "Saat dimuat";
  if (state === "partial") return "Sebagian tersedia";
  if (state === "suppressed") return "Disembunyikan";
  if (state === "stale") return "Perlu disegarkan";
  return "Belum tersedia";
}

function isException(state: SourceState) {
  return state === "partial" || state === "suppressed" || state === "stale" || state === "unavailable";
}

function formatTime(value: string) {
  const date = new Date(value);
  return Number.isFinite(date.getTime()) ? `${FULL_TIME.format(date)} WIB` : "Waktu belum tersedia";
}

export function AiFreshnessBanner({ policyVersion, activatedAt, freshness }: AiFreshnessBannerProps) {
  const sources = [
    { name: "Permintaan", data: freshness.requests },
    { name: "Kuota", data: freshness.quota },
    { name: "Biaya", data: freshness.cost },
    { name: "Analitik", data: freshness.analytics },
  ];
  const exceptions = sources.filter(source => isException(source.data.state));
  const sharedException = exceptions.length === sources.length && exceptions.every(source => source.data.state === exceptions[0].data.state);
  const observedTimes = sources
    .filter(source => source.data.state !== "unavailable" && source.data.state !== "suppressed")
    .map(source => Date.parse(source.data.asOf))
    .filter(Number.isFinite);
  // The oldest included snapshot is the conservative summary when sources differ.
  const asOf = observedTimes.length ? new Date(Math.min(...observedTimes)) : null;
  const sameTimestamp = sources.every(source => source.data.asOf === sources[0].data.asOf);

  return (
    <div className="flex flex-wrap items-center gap-x-3 gap-y-2 text-xs text-secondary-600">
      <div className="flex items-center gap-2">
        <Clock aria-hidden="true" className="size-4 shrink-0" />
        {sharedException ? (
          <span>Data {stateLabel(exceptions[0].data.state).toLocaleLowerCase("id-ID")}</span>
        ) : asOf ? (
          <span>Data per <time className="font-semibold text-secondary-800" dateTime={asOf.toISOString()}>{COMPACT_TIME.format(asOf)} WIB</time></span>
        ) : <span>Waktu data belum tersedia</span>}
      </div>

      {!sharedException && exceptions.map(source => (
        <Badge key={source.name} size="sm" tone={source.data.state === "partial" || source.data.state === "stale" ? "attention" : "neutral"}>
          {source.name}: {stateLabel(source.data.state).toLocaleLowerCase("id-ID")}
        </Badge>
      ))}

      <Popover>
        <Tooltip>
          <TooltipTrigger render={<PopoverTrigger render={<Button aria-label="Lihat rincian sumber data" className="-my-2" size="icon" type="button" variant="quiet" />} />}>
            <Info aria-hidden="true" className="size-4" />
          </TooltipTrigger>
          <TooltipContent>Rincian sumber data</TooltipContent>
        </Tooltip>
        <PopoverContent align="start" className="w-80 max-w-[calc(100vw-2rem)] gap-3 motion-reduce:animate-none">
          <div className="space-y-1">
            <PopoverTitle className="text-sm font-semibold">Sumber data</PopoverTitle>
            {sameTimestamp && <p className="text-xs text-secondary-500">{formatTime(sources[0].data.asOf)}</p>}
          </div>
          <dl className="divide-y divide-primary-100">
            {sources.map(source => (
              <div className="py-2 first:pt-0 last:pb-0" key={source.name}>
                <div className="flex items-center justify-between gap-4 text-xs">
                  <dt className="font-semibold text-secondary-800">{source.name}</dt>
                  <dd className="text-right text-secondary-600">{stateLabel(source.data.state)}</dd>
                </div>
                {(source.data.state === "partial" || source.data.state === "stale") && <p className="mt-1 text-xs text-secondary-600">{source.data.label}</p>}
                {!sameTimestamp && <p className="mt-1 text-xs text-secondary-500">{formatTime(source.data.asOf)}</p>}
              </div>
            ))}
          </dl>
          {(policyVersion || activatedAt) && <p className="border-t border-primary-100 pt-3 text-xs text-secondary-600">{activatedAt ? `Kebijakan berlaku sejak ${formatTime(activatedAt)}.` : "Kebijakan berlaku."}</p>}
        </PopoverContent>
      </Popover>
    </div>
  );
}
