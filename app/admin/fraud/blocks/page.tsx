import type { Metadata } from "next";
import Link from "next/link";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { fieldControlClassName, fieldLabelClassName } from "@/components/ui/field-constants";
import { Input } from "@/components/ui/input";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { requireAdminSession } from "@/lib/auth/access";
import { describeAuthority } from "@/lib/fraud/authority";
import { BLOCK_REASONS, BLOCK_TYPE_LABELS, BLOCK_TYPES, MAX_BLOCK_DAYS } from "@/lib/fraud/constants";
import { listBlocks } from "@/lib/fraud/queries";
import { createBlockAction } from "@/modules/admin/fraud-actions";
import { firstParam, formatDate, formatDateTime, FraudPage, ownerNote, Panel } from "@/modules/admin/fraud/shared";
import { Textarea } from "@/components/ui/textarea";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Blokir fraud | Admin PTN Pro" };

export default async function AdminFraudBlocksPage({ searchParams }: { searchParams: Promise<{ [key: string]: string | string[] | undefined }> }) {
  const session = await requireAdminSession();
  const params = await searchParams;
  const scope = firstParam(params.scope) === "all" ? "all" : "in_force";
  const blocks = await listBlocks(scope);
  const authority = describeAuthority(session);

  return (
    <FraudPage active="blocks" done={firstParam(params.done)} error={firstParam(params.error)} session={session} title="Blokir">
      <Panel title="Buat blokir">
        <form action={createBlockAction} className="min-w-0">
          <input name="returnTo" type="hidden" value="/admin/fraud/blocks" />
          <fieldset className="grid min-w-0 grid-cols-1 gap-3 sm:grid-cols-2" disabled={!authority.isOwner}>
            <legend className="sr-only">Formulir blokir baru</legend>
            <div>
              <label className={fieldLabelClassName} htmlFor="block-type">Jenis</label>
              <select className={fieldControlClassName} id="block-type" name="type" required>
                {BLOCK_TYPES.map((type) => <option key={type} value={type}>{BLOCK_TYPE_LABELS[type]}</option>)}
              </select>
            </div>
            <div>
              <label className={fieldLabelClassName} htmlFor="block-value">Nilai (id akun, email, nomor, IP, atau kode perangkat)</label>
              <Input autoComplete="off" id="block-value" name="value" required spellCheck={false} />
            </div>
            <div>
              <label className={fieldLabelClassName} htmlFor="block-code">Kode alasan</label>
              <select className={fieldControlClassName} id="block-code" name="reasonCode" required>
                {Object.entries(BLOCK_REASONS).map(([value, text]) => <option key={value} value={value}>{text}</option>)}
              </select>
            </div>
            <div>
              <label className={fieldLabelClassName} htmlFor="block-days">Lama (hari, hanya IP dan perangkat)</label>
              <Input id="block-days" inputMode="numeric" max={30} min={1} name="days" placeholder={`IP maks ${MAX_BLOCK_DAYS.ip}, perangkat maks ${MAX_BLOCK_DAYS.device}`} type="number" />
            </div>
            <div>
              <label className={fieldLabelClassName} htmlFor="block-case">Nomor kasus (opsional)</label>
              <Input autoComplete="off" id="block-case" name="caseId" spellCheck={false} />
            </div>
            <div className="sm:col-span-2">
              <label className={fieldLabelClassName} htmlFor="block-reason">Alasan tertulis</label>
              <Textarea className={fieldControlClassName} id="block-reason" maxLength={500} minLength={10} name="reason" required />
            </div>
            <div className="sm:col-span-2">
              <Button type="submit">Buat blokir</Button>
            </div>
          </fieldset>
          {!authority.isOwner ? <p className="mt-2 text-xs leading-5 text-secondary-600">{ownerNote(authority)}</p> : null}
        </form>
      </Panel>

      <div className="mb-3 flex flex-wrap gap-2" role="group" aria-label="Saring blokir">
        <Link aria-current={scope === "in_force" ? "page" : undefined} className="inline-flex min-h-11 items-center rounded-pill border border-primary-100 px-3 text-sm font-medium text-secondary-700 hover:bg-primary-50" href="/admin/fraud/blocks">Sedang berlaku</Link>
        <Link aria-current={scope === "all" ? "page" : undefined} className="inline-flex min-h-11 items-center rounded-pill border border-primary-100 px-3 text-sm font-medium text-secondary-700 hover:bg-primary-50" href="/admin/fraud/blocks?scope=all">Semua riwayat</Link>
      </div>
      <div className="overflow-x-auto rounded-card border border-primary-100 bg-white">
        <Table className="min-w-[680px]">
          <caption className="sr-only">Daftar blokir</caption>
          <TableHeader>
            <TableRow>
              <TableHead>Jenis</TableHead>
              <TableHead>Pengenal</TableHead>
              <TableHead>Sumber</TableHead>
              <TableHead>Status</TableHead>
              <TableHead>Berakhir / ditinjau</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {blocks.length === 0 ? (
              <TableRow className="hover:bg-transparent">
                <TableCell className="py-10 text-center text-sm text-secondary-600" colSpan={5}>Belum ada blokir di daftar ini.</TableCell>
              </TableRow>
            ) : blocks.map((block) => (
              <TableRow key={block.id}>
                <TableCell>{BLOCK_TYPE_LABELS[block.blockType]}</TableCell>
                <TableCell className="max-w-[14rem] truncate font-mono text-xs" title={block.hint}>
                  <Link className="font-medium text-primary-800 underline-offset-4 hover:underline" href={`/admin/fraud/blocks/${block.id}`}>{block.hint}</Link>
                </TableCell>
                <TableCell>{block.source === "automatic" ? "Otomatis" : "Manual"}</TableCell>
                <TableCell>
                  <Badge size="xs" tone={block.inForce ? "danger" : "neutral"}>
                    {block.inForce ? "Berlaku" : block.status === "lifted" ? "Dicabut" : "Berakhir"}
                  </Badge>
                </TableCell>
                <TableCell className="whitespace-nowrap tabular-nums" title={formatDateTime(block.expiresAt ?? block.reviewDueAt)}>
                  {block.expiresAt ? formatDate(block.expiresAt) : block.reviewDueAt ? `tinjau ${formatDate(block.reviewDueAt)}` : "—"}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
    </FraudPage>
  );
}
