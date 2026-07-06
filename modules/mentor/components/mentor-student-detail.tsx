import {
  ArrowDownRight,
  ArrowUpRight,
  Clock3,
  UserRound,
  Target,
} from "lucide-react";

import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { cn } from "@/lib/utils";
import { MentorGapCard } from "@/modules/mentor/components/mentor-gap-card";
import type { MentorRosterStudent } from "@/modules/mentor/mock-data";

const trendToneClasses = {
  down: "border-[#f4d7d1] bg-[#fff7f5] text-[#9c2f22]",
  flat: "border-primary-100 bg-white text-secondary-700",
  up: "border-primary-100 bg-primary-50 text-primary-800",
} as const;

const riskToneClasses = {
  high: "border-[#f4d7d1] bg-[#fff7f5] text-[#9c2f22]",
  low: "border-primary-100 bg-primary-50 text-primary-800",
  medium: "border-[#f4e9bf] bg-[#fffdf0] text-[#856300]",
} as const;

function MentorStudentDetail({
  student,
  analyticsUnavailable = false,
  emptyStateDescription = "Pilih satu siswa di roster untuk membuka gap belajar, aktivitas terbaru, dan riwayat intervensi.",
  emptyStateTitle = "Belum ada siswa dipilih",
  fallbackLabel = "Snapshot aktif",
  fallbackMessage,
}: {
  analyticsUnavailable?: boolean;
  emptyStateDescription?: string;
  emptyStateTitle?: string;
  fallbackLabel?: string;
  fallbackMessage?: string;
  student: MentorRosterStudent | null;
}) {
  if (!student) {
    return (
      <Card className="border border-primary-100 bg-white shadow-sm">
        <CardHeader className="gap-3 pb-0">
          <div className="space-y-1">
            <CardTitle className="text-xl text-secondary-900">
              Detail siswa aktif
            </CardTitle>
            <CardDescription className="max-w-2xl text-sm leading-6">
              Scan cepat, lalu buka satu siswa untuk melihat gap belajar yang
              paling penting.
            </CardDescription>
          </div>
        </CardHeader>

        <CardContent className="pt-6">
          <div className="rounded-3xl border border-dashed border-primary-100 bg-[#fcfdfc] px-4 py-5 text-sm leading-6 text-secondary-500">
            <p className="text-base font-semibold text-secondary-900">
              {emptyStateTitle}
            </p>
            <p className="mt-2">{emptyStateDescription}</p>
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className="border border-primary-100 bg-white shadow-sm">
      <CardHeader className="gap-3 pb-0">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="space-y-1">
            <CardTitle className="text-xl text-secondary-900">
              Detail siswa aktif
            </CardTitle>
            <CardDescription className="max-w-2xl text-sm leading-6">
              Scan cepat, lalu buka satu siswa untuk melihat gap belajar yang
              paling penting.
            </CardDescription>
          </div>

          <span className="inline-flex h-9 items-center rounded-full border border-primary-100 bg-primary-50 px-3 text-sm font-medium text-primary-800">
            {analyticsUnavailable ? fallbackLabel : student.className}
          </span>
        </div>
      </CardHeader>

      <CardContent className="space-y-6 pt-6">
        {analyticsUnavailable ? (
          <div className="rounded-3xl border border-[#ead9a5] bg-[#fffdf1] px-4 py-3 text-sm leading-6 text-[#856300]">
            {fallbackMessage ??
              "Analitik sedang tidak tersedia, jadi panel ini menampilkan snapshot cached terbaru."}
          </div>
        ) : null}

        <section className="rounded-3xl border border-primary-100 bg-[#fcfdfc] p-4">
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div className="flex min-w-0 items-start gap-3">
              <div className="flex size-12 shrink-0 items-center justify-center rounded-2xl border border-primary-100 bg-primary-700 text-sm font-semibold text-white">
                {student.initials}
              </div>
              <div className="min-w-0">
                <p className="text-base font-semibold text-secondary-900">
                  {student.name}
                </p>
                <p className="mt-1 text-sm text-secondary-600">
                  {student.className} · {student.subtest}
                </p>
                <p className="mt-2 text-sm leading-6 text-secondary-500">
                  {student.detail.focusSummary}
                </p>
              </div>
            </div>

            <div className="flex flex-wrap items-center gap-2">
              <span
                className={cn(
                  "inline-flex h-7 items-center rounded-full border px-2 text-xs font-medium",
                  riskToneClasses[student.riskTone],
                )}
              >
                {student.riskLabel}
              </span>
              <span className="inline-flex h-7 items-center rounded-full border border-primary-100 bg-white px-2 text-xs font-medium text-secondary-600">
                Rank #{student.rank}
              </span>
            </div>
          </div>

          <div className="mt-4 grid gap-3 sm:grid-cols-3">
            <div className="rounded-2xl bg-white px-3 py-3 shadow-sm">
              <p className="text-xs text-secondary-500">Skor terakhir</p>
              <p className="mt-1 text-lg font-semibold text-secondary-900">
                {student.latestScore}
              </p>
            </div>
            <div
              className={cn(
                "rounded-2xl border px-3 py-3 shadow-sm",
                trendToneClasses[student.scoreTrendTone],
              )}
            >
              <p className="text-xs opacity-80">Trend</p>
              <p className="mt-1 flex items-center gap-1 text-lg font-semibold">
                {student.scoreTrendTone === "down" ? (
                  <ArrowDownRight className="size-4" />
                ) : student.scoreTrendTone === "up" ? (
                  <ArrowUpRight className="size-4" />
                ) : (
                  <Target className="size-4" />
                )}
                {student.scoreTrend}
              </p>
            </div>
            <div className="rounded-2xl bg-white px-3 py-3 shadow-sm">
              <p className="text-xs text-secondary-500">Snapshot</p>
              <p className="mt-1 text-sm leading-6 text-secondary-700">
                {student.detail.trendSnapshot}
              </p>
            </div>
          </div>
        </section>

        <section className="space-y-3">
          <div className="flex items-center gap-2">
            <div className="inline-flex h-8 items-center rounded-full border border-primary-100 bg-white px-3 text-xs font-semibold uppercase tracking-[0.18em] text-secondary-500">
              Weak topics
            </div>
            <p className="text-sm text-secondary-500">
              Fokus pada topik paling lemah dulu.
            </p>
          </div>
          <div className="grid gap-3 lg:grid-cols-3">
            {student.detail.learningGaps.map((gap, index) => (
              <MentorGapCard
                key={gap.title}
                gap={gap}
                tone={index === 0 ? "warning" : "neutral"}
              />
            ))}
          </div>
        </section>

        <div className="grid gap-4 lg:grid-cols-[minmax(0,1.1fr)_minmax(0,0.9fr)]">
          <section className="rounded-3xl border border-primary-100 bg-[#fcfdfc] p-4">
            <div className="flex items-center justify-between gap-3">
              <div>
                <p className="text-xs uppercase tracking-[0.2em] text-secondary-500">
                  Recent activity
                </p>
                <p className="mt-1 text-sm font-semibold text-secondary-900">
                  Aktivitas terakhir
                </p>
              </div>
              <Clock3 className="size-4 text-secondary-400" />
            </div>

            <div className="mt-4 space-y-3">
              {student.detail.recentActivity.map((item) => (
                <article
                  key={item.title}
                  className="rounded-2xl border border-primary-100 bg-white px-3 py-3 shadow-sm"
                >
                  <p className="text-sm font-semibold text-secondary-900">
                    {item.title}
                  </p>
                  <p className="mt-1 text-sm leading-6 text-secondary-600">
                    {item.detail}
                  </p>
                  <p className="mt-2 text-xs text-secondary-500">{item.time}</p>
                </article>
              ))}
            </div>
          </section>

          <section className="rounded-3xl border border-primary-100 bg-[#fcfdfc] p-4">
            <div className="flex items-center justify-between gap-3">
              <div>
                <p className="text-xs uppercase tracking-[0.2em] text-secondary-500">
                  Last intervention
                </p>
                <p className="mt-1 text-sm font-semibold text-secondary-900">
                  {student.detail.lastIntervention.title}
                </p>
              </div>
              <UserRound className="size-4 text-secondary-400" />
            </div>

            <div className="mt-4 rounded-2xl border border-primary-100 bg-white px-4 py-4 shadow-sm">
              <p className="text-sm leading-6 text-secondary-600">
                {student.detail.lastIntervention.detail}
              </p>
              <p className="mt-3 text-xs text-secondary-500">
                {student.detail.lastIntervention.time}
              </p>
            </div>

            <div className="mt-4 rounded-2xl border border-dashed border-primary-100 bg-white px-4 py-4 text-sm leading-6 text-secondary-500">
              Detail ini tetap bisa ditindaklanjuti tanpa menunggu panel lain
              terbuka.
            </div>
          </section>
        </div>
      </CardContent>
    </Card>
  );
}

export { MentorStudentDetail };
