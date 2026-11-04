import type { Metadata } from "next";
import Link from "next/link";

import { requireAdminSession } from "@/lib/auth/access";
import { FRAUD_SIGNALS, isFraudSignal } from "@/lib/fraud/constants";
import { CASE_STATES, countCasesByState, listCases, type CaseStateFilter } from "@/lib/fraud/queries";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { firstParam, formatDateTime, FraudPage, SeverityBadge, StateBadge } from "@/modules/admin/fraud/shared";
import { cn } from "@/lib/utils";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Fraud | Admin PTN Pro" };

const FILTERS: Array<{ id: CaseStateFilter; label: string }> = [
  { id: "active", label: "Belum selesai" },
  { id: "open", label: "Baru" },
  { id: "acknowledged", label: "Sudah dilihat" },
  { id: "escalated", label: "Dieskalasi" },
  { id: "closed", label: "Ditutup" },
];

export default async function AdminFraudQueuePage({ searchParams }: { searchParams: Promise<{ [key: string]: string | string[] | undefined }> }) {
  const session = await requireAdminSession();
  const params = await searchParams;
  const requested = firstParam(params.state);
  const filter: CaseStateFilter = requested === "active" || CASE_STATES.some((state) => state === requested) ? (requested as CaseStateFilter) : "active";
  const [cases, counts] = await Promise.all([listCases(filter), countCasesByState()]);

  return (
    <FraudPage active="cases" done={firstParam(params.done)} error={firstParam(params.error)} session={session} title="Antrean kasus">
      <div className="mb-4 flex flex-wrap gap-2" role="group" aria-label="Saring kasus">
        {FILTERS.map((item) => {
          const count = item.id === "active" ? (counts.open ?? 0) + (counts.acknowledged ?? 0) + (counts.escalated ?? 0) : (counts[item.id] ?? 0);
          return (
            <Link
              aria-current={filter === item.id ? "page" : undefined}
              className={cn("inline-flex min-h-11 items-center rounded-pill border border-primary-100 px-3 text-sm font-medium text-secondary-700 hover:bg-primary-50", filter === item.id && "border-primary-700 bg-primary-50 text-primary-900")}
              href={`/admin/fraud?state=${item.id}`}
              key={item.id}
            >
              {item.label} ({count})
            </Link>
          );
        })}
      </div>

      <div className="overflow-x-auto rounded-card border border-primary-100 bg-white">
        <Table className="min-w-[640px]">
          <caption className="sr-only">Daftar kasus fraud</caption>
          <TableHeader>
            <TableRow>
              <TableHead>Tingkat</TableHead>
              <TableHead>Sinyal</TableHead>
              <TableHead>Status</TableHead>
              <TableHead>Terjadi</TableHead>
              <TableHead className="text-right">Kali</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {cases.length === 0 ? (
              <TableRow className="hover:bg-transparent">
                <TableCell className="py-10 text-center text-sm text-secondary-600" colSpan={5}>
                  Tidak ada kasus di daftar ini.
                </TableCell>
              </TableRow>
            ) : cases.map((item) => (
              <TableRow key={item.id}>
                <TableCell><SeverityBadge severity={item.severity} /></TableCell>
                <TableCell className="max-w-[18rem] truncate" title={isFraudSignal(item.signal) ? FRAUD_SIGNALS[item.signal].label : item.signal}>
                  <Link className="font-medium text-primary-800 underline-offset-4 hover:underline" href={`/admin/fraud/${item.id}`}>
                    {isFraudSignal(item.signal) ? FRAUD_SIGNALS[item.signal].label : item.signal}
                  </Link>
                </TableCell>
                <TableCell><StateBadge state={item.state} /></TableCell>
                <TableCell className="whitespace-nowrap tabular-nums">{formatDateTime(item.openedAt)}</TableCell>
                <TableCell className="text-right tabular-nums">{item.hitCount}</TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
    </FraudPage>
  );
}
