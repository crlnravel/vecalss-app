"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useMemo, useState } from "react";

import { ReferenceSurface } from "@/components/dashboard/reference-dashboard-primitives";
import {
  DataTable,
  type DataTableColumn,
  type DataTableFilter,
} from "@/components/ui/data-table";
import {
  DataTableFilterMenu,
  type DataTableFilterMenuItem,
} from "@/components/ui/data-table-filter-menu";
import { buildMentorTryoutAttemptHref, buildMentorTryoutHref, parseMentorTryoutContext, type TryoutResultFilter } from "@/lib/navigation/canonical-context";
import type { TryoutOperationsView } from "@/lib/tryout/operations-view";
import { TryoutSessionResultReadiness } from "@/modules/mentor/components/tryout-session-result-readiness";
import { navigateTryoutResultHref } from "@/modules/mentor/tryout-result-navigation";

type ResultFilter = TryoutResultFilter;

const dateTime = new Intl.DateTimeFormat("id-ID", {
  dateStyle: "medium",
  timeZone: "Asia/Jakarta",
  timeStyle: "short",
});
const resultFilterTabs = [
  { label: "Semua", value: "all" },
  { label: "Terkirim", value: "submitted" },
  { label: "Berjalan", value: "in_progress" },
] as const;

const resultFilterLabels = Object.fromEntries(
  resultFilterTabs.map((item) => [item.value, item.label]),
) as Record<ResultFilter, string>;

function isInProgress(attempt: TryoutOperationsView["attempts"][number]) {
  return (
    attempt.status === "in_progress" || attempt.attemptState === "in_progress"
  );
}

function TryoutResultFilterPanel({
  filter,
  onChange,
}: {
  filter: ResultFilter;
  onChange: (value: ResultFilter) => void;
}) {
  const filterMenu: DataTableFilterMenuItem = {
    content: (
      <fieldset className="grid gap-0">
        <legend className="sr-only">Status hasil</legend>
        {resultFilterTabs.map((item) => (
          <label
            className="flex min-h-9 cursor-pointer items-center gap-1.5 rounded-lg px-1.5 text-sm font-medium text-secondary-800 transition-colors hover:bg-primary-50/60 focus-within:bg-primary-50/60"
            key={item.value}
          >
            <input
              className="size-3.5 accent-primary-700"
              checked={filter === item.value}
              name="tryout-result-status"
              onChange={() => onChange(item.value)}
              type="radio"
              value={item.value}
            />
            <span>{item.label}</span>
          </label>
        ))}
      </fieldset>
    ),
    id: "status",
    label: "Status",
    summary: resultFilterLabels[filter],
  };

  return <DataTableFilterMenu filters={[filterMenu]} />;
}

