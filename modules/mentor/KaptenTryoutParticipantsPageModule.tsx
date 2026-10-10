"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
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
import { buildMentorTryoutAttemptHref, buildMentorTryoutOperationsHref } from "@/lib/navigation/canonical-context";
import type { TryoutOperationsView } from "@/lib/tryout/operations-view";

type ResultFilter = "all" | "in_progress" | "submitted";

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
}: {
  embedded?: boolean;
  initial: TryoutOperationsView;
  parentId?: string;
}) {
  const router = useRouter();
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState<ResultFilter>("all");
  const resultByAttemptId = useMemo(
    () => new Map(initial.results.map((result) => [result.attemptId, result])),
    [initial.results],
  );
  const visibleAttempts = useMemo(
    () =>
      initial.attempts.filter((attempt) => {
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
      }),
    [filter, initial.attempts, query],
  );
  const Root = embedded ? "section" : "main";
  const attemptHref = (attempt: TryoutOperationsView["attempts"][number]) =>
    buildMentorTryoutAttemptHref(initial.id, attempt.id, {
      parent: parentId,
      participant: attempt.admissionId,
      session: attempt.sessionId,
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
      <Link className="inline-flex min-h-11 items-center font-semibold text-primary-800" href={buildMentorTryoutOperationsHref(initial.id, { delivery: "participants", parent: parentId })}>Kelola peserta</Link>
      <ReferenceSurface as="section" className="overflow-hidden mt-5">
        <DataTable
          caption="Hasil pengerjaan peserta Tryout"
          columns={columns}
          emptyState={
            <div className="px-5 py-8 text-center text-sm text-secondary-600">
              Belum ada hasil yang sesuai.
            </div>
          }
          getRowId={(attempt) => attempt.id}
          onRowClick={(attempt) => router.push(attemptHref(attempt))}
          filterPanel={
            <TryoutResultFilterPanel filter={filter} onChange={setFilter} />
          }
          filters={filters}
          rowProps={(attempt) => ({
            "aria-label": `Buka hasil pengerjaan ${attempt.student}`,
            "data-tryout-result-row": "true",
          })}
          rows={visibleAttempts}
          search={{
            label: "Cari hasil peserta",
            onValueChange: setQuery,
            placeholder: "Cari peserta atau ID…",
            value: query,
          }}
          tableClassName="w-full min-w-0"
        />
      </ReferenceSurface>
    </Root>
  );
}

export { KaptenTryoutParticipantsPageModule };
