import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { fieldControlClassName, fieldLabelClassName } from "@/components/ui/field-constants";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { requireAdminSession } from "@/lib/auth/access";
import { describeAuthority } from "@/lib/fraud/authority";
import { BLOCK_REASONS, BLOCK_TYPE_LABELS, MAX_BLOCK_DAYS } from "@/lib/fraud/constants";
import { getBlockDetail } from "@/lib/fraud/queries";
import {
  decideAppealAction,
  fileAppealAction,
  liftBlockAction,
  reopenAppealAction,
  renewBlockAction,
} from "@/modules/admin/fraud-actions";
import { Field, firstParam, formatDateTime, FraudPage, ownerNote, Panel, ReasonForm } from "@/modules/admin/fraud/shared";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Blokir | Admin PTN Pro" };

const EVENT_LABELS: Record<string, string> = { created: "Dibuat", expired: "Berakhir sendiri", lifted: "Dicabut", renewed: "Diperpanjang" };
const APPEAL_LABELS: Record<string, string> = { denied: "Ditolak", granted: "Dikabulkan", pending: "Menunggu keputusan" };

export default async function AdminFraudBlockPage({
  params,
  searchParams,
}: {
  params: Promise<{ blockId: string }>;
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>;
}) {
  const session = await requireAdminSession();
  const { blockId } = await params;
  const query = await searchParams;
  const block = await getBlockDetail(blockId);
  if (!block) notFound();

  const authority = describeAuthority(session);
  const disabled = !authority.isOwner;
  const note = ownerNote(authority);
  const hidden = { blockId: block.id, returnTo: `/admin/fraud/blocks/${block.id}`, version: block.version };
  const maxDays = MAX_BLOCK_DAYS[block.blockType];

  return (
    <FraudPage active="blocks" done={firstParam(query.done)} error={firstParam(query.error)} session={session} title={`Blokir ${BLOCK_TYPE_LABELS[block.blockType].toLowerCase()}`}>
      <p className="mb-4"><Link className="text-sm font-medium text-primary-800 underline-offset-4 hover:underline" href="/admin/fraud/blocks">← Kembali ke daftar blokir</Link></p>

      <Panel title="Ringkasan">
        <dl className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <Field label="Pengenal (disamarkan)">{block.hint}</Field>
          <Field label="Status"><Badge size="xs" tone={block.inForce ? "danger" : "neutral"}>{block.inForce ? "Berlaku" : block.status === "lifted" ? "Dicabut" : "Berakhir"}</Badge></Field>
          <Field label="Sumber">{block.source === "automatic" ? "Otomatis, menunggu tinjauan" : "Manual"}</Field>
          <Field label="Kode alasan">{BLOCK_REASONS[block.reasonCode as keyof typeof BLOCK_REASONS] ?? block.reasonCode}</Field>
          <Field label="Dibuat">{formatDateTime(block.createdAt)}</Field>
          <Field label="Berakhir">{block.expiresAt ? formatDateTime(block.expiresAt) : "Sampai dicabut"}</Field>
          {block.reviewDueAt ? <Field label="Ditinjau paling lambat">{formatDateTime(block.reviewDueAt)}</Field> : null}
          {block.caseId ? <Field label="Kasus"><Link className="text-primary-800 underline-offset-4 hover:underline" href={`/admin/fraud/${block.caseId}`}>Buka kasus</Link></Field> : null}
        </dl>
        <p className="mt-3 break-words text-sm leading-6 text-secondary-700">{block.reasonNote}</p>
      </Panel>

      {block.inForce ? (
        <Panel title="Tindakan pemilik">
          <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
            <ReasonForm action={liftBlockAction} disabled={disabled} disabledNote={note} hidden={hidden} label="Cabut blokir" submit="Cabut blokir" tone="outline" />
            <ReasonForm action={renewBlockAction} disabled={disabled} disabledNote={note} hidden={hidden} label="Perpanjang dengan alasan baru" submit="Perpanjang" tone="outline">
              {maxDays !== null ? (
                <>
                  <label className={fieldLabelClassName} htmlFor="renew-days">Lama (hari, maks {maxDays})</label>
                  <Input id="renew-days" inputMode="numeric" max={maxDays} min={1} name="days" type="number" />
                </>
              ) : <p className="text-xs leading-5 text-secondary-600">Memulai 30 hari tinjauan berikutnya.</p>}
            </ReasonForm>
          </div>
        </Panel>
      ) : null}

      <Panel title="Banding">
        {block.appeal ? (
          <>
            <dl className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <Field label="Status"><Badge size="xs" tone={block.appeal.state === "pending" ? "attention" : block.appeal.state === "granted" ? "success" : "neutral"}>{APPEAL_LABELS[block.appeal.state]}</Badge></Field>
              <Field label="Diterima">{formatDateTime(block.appeal.receivedAt)} lewat {block.appeal.channel}</Field>
              <Field label="Batas keputusan (3 hari kerja)">{formatDateTime(block.appeal.dueAt)}{block.appeal.overdue ? " — terlambat" : ""}</Field>
              <Field label="Dibuka ulang">{block.appeal.reopenCount} kali</Field>
            </dl>
            <p className="mt-3 break-words text-sm leading-6 text-secondary-700">{block.appeal.summary}</p>
            {block.appeal.decisionReason ? <p className="mt-2 break-words text-sm leading-6 text-secondary-900">Keputusan: {block.appeal.decisionReason}</p> : null}
            <div className="mt-3 grid grid-cols-1 gap-3 md:grid-cols-2">
              {block.appeal.state === "pending" && block.inForce ? (
                <>
                  <ReasonForm action={decideAppealAction} disabled={disabled} disabledNote={note} hidden={{ ...hidden, appealId: block.appeal.id, decision: "granted", version: block.appeal.version }} label="Kabulkan banding (blokir dicabut)" submit="Kabulkan" />
                  <ReasonForm action={decideAppealAction} disabled={disabled} disabledNote={note} hidden={{ ...hidden, appealId: block.appeal.id, decision: "denied", version: block.appeal.version }} label="Tolak banding" submit="Tolak" tone="outline" />
                </>
              ) : null}
              {block.appeal.state === "denied" && block.inForce ? (
                <ReasonForm action={reopenAppealAction} disabled={disabled} disabledNote={note} hidden={{ ...hidden, appealId: block.appeal.id, version: block.appeal.version }} label="Buka ulang (ada bukti baru)" submit="Buka ulang" tone="outline" />
              ) : null}
            </div>
          </>
        ) : block.inForce ? (
          <form action={fileAppealAction} className="min-w-0 space-y-2">
            <input name="blockId" type="hidden" value={block.id} />
            <input name="returnTo" type="hidden" value={`/admin/fraud/blocks/${block.id}`} />
            <input name="version" type="hidden" value={block.version} />
            <fieldset className="min-w-0 space-y-2" disabled={disabled}>
              <legend className={fieldLabelClassName}>Catat banding dari pembeli (satu per blokir)</legend>
              <label className={fieldLabelClassName} htmlFor="appeal-channel">Lewat mana banding diterima</label>
              <Input defaultValue="Instagram" id="appeal-channel" maxLength={30} name="channel" required />
              <label className={fieldLabelClassName} htmlFor="appeal-summary">Isi banding</label>
              <Textarea className={`${fieldControlClassName} min-h-20`} id="appeal-summary" maxLength={500} minLength={10} name="summary" required />
              <Button type="submit" variant="outline">Catat banding</Button>
            </fieldset>
            {disabled ? <p className="text-xs leading-5 text-secondary-600">{note}</p> : null}
          </form>
        ) : <p className="text-sm text-secondary-600">Belum ada banding.</p>}
      </Panel>

      <Panel title="Riwayat">
        <ol className="space-y-3">
          {block.history.map((event) => (
            <li className="text-sm leading-5" key={event.id}>
              <span className="font-medium text-secondary-900">{EVENT_LABELS[event.kind] ?? event.kind}</span>
              <span className="text-secondary-600"> · {event.actorName ?? "Sistem"} · {formatDateTime(event.createdAt)}</span>
              <p className="mt-0.5 break-words text-secondary-700">{event.reason}</p>
            </li>
          ))}
        </ol>
      </Panel>
    </FraudPage>
  );
}
