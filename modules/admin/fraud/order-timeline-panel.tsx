import Link from "next/link";

import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import type { TimelineEntry, TimelineTone } from "@/lib/admin/order-timeline";
import { Panel } from "@/modules/admin/fraud/panel";

const dateTimeFormat = new Intl.DateTimeFormat("id-ID", { dateStyle: "medium", timeStyle: "medium", timeZone: "Asia/Jakarta" });

const TONE_BADGES: Record<TimelineTone, { label: string; tone: "attention" | "danger" | "neutral" | "success" }> = {
  attention: { label: "Ditinjau", tone: "attention" },
  danger: { label: "Perlu perhatian", tone: "danger" },
  neutral: { label: "Catatan", tone: "neutral" },
  success: { label: "Berhasil", tone: "success" },
};

/**
 * One order's history as a simple event table: time, what happened, who did it
 * and the one line of detail. Every cell stays on one line (the full text is in
 * the cell's title), as the operations guideline asks of audit trails.
 */
function OrderTimelinePanel({ entries }: { entries: TimelineEntry[] }) {
  return (
    <Panel title="Riwayat transaksi">
      <p className="mb-3 text-sm leading-6 text-secondary-700">
        Semua kejadian pada pesanan ini, urut dari yang paling awal. Waktu mengikuti jam server basis data (WIB). Halaman ini hanya untuk dibaca.
      </p>
      <div className="overflow-x-auto rounded-card border border-primary-100 bg-white">
        <Table className="min-w-[720px]">
          <caption className="sr-only">Riwayat transaksi pesanan ini</caption>
          <TableHeader>
            <TableRow>
              <TableHead>Waktu</TableHead>
              <TableHead>Kejadian</TableHead>
              <TableHead>Oleh</TableHead>
              <TableHead>Rincian</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {entries.length === 0 ? (
              <TableRow className="hover:bg-transparent">
                <TableCell className="py-10 text-center text-sm text-secondary-600" colSpan={4}>Belum ada kejadian tercatat untuk pesanan ini.</TableCell>
              </TableRow>
            ) : entries.map((entry) => {
              const badge = TONE_BADGES[entry.tone];
              return (
                <TableRow data-timeline-entry={entry.key} key={entry.key}>
                  <TableCell className="whitespace-nowrap tabular-nums">
                    <time dateTime={entry.at}>{dateTimeFormat.format(new Date(entry.at))}</time>
                  </TableCell>
                  <TableCell className="max-w-[22rem]">
                    <span className="flex min-w-0 items-center gap-2">
                      <Badge size="xs" tone={badge.tone}>{badge.label}</Badge>
                      {entry.href ? (
                        <Link className="min-w-0 truncate font-medium text-primary-800 underline-offset-4 hover:underline" href={entry.href} prefetch={false} title={entry.hrefLabel ? `${entry.title} (${entry.hrefLabel})` : entry.title}>{entry.title}</Link>
                      ) : (
                        <span className="min-w-0 truncate font-medium text-secondary-900" title={entry.title}>{entry.title}</span>
                      )}
                    </span>
                  </TableCell>
                  <TableCell className="max-w-[12rem] truncate" title={entry.actor}>{entry.actor}</TableCell>
                  <TableCell className="max-w-[20rem] truncate text-secondary-700" title={entry.detail ?? undefined}>{entry.detail ?? "—"}</TableCell>
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
      </div>
    </Panel>
  );
}

/** An order removed under the retention policy keeps no records to build a history from. */
function PurgedTimelinePanel() {
  return (
    <Panel title="Riwayat transaksi">
      <p className="text-sm leading-6 text-secondary-800">Riwayat transaksi tidak tersedia karena catatan pesanan ini sudah dihapus sesuai kebijakan retensi.</p>
    </Panel>
  );
}

export { OrderTimelinePanel, PurgedTimelinePanel };