function KaptenTryoutParticipantsPageModule({
  embedded = false,
  initial,
  parentId,
  resultMaintenance = true,
  showReadiness = true,
}: {
  embedded?: boolean;
  initial: TryoutOperationsView;
  parentId?: string;
  resultMaintenance?: boolean;
  showReadiness?: boolean;
}) {
  const router = useRouter();
  const context = parseMentorTryoutContext(useSearchParams());
  const selectedSession = initial.session;
  const [query, setQuery] = useState(context.resultQ ?? "");
  const [filter, setFilter] = useState<ResultFilter>(context.resultStatus ?? "all");
  const preserveFilters = (nextQuery: string, nextFilter: ResultFilter) => {
    window.history.replaceState(null, "", buildMentorTryoutHref(initial.id, {
      parent: parentId ?? context.parent,
      returnTo: context.returnTo,
      workspace: "participants",
      resultQ: nextQuery,
      resultStatus: nextFilter,
    }));
  };
  const changeQuery = (value: string) => { setQuery(value); preserveFilters(value, filter); };
  const changeFilter = (value: ResultFilter) => { setFilter(value); preserveFilters(query, value); };
  const resultByAttemptId = useMemo(
    () => new Map(initial.results.map((result) => [result.attemptId, result])),
    [initial.results],
  );
  const visibleAttempts = initial.attempts.filter((attempt) => {
    const matchesQuery =
      !query.trim() ||
      attempt.student
        .toLocaleLowerCase()
        .includes(query.trim().toLocaleLowerCase());
    const inProgress = isInProgress(attempt);
    const matchesStatus =
      filter === "all" ||
      (filter === "submitted" ? !inProgress : inProgress);
    return matchesQuery && matchesStatus;
  });
  const Root = embedded ? "section" : "main";
  const attemptHref = (attempt: TryoutOperationsView["attempts"][number]) =>
    buildMentorTryoutAttemptHref(initial.id, attempt.id, {
      parent: parentId ?? context.parent,
      returnTo: context.returnTo,
      participant: attempt.admissionId,
      workspace: "participants",
      resultQ: query,
      resultStatus: filter,
    });
  const columns: DataTableColumn<TryoutOperationsView["attempts"][number]>[] = [
    {
      cell: (attempt) => {
        const href = attemptHref(attempt);
        return (
          <Link
            aria-label={`Buka hasil pengerjaan ${attempt.student}`}
            className="block min-w-0 truncate rounded-lg font-semibold text-secondary-900 outline-none hover:text-primary-800 focus-visible:ring-3 focus-visible:ring-primary-700/25"
            href={href}
          >
            {attempt.student}
          </Link>
        );
      },
      headerClassName: "w-[36%] rounded-l-xl",
      id: "participant",
      label: "Peserta",
      width: 36,
    },
    {
      cell: (attempt) => {
        const result = resultByAttemptId.get(attempt.id);
        const inProgress = isInProgress(attempt);
        return (
          <span className="block min-w-0 tabular-nums text-secondary-700 sm:truncate">
            {inProgress
              ? "—"
              : result?.scoreVisible && result.displayScore !== null
                ? Number(result.displayScore).toFixed(2)
                : "Belum tersedia"}
          </span>
        );
      },
      headerClassName: "w-[24%]",
      id: "score",
      label: "Skor",
      width: 24,
    },
    {
      cell: (attempt) => {
        const inProgress = isInProgress(attempt);
        return (
          <span className="block min-w-0 truncate text-secondary-700">
            {inProgress ? "Sedang dikerjakan" : "Terkirim"}
          </span>
        );
      },
      headerClassName: "w-[20%] max-sm:rounded-r-xl",
      id: "status",
      label: "Status",
      width: 20,
    },
    {
      cell: (attempt) => (
        <time
          className="block min-w-0 truncate text-secondary-700"
          dateTime={attempt.serverStartedAt ?? undefined}
        >
          {attempt.serverStartedAt
            ? dateTime.format(new Date(attempt.serverStartedAt))
            : "—"}
        </time>
      ),
      cellClassName: "hidden sm:table-cell",
      headerClassName: "hidden w-[20%] rounded-r-xl sm:table-cell",
      id: "started",
      label: "Mulai",
      width: 20,
    },
  ];
  const filters: DataTableFilter[] =
    filter === "all"
      ? []
      : [{ id: "status", label: "Status", value: resultFilterLabels[filter] }];

  return (
    <Root
      aria-labelledby="tryout-results-title"
      className={
        embedded ? "min-w-0 w-full" : "min-w-0 w-full px-4 py-5 sm:px-6 lg:px-8"
      }
    >
      <h2 className="sr-only" id="tryout-results-title">
        Hasil Tryout
      </h2>
      {selectedSession && showReadiness ? (
        <TryoutSessionResultReadiness
          compact
          key={selectedSession.id}
          scope={{ tryoutId: initial.id, sessionId: selectedSession.id }}
          tryoutTitle={initial.title}
          allowPublication={resultMaintenance}
          context={{ ...context, parent: parentId ?? context.parent, resultQ: query, resultStatus: filter }}
        />
      ) : null}
      <ReferenceSurface as="section" aria-labelledby="tryout-attempts-title" className="overflow-hidden">
        <div className="flex flex-wrap items-center justify-between gap-2 border-b border-primary-100 px-4 py-4 sm:px-5">
          <h3 className="text-base font-semibold text-secondary-900" id="tryout-attempts-title">Pengerjaan peserta</h3>
          <div className="flex min-w-0 items-center gap-3">
            <p className="text-sm tabular-nums text-secondary-600">{visibleAttempts.length} ditampilkan</p>
          </div>
        </div>
        <DataTable
          caption="Hasil pengerjaan peserta Tryout"
          columns={columns}
          emptyState={
            <div className="px-5 py-8 text-center text-sm text-secondary-600">
              Belum ada hasil yang sesuai.
            </div>
          }
          getRowId={(attempt) => attempt.id}
          onRowClick={(attempt) => navigateTryoutResultHref(attemptHref(attempt), (href) => router.push(href))}
          filterPanel={
            <TryoutResultFilterPanel filter={filter} onChange={changeFilter} />
          }
          filters={filters}
          rowProps={(attempt) => ({
            "aria-label": `Buka hasil pengerjaan ${attempt.student}`,
            "data-tryout-result-row": "true",
          })}
          rows={visibleAttempts}
          search={{
            label: "Cari hasil peserta",
            onValueChange: changeQuery,
            placeholder: "Cari nama peserta…",
            value: query,
          }}
          tableClassName="w-full min-w-0"
        />
      </ReferenceSurface>
    </Root>
  );
}

export { KaptenTryoutParticipantsPageModule };
