"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { Search } from "@/lib/icons";
import { useMemo, useState } from "react";

import {
  ReferenceStatusBadge,
  ReferenceSurface,
} from "@/components/dashboard/reference-dashboard-primitives";
import { REFERENCE_CONTROL_CLASS_NAMES } from "@/components/dashboard/reference-dashboard-tokens";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { CompactFilterTabs } from "@/components/ui/compact-filter-tabs";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { buildMentorTryoutAttemptHref } from "@/lib/navigation/canonical-context";
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

function isInProgress(attempt: TryoutOperationsView["attempts"][number]) {
  return attempt.status === "in_progress" || attempt.attemptState === "in_progress";
}

function initials(name: string) {
  return (
    name
      .split(/\s+/u)
      .filter(Boolean)
      .slice(0, 2)
      .map((part) => part[0])
      .join("")
      .toUpperCase() || "P"
  );
}

function TryoutAttemptRow({
  attempt,
  parentId,
  result,
  tryoutId,
}: {
  attempt: TryoutOperationsView["attempts"][number];
  parentId?: string;
  result?: TryoutOperationsView["results"][number];
  tryoutId: string;
}) {
  const router = useRouter();
  const inProgress = isInProgress(attempt);
  const href = buildMentorTryoutAttemptHref(tryoutId, attempt.id, {
    parent: parentId,
    participant: attempt.admissionId,
    session: attempt.sessionId,
  });

  function navigateToAttempt() {
    router.push(href);
  }

  return (
    <TableRow
      className="cursor-pointer border-primary-100 hover:bg-primary-50/40"
      onClick={navigateToAttempt}
    >
      <TableCell className="px-5 py-4">
        <Link
          aria-label={`Buka hasil pengerjaan ${attempt.student}`}
          className="flex min-w-0 items-center gap-3 rounded-lg outline-none focus-visible:ring-3 focus-visible:ring-primary-700/25"
          href={href}
          onClick={(event) => event.stopPropagation()}
        >
          <Avatar className="size-9 border border-primary-100 bg-primary-50">
            <AvatarFallback className="bg-primary-50 text-xs font-bold text-primary-800">
              {initials(attempt.student)}
            </AvatarFallback>
          </Avatar>
          <span className="truncate font-semibold text-secondary-900 hover:text-primary-800">
            {attempt.student}
          </span>
        </Link>
      </TableCell>
      <TableCell className="px-4 py-4">
        <span className="flex justify-center tabular-nums text-secondary-900">
          {inProgress
            ? "—"
            : result?.scoreVisible && result.displayScore !== null
              ? Number(result.displayScore).toFixed(2)
              : "Belum tersedia"}
        </span>
      </TableCell>
      <TableCell className="px-4 py-4">
        <ReferenceStatusBadge
          appearance="mentor"
          label={inProgress ? "Sedang dikerjakan" : "Terkirim"}
          size="xs"
          status={inProgress ? "in_progress" : "completed"}
        />
      </TableCell>
      <TableCell className="px-5 py-4 text-sm text-secondary-600">
        {attempt.serverStartedAt ? (
          <time dateTime={attempt.serverStartedAt}>
            {dateTime.format(new Date(attempt.serverStartedAt))}
          </time>
        ) : (
          "—"
        )}
      </TableCell>
    </TableRow>
  );
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

  return (
    <Root className={embedded ? "w-full" : "w-full px-4 py-5 sm:px-6 lg:px-8"}>
      <div className="space-y-5">
        <div>
          <h2 className="font-heading text-xl leading-tight font-semibold tracking-[-0.025em] text-secondary-900 md:text-2xl">
            Hasil Tryout
          </h2>
        </div>
        <ReferenceSurface as="section" className="p-4 md:p-5">
          <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
            <label className="relative block min-w-0 flex-1 lg:max-w-md">
              <span className="sr-only">Cari nama peserta</span>
              <Search
                aria-hidden="true"
                className="pointer-events-none absolute top-1/2 left-4 size-4 -translate-y-1/2 text-primary-700"
              />
              <input
                className={`${REFERENCE_CONTROL_CLASS_NAMES.input} pl-11`}
                onChange={(event) => setQuery(event.target.value)}
                placeholder="Cari nama peserta…"
                type="search"
                value={query}
              />
            </label>
            <CompactFilterTabs
              aria-label="Filter hasil"
              items={resultFilterTabs}
              onValueChange={setFilter}
              value={filter}
            />
          </div>
          <div className="mt-5 overflow-x-auto rounded-2xl border border-primary-100">
            <Table className="min-w-[640px]">
              <TableHeader className="bg-primary-50/75">
                <TableRow className="hover:bg-primary-50/75">
                  <TableHead className="h-auto px-5 py-3 text-xs font-bold tracking-[0.08em] text-secondary-500 uppercase">
                    Nama
                  </TableHead>
                  <TableHead className="h-auto w-28 px-4 py-3 text-xs font-bold tracking-[0.08em] text-secondary-500 uppercase">
                    Skor
                  </TableHead>
                  <TableHead className="h-auto w-36 px-4 py-3 text-xs font-bold tracking-[0.08em] text-secondary-500 uppercase">
                    Status
                  </TableHead>
                  <TableHead className="h-auto w-44 px-5 py-3 text-xs font-bold tracking-[0.08em] text-secondary-500 uppercase">
                    Mulai
                  </TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {visibleAttempts.length ? (
                  visibleAttempts.map((attempt) => (
                    <TryoutAttemptRow
                      attempt={attempt}
                      key={attempt.id}
                      parentId={parentId}
                      result={resultByAttemptId.get(attempt.id)}
                      tryoutId={initial.id}
                    />
                  ))
                ) : (
                  <TableRow>
                    <TableCell
                      className="h-32 text-center text-sm text-secondary-500"
                      colSpan={4}
                    >
                      Belum ada hasil yang sesuai.
                    </TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>
          </div>
        </ReferenceSurface>
      </div>
    </Root>
  );
}

export { KaptenTryoutParticipantsPageModule };
