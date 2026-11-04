import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";

import { fieldControlClassName, fieldLabelClassName } from "@/components/ui/field-constants";
import { requireAdminSession } from "@/lib/auth/access";
import { describeAuthority } from "@/lib/fraud/authority";
import { CLOSURE_REASONS, FRAUD_SIGNALS, isFraudSignal } from "@/lib/fraud/constants";
import { getCaseDetail } from "@/lib/fraud/queries";
import {
  acknowledgeCaseAction,
  closeCaseAction,
  escalateCaseAction,
  reopenCaseAction,
} from "@/modules/admin/fraud-actions";
import { Field, firstParam, formatDateTime, FraudPage, ownerNote, Panel, ReasonForm, SeverityBadge, StateBadge } from "@/modules/admin/fraud/shared";
import { formatRupiah } from "@/lib/pricing/schedule";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Kasus fraud | Admin PTN Pro" };

const EVENT_LABELS: Record<string, string> = {
  acknowledged: "Ditandai sudah dilihat",
  appeal_decided: "Banding diputuskan",
  appeal_filed: "Banding dicatat",
  appeal_reopened: "Banding dibuka kembali",
  block_linked: "Blokir dikaitkan",
  closed: "Ditutup",
  escalated: "Dieskalasi",
  hit: "Sinyal muncul lagi",
  opened: "Kasus dibuka",
  reopened: "Dibuka kembali",
};

export default async function AdminFraudCasePage({
  params,
  searchParams,
}: {
  params: Promise<{ caseId: string }>;
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>;
}) {
  const session = await requireAdminSession();
  const { caseId } = await params;
  const query = await searchParams;
  const found = await getCaseDetail(caseId);
  if (!found) notFound();

  const { blocks, detail, events } = found;
  const authority = describeAuthority(session);
  const ownerOnly = !authority.isOwner;
  const note = ownerNote(authority);
  const label = isFraudSignal(detail.signal) ? FRAUD_SIGNALS[detail.signal].label : detail.signal;
  const hidden = { caseId: detail.id, returnTo: `/admin/fraud/${detail.id}`, version: detail.version };

  return (
    <FraudPage active="cases" done={firstParam(query.done)} error={firstParam(query.error)} session={session} title={label}>
      <p className="mb-4"><Link className="text-sm font-medium text-primary-800 underline-offset-4 hover:underline" href="/admin/fraud">← Kembali ke antrean</Link></p>

      <Panel title="Ringkasan">
        <dl className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <Field label="Tingkat"><SeverityBadge severity={detail.severity} /></Field>
          <Field label="Status"><StateBadge state={detail.state} /></Field>
          <Field label="Pertama terjadi">{formatDateTime(detail.openedAt)}</Field>
          <Field label="Terakhir terjadi">{formatDateTime(detail.lastSeenAt)}</Field>
          <Field label="Jumlah kejadian">{detail.hitCount}</Field>
          <Field label="Pemilik kasus">{detail.ownerName ?? "Belum ditetapkan"}</Field>
          <Field label="Versi aturan">{detail.ruleVersion}</Field>
          <Field label="Versi batas pembelian">{detail.policyVersion ?? "—"}</Field>
          {detail.closureReason ? <Field label="Alasan penutupan">{CLOSURE_REASONS[detail.closureReason as keyof typeof CLOSURE_REASONS] ?? detail.closureReason}</Field> : null}
        </dl>
      </Panel>

      <Panel title="Bukti">
        <dl className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          {detail.userEmail ? <Field label="Akun terkait">{detail.userEmail}</Field> : null}
          {detail.order ? (
            <>
              <Field label="Pesanan">
                {detail.order.packageCode} · {formatRupiah(detail.order.amountRupiah)} · {detail.order.status}{" · "}
                <Link className="text-primary-800 underline-offset-4 hover:underline" href={`/admin/fraud/orders/${detail.order.id}`}>Buka pesanan</Link>
              </Field>
              <Field label="Alamat IP pembeli">{detail.order.buyerIp ?? "Tidak tercatat"}</Field>
            </>
          ) : null}
        </dl>
        <pre className="mt-3 max-h-64 overflow-auto rounded-control bg-secondary-50 p-3 text-xs leading-5 text-secondary-800">{JSON.stringify(detail.evidence, null, 2)}</pre>
      </Panel>

      <Panel title="Blokir terkait">
        {blocks.length === 0 ? <p className="text-sm text-secondary-600">Belum ada blokir yang dikaitkan.</p> : (
          <ul className="space-y-1 text-sm">
            {blocks.map((block) => (
              <li key={block.id}><Link className="font-medium text-primary-800 underline-offset-4 hover:underline" href={`/admin/fraud/blocks/${block.id}`}>{block.hint}</Link> · {block.status}</li>
            ))}
          </ul>
        )}
        <p className="mt-3 text-xs leading-5 text-secondary-600">Untuk memblokir dari kasus ini, buat blokir di tab Blokir dan isi nomor kasus {detail.id}.</p>
      </Panel>

      <Panel title="Tindakan">
        <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
          {detail.state === "open" ? (
            <ReasonForm action={acknowledgeCaseAction} hidden={hidden} label="Tandai sudah dilihat" submit="Tandai sudah dilihat" />
          ) : null}
          {detail.state === "open" || detail.state === "acknowledged" ? (
            <ReasonForm action={escalateCaseAction} disabled={ownerOnly} disabledNote={note} hidden={hidden} label="Eskalasi ke pemilik" submit="Eskalasi" tone="outline" />
          ) : null}
          {detail.state !== "closed" ? (
            <ReasonForm action={closeCaseAction} disabled={ownerOnly} disabledNote={note} hidden={hidden} label="Tutup kasus" submit="Tutup kasus" tone="outline">
              <label className={fieldLabelClassName} htmlFor="closure-reason">Alasan penutupan</label>
              <select className={fieldControlClassName} defaultValue="no_action_needed" id="closure-reason" name="closureReason">
                {Object.entries(CLOSURE_REASONS).map(([value, text]) => <option key={value} value={value}>{text}</option>)}
              </select>
            </ReasonForm>
          ) : (
            <ReasonForm action={reopenCaseAction} disabled={ownerOnly} disabledNote={note} hidden={hidden} label="Buka kembali (ada bukti baru)" submit="Buka kembali" tone="outline" />
          )}
        </div>
      </Panel>

      <Panel title="Riwayat">
        <ol className="space-y-3">
          {events.map((event) => (
            <li className="text-sm leading-5" key={event.id}>
              <span className="font-medium text-secondary-900">{EVENT_LABELS[event.kind] ?? event.kind}</span>
              <span className="text-secondary-600"> · {event.actorName ?? "Sistem"} · {formatDateTime(event.createdAt)}</span>
              {event.note ? <p className="mt-0.5 break-words text-secondary-700">{event.note}</p> : null}
            </li>
          ))}
        </ol>
      </Panel>
    </FraudPage>
  );
}
