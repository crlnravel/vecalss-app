import { Badge } from "@/components/ui/badge";
import { fieldControlClassName, fieldLabelClassName } from "@/components/ui/field-constants";
import type { OrderRetention } from "@/lib/retention/status";
import { placeHoldAction } from "@/modules/admin/retention-actions";
import { Field, formatDate, formatDateTime, ownerNote, Panel, ReasonForm } from "@/modules/admin/fraud/shared";

type PresentRetention = Extract<OrderRetention, { kind: "present" }>;

const SCOPE_LABELS = { buyer: "Semua data pembeli", case: "Satu kasus", order: "Pesanan ini" } as const;

/** Held by a hold the owner placed, as opposed to an open case that holds the evidence by itself. */
const hasOpenHold = (retention: PresentRetention) => retention.holds.some((hold) => !hold.releasedAt);

function ipLine(retention: PresentRetention) {
  const { ip } = retention;
  if (ip.state === "removed") return `Sudah dihapus sesuai kebijakan retensi pada ${formatDate(ip.scrubbedAt)}.`;
  if (ip.state === "none") return "Tidak ada alamat IP atau perangkat yang tercatat.";
  if (hasOpenHold(retention)) return "Disimpan selama penahanan masih aktif.";
  if (retention.held || !ip.endsAt) return "Disimpan selama ada kasus yang belum selesai.";
  return `Disimpan sampai ${formatDate(ip.endsAt)}, lalu dihapus.`;
}

function periodLine(retention: PresentRetention) {
  if (hasOpenHold(retention)) return "Ditunda selama penahanan masih aktif.";
  if (retention.held || !retention.periodEndsAt) return "Menunggu kasus yang masih terbuka selesai.";
  return formatDate(retention.periodEndsAt);
}

/** What the retention rules say about one order: how long it is kept, holds, and what was removed. */
function RetentionPanel({
  authority,
  buyerId,
  buyerIp,
  orderId,
  retention,
}: {
  authority: { isOwner: boolean; ownerConfigured: boolean };
  buyerId: string;
  /** The raw address for the owner, a masked one for other admins, null when none is kept. */
  buyerIp: string | null;
  orderId: string;
  retention: PresentRetention;
}) {
  const openHolds = retention.holds.filter((hold) => !hold.releasedAt);
  const closedHolds = retention.holds.filter((hold) => hold.releasedAt);

  return (
    <Panel title="Retensi bukti">
      <dl className="mb-4 grid grid-cols-1 gap-3 sm:grid-cols-2">
        <Field label="Jenis catatan">{retention.label}</Field>
        <Field label="Masa simpan mulai">{formatDate(retention.startsAt)}</Field>
        <Field label="Masa simpan berakhir">{periodLine(retention)}</Field>
        <Field label="Status penahanan">
          {retention.held ? <Badge size="xs" tone="attention">Ditahan</Badge> : <Badge size="xs" tone="neutral">Tidak ditahan</Badge>}
        </Field>
        <Field label="Alamat IP dan perangkat">{ipLine(retention)}</Field>
        {buyerIp ? <Field label={authority.isOwner ? "Alamat IP pembeli" : "Alamat IP pembeli (disamarkan)"}>{buyerIp}</Field> : null}
      </dl>

      {openHolds.length > 0 ? (
        <ul className="mb-4 space-y-3">
          {openHolds.map((hold) => (
            <li className="rounded-control border border-primary-100 p-3" key={hold.id}>
              <p className="text-sm font-medium text-secondary-900">
                {SCOPE_LABELS[hold.scope]} · dipasang {formatDateTime(hold.placedAt)} oleh {hold.placedByEmail}
              </p>
              <p className="mt-0.5 break-words text-sm text-secondary-700">{hold.reason}</p>
              <p className="mt-2 text-sm leading-5 text-secondary-600">
                Untuk melepas penahanan ini, jalankan di komputer pemilik dengan akses basis data pemilik:
              </p>
              <code className="mt-1 block break-all rounded-control bg-primary-50 px-2 py-1.5 text-xs text-secondary-900">
                {`pnpm retention:release-hold -- --hold ${hold.id} --reason "alasan melepas"`}
              </code>
            </li>
          ))}
        </ul>
      ) : null}

      <ReasonForm
        action={placeHoldAction}
        disabled={!authority.isOwner}
        disabledNote={ownerNote(authority)}
        hidden={{ orderId }}
        label="Tahan data ini"
        submit="Pasang penahanan"
      >
        <label className="sr-only" htmlFor="hold-target">Yang ditahan</label>
        <select className={fieldControlClassName} defaultValue={`order:${orderId}`} id="hold-target" name="target">
          <option value={`order:${orderId}`}>Pesanan ini dan catatan terkaitnya</option>
          <option value={`buyer:${buyerId}`}>Semua pesanan pembeli ini</option>
          {retention.cases.map((item) => (
            <option key={`${item.kind}:${item.id}`} value={`case:${item.kind}:${item.id}`}>{item.label}</option>
          ))}
        </select>
        <p className={`${fieldLabelClassName} font-normal text-secondary-600`}>
          Selama ada penahanan, bukti tidak dihapus dan alamat IP serta perangkat tidak dibersihkan.
        </p>
      </ReasonForm>

      {closedHolds.length > 0 ? (
        <div className="mt-4">
          <h3 className="mb-2 text-sm font-semibold text-secondary-900">Penahanan yang sudah dilepas</h3>
          <ol className="space-y-2">
            {closedHolds.map((hold) => (
              <li className="text-sm leading-5 text-secondary-700" key={hold.id}>
                <span className="font-medium text-secondary-900">{SCOPE_LABELS[hold.scope]}</span>
                {` · dipasang ${formatDateTime(hold.placedAt)}, dilepas ${formatDateTime(hold.releasedAt)}`}
                <p className="break-words text-secondary-600">{hold.releaseReason}</p>
              </li>
            ))}
          </ol>
        </div>
      ) : null}
    </Panel>
  );
}

function PurgedPanel({ purgedAt, reference }: { purgedAt: Date; reference: string | null }) {
  return (
    <Panel title="Retensi bukti">
      <p className="text-sm leading-6 text-secondary-800">
        Catatan pesanan ini sudah dihapus sesuai kebijakan retensi pada {formatDate(purgedAt)}.
        {reference ? ` Nomor pesanan: ${reference}.` : ""} Hanya jejak penghapusan yang tersisa; tidak ada data pembeli, pembayaran, atau alamat IP yang disimpan.
      </p>
    </Panel>
  );
}

export { PurgedPanel, RetentionPanel };
