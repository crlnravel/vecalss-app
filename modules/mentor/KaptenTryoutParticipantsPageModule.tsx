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
import { buildMentorTryoutAttemptHref, buildMentorTryoutHref, buildMentorTryoutOperationsHref, parseMentorTryoutContext, type TryoutResultFilter } from "@/lib/navigation/canonical-context";
import type { TryoutOperationsView } from "@/lib/tryout/operations-view";
import { selectMainTryoutSession } from "@/lib/tryout/main-session";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { Button } from "@/components/ui/button";
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
}: {
  embedded?: boolean;
  initial: TryoutOperationsView;
  parentId?: string;
  resultMaintenance?: boolean;
}) {
  const router = useRouter();
  const context = parseMentorTryoutContext(useSearchParams());
  const selectedSession = initial.sessions?.find((session) => session.id === context.session) ?? selectMainTryoutSession(initial.sessions ?? []);
  const selectedSessionId = selectedSession?.id;
  const [query, setQuery] = useState(context.resultQ ?? "");
  const [filter, setFilter] = useState<ResultFilter>(context.resultStatus ?? "all");
  const preserveFilters = (nextQuery: string, nextFilter: ResultFilter) => {
    window.history.replaceState(null, "", buildMentorTryoutHref(initial.id, {
      parent: parentId ?? context.parent,
      returnTo: context.returnTo,
      session: selectedSession?.id ?? context.session,
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
    return matchesQuery && matchesStatus && (!selectedSessionId || attempt.sessionId === selectedSessionId);
  });
  const Root = embedded ? "section" : "main";
  const attemptHref = (attempt: TryoutOperationsView["attempts"][number]) =>
    buildMentorTryoutAttemptHref(initial.id, attempt.id, {
      parent: parentId ?? context.parent,
      returnTo: context.returnTo,
      participant: attempt.admissionId,
      session: attempt.sessionId,
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
      headerClassName: "w-[40%] rounded-l-xl",
      id: "participant",
      label: "Peserta",
      width: 40,
    },
    {
      cell: (attempt) => {
        const result = resultByAttemptId.get(attempt.id);
        const inProgress = isInProgress(attempt);
        return (
          <span className="block min-w-0 truncate tabular-nums text-secondary-700">
            {inProgress
              ? "—"
              : result?.scoreVisible && result.displayScore !== null
                ? Number(result.displayScore).toFixed(2)
                : "Belum tersedia"}
          </span>
        );
      },
      headerClassName: "w-[20%]",
      id: "score",
      label: "Skor",
      width: 20,
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
      headerClassName: "w-[20%]",
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
      headerClassName: "w-[20%] rounded-r-xl",
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
      <div className="flex min-w-0 flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        {selectedSession ? (
          <DropdownMenu>
            <DropdownMenuTrigger render={<Button variant="outline" className="min-h-11 w-full max-w-full justify-start whitespace-normal text-left sm:w-auto" />}>
              Sesi: {selectedSession.name}
            </DropdownMenuTrigger>
            <DropdownMenuContent>
              {initial.sessions.map((session) => (
                <DropdownMenuItem key={session.id} render={<Link href={buildMentorTryoutHref(initial.id, { ...context, parent: parentId ?? context.parent, session: session.id, workspace: "participants", resultQ: query, resultStatus: filter })} />}>
                  {session.name}
                </DropdownMenuItem>
              ))}
            </DropdownMenuContent>
          </DropdownMenu>
        ) : null}
        <Link className="inline-flex min-h-11 w-fit items-center text-sm font-semibold text-primary-800 underline-offset-4 hover:underline focus-visible:rounded-control focus-visible:outline focus-visible:outline-3 focus-visible:outline-offset-2" href={buildMentorTryoutOperationsHref(initial.id, { delivery: "participants", parent: parentId })}>
          Kelola peserta
        </Link>
      </div>
      {selectedSession ? (
        <TryoutSessionResultReadiness key={selectedSession.id} scope={{ tryoutId: initial.id, sessionId: selectedSession.id }} tryoutTitle={initial.title} allowPublication={resultMaintenance} context={{ ...context, parent: parentId ?? context.parent, resultQ: query, resultStatus: filter }} />
      ) : null}
      <ReferenceSurface as="section" aria-labelledby="tryout-attempts-title" className="mt-5 overflow-hidden">
        <div className="flex flex-wrap items-center justify-between gap-2 border-b border-primary-100 px-4 py-4 sm:px-5">
          <h3 className="text-base font-semibold text-secondary-900" id="tryout-attempts-title">Pengerjaan peserta</h3>
          <p className="text-sm tabular-nums text-secondary-600">{visibleAttempts.length} ditampilkan</p>
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
