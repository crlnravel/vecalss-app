import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCaption, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import type { AdminStudentUsage, AdminUsageTotals } from "@/lib/admin/ai-usage/summary";
import { VERA_IDR_PER_USD, VERA_TIME_ZONE } from "@/lib/vera/config";
import { formatCredits } from "@/lib/vera/credits-shared";

const USD = new Intl.NumberFormat("id-ID", { style: "currency", currency: "USD", minimumFractionDigits: 2, maximumFractionDigits: 4 });
const IDR = new Intl.NumberFormat("id-ID", { style: "currency", currency: "IDR", maximumFractionDigits: 0 });
const DATE_TIME = new Intl.DateTimeFormat("id-ID", { dateStyle: "medium", timeStyle: "short", timeZone: VERA_TIME_ZONE });

/** A window at this share of its limit is marked near, and at the limit it is marked reached. */
const NEAR_LIMIT_SHARE = 0.8;

const HEAD_CELL = "h-11 px-4 py-2.5 text-xs font-semibold tracking-[0.02em] text-secondary-700 sm:px-5";
const CELL = "px-4 py-3 align-top sm:px-5";

export function VeraUsageTotalCards({ label, totals }: { label: string; totals: AdminUsageTotals }) {
  return (
    <section aria-label={label} className="flex flex-col gap-2">
      <h2 className="text-sm font-semibold text-secondary-950">{label}</h2>
      <dl className="grid gap-3 sm:grid-cols-3">
        <Stat label="Permintaan" value={totals.requests.toLocaleString("id-ID")} />
        <Stat label="Kredit" value={formatCredits(totals.credits)} />
        <Stat label="Biaya" value={USD.format(totals.usd)} detail={IDR.format(totals.idr)} />
      </dl>
    </section>
  );
}

function Stat({ label, value, detail }: { label: string; value: string; detail?: string }) {
  return (
    <div className="rounded-2xl border border-border bg-card p-4">
      <dt className="text-xs text-muted-foreground">{label}</dt>
      <dd className="mt-1 text-xl font-semibold text-secondary-950 tabular-nums">{value}</dd>
      {detail ? <dd className="text-xs text-muted-foreground tabular-nums">{detail}</dd> : null}
    </div>
  );
}

export function VeraUsageStudentTable({ caption, students }: { caption: string; students: AdminStudentUsage[] }) {
  if (students.length === 0) {
    return <p className="text-sm text-muted-foreground">Belum ada pemakaian Vera bulan ini.</p>;
  }
  return (
    <div className="overflow-x-auto rounded-2xl border border-border bg-card">
      <Table className="min-w-[860px] text-left text-sm">
        <TableCaption className="sr-only">{caption}</TableCaption>
        <TableHeader>
          <TableRow className="border-0 bg-secondary-50/80 hover:bg-secondary-50/80">
            <TableHead className={HEAD_CELL}>Mahasiswa</TableHead>
            <TableHead className={HEAD_CELL}>Hari ini</TableHead>
            <TableHead className={HEAD_CELL}>Minggu ini</TableHead>
            <TableHead className={HEAD_CELL}>Bulan ini</TableHead>
            <TableHead className={HEAD_CELL}>Biaya bulan ini</TableHead>
            <TableHead className={HEAD_CELL}>Permintaan terakhir</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {students.map((student) => (
            <TableRow key={student.studentId}>
              <TableCell className={CELL}>
                <span className="block font-medium text-secondary-950">{student.name}</span>
                <span className="block text-xs text-muted-foreground">{student.email}</span>
              </TableCell>
              <TableCell className={CELL}>
                <LimitUse usage={student.day} />
              </TableCell>
              <TableCell className={CELL}>
                <LimitUse usage={student.week} />
              </TableCell>
              <TableCell className={CELL}>
                <LimitUse usage={student.month} />
              </TableCell>
              <TableCell className={CELL}>
                <span className="block tabular-nums">{USD.format(student.monthUsd)}</span>
                <span className="block text-xs text-muted-foreground tabular-nums">{IDR.format(student.monthUsd * VERA_IDR_PER_USD)}</span>
              </TableCell>
              <TableCell className={CELL}>
                {student.lastRequestAt ? DATE_TIME.format(new Date(student.lastRequestAt)) : "Belum ada"}
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  );
}

function LimitUse({ usage }: { usage: { credits: number; limit: number } }) {
  const share = usage.credits / usage.limit;
  return (
    <span className="flex flex-wrap items-center gap-2 tabular-nums">
      {formatCredits(usage.credits)} dari {usage.limit}
      {share >= 1 ? (
        <Badge size="xs" tone="danger">
          Batas tercapai
        </Badge>
      ) : share >= NEAR_LIMIT_SHARE ? (
        <Badge size="xs" tone="attention">
          Dekat batas
        </Badge>
      ) : null}
    </span>
  );
}

export function VeraUsageNote({ generatedAt }: { generatedAt: string }) {
  return (
    <p className="text-xs text-muted-foreground">
      Dihitung pada {DATE_TIME.format(new Date(generatedAt))}. Isi percakapan dan dokumen Vera tidak ditampilkan di halaman ini.
    </p>
  );
}
