"use client";

import Link from "next/link";
import { ChevronRight, LockOpen, Upload } from "@/lib/icons";
import { useRouter } from "next/navigation";
import { useState } from "react";

import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardAction,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyTitle,
} from "@/components/ui/empty";
import { Field, FieldInput, FieldLabel } from "@/components/ui/field";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import type { TryoutOperationsView } from "@/lib/tryout/operations-view";
import { StatusBadge } from "@/modules/mentor/KaptenTryoutOperationsModule";
import {
  policyLabels,
  rankingLabels,
  type Policy,
} from "@/modules/mentor/KaptenTryoutOperationsData";
import {
  AssessmentReleaseNotice,
  OperationalPageHeader,
  OperationNotice,
} from "@/modules/mentor/KaptenTryoutOperationalShared";
import {
  openTryoutDeliverySessionAction,
  releaseTryoutSessionResultsAction,
} from "@/modules/mentor/tryout-actions";

type Confirmation = "open" | "release" | null;

const sessionDateTimeFormatter = new Intl.DateTimeFormat("id-ID", {
  dateStyle: "medium",
  timeZone: "Asia/Jakarta",
  timeStyle: "short",
});

function KaptenTryoutSessionDetailPageModule({
  initial,
  sessionId,
}: {
  initial: TryoutOperationsView;
  sessionId: string;
}) {
  const router = useRouter();
  const delivery = initial.sessions.find((session) => session.id === sessionId)!;
  const [auditReason, setAuditReason] = useState("");
  const [confirmation, setConfirmation] = useState<Confirmation>(null);
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const effectivePolicy = (delivery.releasePolicy === "inherit"
    ? initial.defaultReleasePolicy
    : delivery.releasePolicy) as Policy;

  const handleConfirm = async () => {
    if (!confirmation || !auditReason.trim()) return;
    setBusy(true);
    try {
      const result =
        confirmation === "open"
          ? await openTryoutDeliverySessionAction(delivery.id, auditReason)
          : await releaseTryoutSessionResultsAction(delivery.id, auditReason);
      setConfirmation(null);
      if (!result.ok) {
        setNotice(result.message ?? "Tindakan tidak dapat diproses.");
        return;
      }
      setAuditReason("");
      setNotice(
        confirmation === "open"
          ? "Sesi berhasil dibuka."
          : "Hasil sesi berhasil dirilis.",
      );
      router.refresh();
    } catch (actionError) {
      setNotice(actionError instanceof Error ? actionError.message : "Tindakan tidak dapat diproses.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <main className="w-full px-4 py-5 sm:px-6 lg:px-8">
      <OperationalPageHeader
        backHref={`/mentor/tryout/${initial.id}?workspace=sessions`}
        description={initial.title}
        divider={false}
        title={delivery.name}
        trailing={<StatusBadge status={delivery.status} />}
      />
      <OperationNotice message={notice} />
      <AssessmentReleaseNotice
        label="Konten sesi"
        release={delivery.assessmentRelease}
      />

      <Tabs className="mt-5" defaultValue="attempts">
        <TabsList aria-label="Informasi sesi">
          <TabsTrigger value="attempts">Attempt peserta</TabsTrigger>
          <TabsTrigger value="details">Detail &amp; tindakan</TabsTrigger>
        </TabsList>

        <TabsContent className="mt-5" value="attempts">
          <section aria-labelledby="session-attempts-title">
            <div className="flex items-center justify-between gap-3">
              <h2 id="session-attempts-title" className="text-xl font-semibold">
                Attempt peserta
              </h2>
              <span className="text-sm text-secondary-600">
                {delivery.attempts.length} attempt
              </span>
            </div>
            {delivery.attempts.length ? (
              <div className="mt-3 grid gap-3">
                {delivery.attempts.map((attempt) => (
                  <Link
                    className="group focus-visible:outline-none"
                    href={`/mentor/tryout/${initial.id}/operations/attempts/${attempt.id}`}
                    key={attempt.id}
                  >
                    <Card className="shadow-none ring-primary-100 transition-colors group-hover:bg-secondary-50 group-focus-visible:ring-2 group-focus-visible:ring-primary-700/40" size="sm">
                      <CardHeader>
                        <CardTitle className="font-semibold">{attempt.student}</CardTitle>
                        <CardDescription>
                          {attempt.runs.filter((run) => run.status === "sealed").length}/7 Test selesai
                        </CardDescription>
                        <CardAction className="flex items-center gap-2">
                          <span className="text-sm font-medium text-secondary-700">
                            {attempt.score !== null ? `Indeks ${Number(attempt.score).toFixed(2)}` : "Belum dihitung"}
                          </span>
                          <ChevronRight aria-hidden="true" className="text-secondary-400" />
                        </CardAction>
                      </CardHeader>
                    </Card>
                  </Link>
                ))}
              </div>
            ) : (
              <Empty className="mt-3 border border-dashed border-primary-100 bg-white">
                <EmptyHeader>
                  <EmptyTitle>Belum ada attempt</EmptyTitle>
                  <EmptyDescription>
                    Attempt muncul setelah peserta memulai sesi ini.
                  </EmptyDescription>
                </EmptyHeader>
              </Empty>
            )}
          </section>
        </TabsContent>

        <TabsContent className="mt-5" value="details">
          <div className="grid gap-5 xl:grid-cols-[minmax(0,1.55fr)_minmax(18rem,0.75fr)]">
            <Card className="shadow-none ring-primary-100">
              <CardHeader>
                <CardTitle className="text-lg font-semibold">Detail sesi</CardTitle>
              </CardHeader>
              <CardContent className="grid gap-3 text-sm">
                <div>
                  <p className="text-secondary-500">Jadwal</p>
                  <p className="mt-1 font-medium text-secondary-900">
                    {sessionDateTimeFormatter.format(new Date(delivery.availableFrom))} — {sessionDateTimeFormatter.format(new Date(delivery.availableUntil))}
                  </p>
                </div>
                <div>
                  <p className="text-secondary-500">Rilis hasil</p>
                  <p className="mt-1 font-medium text-secondary-900">{policyLabels[effectivePolicy]}</p>
                  {effectivePolicy === "scheduled" && delivery.scheduledReleaseAt ? <p className="mt-1 text-secondary-600">{sessionDateTimeFormatter.format(new Date(delivery.scheduledReleaseAt))}</p> : null}
                </div>
                <div>
                  <p className="text-secondary-500">Peringkat</p>
                  <p className="mt-1 font-medium text-secondary-900">
                    {rankingLabels[delivery.rankingRule as keyof typeof rankingLabels] ?? "Peringkat belum diatur"}
                  </p>
                </div>
              </CardContent>
            </Card>

            <Card className="shadow-none ring-primary-100">
              <CardHeader>
                <CardTitle className="text-lg font-semibold">Tindakan sesi</CardTitle>
              </CardHeader>
              <CardContent className="grid gap-4">
                <Field>
                  <FieldLabel htmlFor="session-action-reason">Alasan perubahan</FieldLabel>
                  <FieldInput
                    id="session-action-reason"
                    onChange={(event) => setAuditReason(event.target.value)}
                    placeholder="Jelaskan alasan tindakan"
                    value={auditReason}
                  />
                </Field>
                <div className="grid gap-2">
                  {delivery.status === "draft" ? (
                    <Button
                      disabled={!auditReason.trim() || !delivery.assessmentRelease}
                      onClick={() => setConfirmation("open")}
                      variant="brand"
                    >
                      <LockOpen data-icon="inline-start" />
                      Buka sesi
                    </Button>
                  ) : null}
                  {effectivePolicy === "manual" && !delivery.releasedAt ? (
                    <Button
                      disabled={!auditReason.trim() || !delivery.assessmentRelease}
                      onClick={() => setConfirmation("release")}
                      variant="brandOutline"
                    >
                      <Upload data-icon="inline-start" />
                      Rilis hasil
                    </Button>
                  ) : null}
                  {delivery.status !== "draft" &&
                  (effectivePolicy !== "manual" || delivery.releasedAt) ? (
                    <p className="text-sm text-secondary-600">
                      Tidak ada tindakan sesi yang tersedia saat ini.
                    </p>
                  ) : null}
                </div>
              </CardContent>
            </Card>
          </div>
        </TabsContent>
      </Tabs>

      <AlertDialog
        onOpenChange={(open) => {
          if (!open && !busy) setConfirmation(null);
        }}
        open={Boolean(confirmation)}
      >
        <AlertDialogContent variant="info">
          <AlertDialogHeader>
            <AlertDialogTitle>
              {confirmation === "open" ? "Buka sesi?" : "Rilis hasil?"}
            </AlertDialogTitle>
            <AlertDialogDescription>
              {confirmation === "open"
                ? "Peserta yang ditugaskan dapat mengakses sesi sesuai jadwal."
                : "Paket hasil lengkap akan tersedia bagi peserta sesi ini."}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={busy}>Batal</AlertDialogCancel>
            <AlertDialogAction
              disabled={busy}
              onClick={(event) => {
                event.preventDefault();
                void handleConfirm();
              }}
              variant="brand"
            >
              {busy ? "Memproses…" : "Konfirmasi"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </main>
  );
}

export { KaptenTryoutSessionDetailPageModule };
