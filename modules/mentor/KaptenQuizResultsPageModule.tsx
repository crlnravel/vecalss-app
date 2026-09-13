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
import type { SessionContext } from "@/lib/auth/types";
import { MentorWorkspaceShell } from "@/modules/mentor/components/mentor-workspace-shell";

type Attempt = {
  aggregateScore: number | null;
  correctCount: number | null;
  createdAt: string;
  finalScore: number | null;
  id: string;
  participationId: string;
  score: number | null;
  status: string;
  student: { name: string };
  submittedAt: string | null;
};

type Result = {
  attempts: Attempt[];
  quiz: { id: string; questionCount: number; subject: string; title: string };
};

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

function KaptenQuizResultsContent({ result }: { result: Result }) {
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState<"all" | "in_progress" | "submitted">(
    "all",
  );
  const visibleAttempts = useMemo(
    () =>
      result.attempts.filter((attempt) => {
        const matchesQuery =
          !query.trim() ||
          attempt.student.name
            .toLocaleLowerCase()
            .includes(query.trim().toLocaleLowerCase());
        const matchesStatus =
          filter === "all" ||
          (filter === "submitted"
            ? attempt.status !== "in_progress"
            : attempt.status === "in_progress");
        return matchesQuery && matchesStatus;
      }),
    [filter, query, result.attempts],
  );

  return (
    <div className="space-y-5">
      <div>
        <h2 className="font-heading text-xl leading-tight font-semibold tracking-[-0.025em] text-secondary-900 md:text-2xl">
          Hasil Kuis
        </h2>
      </div>
      <ReferenceSurface as="section" className="p-4 md:p-5">
        <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
          <label className="relative block min-w-0 flex-1 lg:max-w-md">
            <span className="sr-only">Cari nama siswa</span>
            <Search
              aria-hidden="true"
              className="pointer-events-none absolute top-1/2 left-4 size-4 -translate-y-1/2 text-primary-700"
            />
            <input
              className={`${REFERENCE_CONTROL_CLASS_NAMES.input} pl-11`}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Cari nama siswa…"
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
                  <AttemptRow
                    attempt={attempt}
                    key={attempt.id}
                    quizId={result.quiz.id}
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
  );
}

function AttemptRow({ attempt, quizId }: { attempt: Attempt; quizId: string }) {
  const isSubmitted = attempt.status !== "in_progress";
  const router = useRouter();
  const href = `/mentor/quiz/${quizId}/results/${attempt.id}`;

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
          aria-label={`Buka hasil pengerjaan ${attempt.student.name}`}
          className="flex min-w-0 items-center gap-3 rounded-lg outline-none focus-visible:ring-3 focus-visible:ring-primary-700/25"
          href={href}
          onClick={(event) => event.stopPropagation()}
        >
          <Avatar className="size-9 border border-primary-100 bg-primary-50">
            <AvatarFallback className="bg-primary-50 text-xs font-bold text-primary-800">
              {initials(attempt.student.name)}
            </AvatarFallback>
          </Avatar>
          <span className="truncate font-semibold text-secondary-900 hover:text-primary-800">
            {attempt.student.name}
          </span>
        </Link>
      </TableCell>
      <TableCell className="px-4 py-4">
        <span className="text-center justify-center tabular-nums text-secondary-900">
          {isSubmitted
            ? (attempt.aggregateScore ??
              attempt.finalScore ??
              attempt.score ??
              0)
            : "—"}
        </span>
      </TableCell>
      <TableCell className="px-4 py-4">
        <ReferenceStatusBadge
          appearance="mentor"
          label={isSubmitted ? "Terkirim" : "Sedang dikerjakan"}
          size="xs"
          status={isSubmitted ? "completed" : "in_progress"}
        />
      </TableCell>
      <TableCell className="px-5 py-4 text-sm text-secondary-600">
        <time dateTime={attempt.createdAt}>
          {dateTime.format(new Date(attempt.createdAt))}
        </time>
      </TableCell>
    </TableRow>
  );
}

function initials(name: string) {
  return (
    name
      .split(/\s+/)
      .filter(Boolean)
      .slice(0, 2)
      .map((part) => part[0])
      .join("")
      .toUpperCase() || "S"
  );
}

function KaptenQuizResultsPageModule({
  result,
  session,
}: {
  result: Result;
  session: SessionContext;
}) {
  return (
    <MentorWorkspaceShell
      activeLabel="Kuis"
      breadcrumbLabel={`${result.quiz.subject} · Hasil Kuis`}
      contentElement="div"
      session={session}
      showSearch={false}
      sidebarAppearance="reference"
    >
      <KaptenQuizResultsContent result={result} />
    </MentorWorkspaceShell>
  );
}

export { KaptenQuizResultsContent, KaptenQuizResultsPageModule };
export type { Result as KaptenQuizResultsData };
