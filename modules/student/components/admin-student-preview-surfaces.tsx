import Image from "next/image";
import Link from "next/link";

import {
  BookOpen,
  CheckCircle2,
  ChevronRight,
  Clock3,
  FileText,
  ListChecks,
  ShieldCheck,
  Timer,
} from "@/lib/icons";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { StudentCatalogueCard } from "@/components/ui/student-catalogue-card";
import { StudentBadge } from "@/components/ui/student-badge";
import {
  isStudentBannerDraftUnavailable,
  type AdminStudentBannerRead,
} from "@/lib/student/banner-presentation";
import type { StudentBannerVariables } from "@/lib/student/banner-content";
import {
  buildAdminStudentPreviewMateriDocumentRoute,
  buildAdminStudentPreviewMateriRoute,
  buildAdminStudentPreviewRoute,
  buildAdminStudentPreviewTryoutRoute,
} from "@/lib/student/preview-routes";
import type {
  AdminPreviewBerandaRead,
  AdminPreviewContentBlock,
  AdminPreviewMateriCourse,
  AdminPreviewMateriLesson,
} from "@/lib/admin/student-preview-reads";
import type {
  AdminPreviewTryout,
  AdminPreviewTryoutRead,
  AdminPreviewTryoutSchedule,
} from "@/lib/admin/student-preview-tryout-reads";
import { MateriLessonPresentation } from "@/modules/courses/MateriLessonPresentation";
import { AdminStudentPreviewTryoutRestart } from "@/modules/student/components/admin-student-preview-tryout-restart";
import { AdminStudentPreviewBannerHeader } from "@/modules/student/components/admin-student-preview-banner-header";
import { StudentBannerArtwork } from "@/modules/student/components/student-banner-artwork";

function PreviewSurfaceHeader({
  banner,
  description,
  title,
  variables,
}: {
  banner?: AdminStudentBannerRead;
  description?: string;
  title?: string;
  variables?: StudentBannerVariables;
}) {
  return (
    <AdminStudentPreviewBannerHeader
      banner={banner}
      description={description}
      fallbackTitle="Student preview"
      title={title}
      variables={variables}
    />
  );
}

function PreviewNavigation({ activeLabel = "Beranda" }: { activeLabel?: "Beranda" | "Kuis" | "Materi" | "Tryout" } = {}) {
  return (
    <nav aria-label="Navigasi preview siswa" className="flex flex-wrap gap-2">
      {[
        ["Beranda", buildAdminStudentPreviewRoute("/")],
        ["Materi", buildAdminStudentPreviewRoute("/courses")],
        ["Kuis", buildAdminStudentPreviewRoute("/quiz")],
        ["Tryout", buildAdminStudentPreviewRoute("/tryout")],
      ].map(([label, href]) => (
        <Button
          aria-current={label === activeLabel ? "page" : undefined}
          key={href}
          nativeButton={false}
          render={<Link href={href} />}
          variant={label === activeLabel ? "brand" : "brandOutline"}
        >
          {label}
        </Button>
      ))}
    </nav>
  );
}

function AdminStudentPreviewBerandaSurface({ data }: { data: AdminPreviewBerandaRead }) {
  const daysLeft = data.profile.examDaysLeft;

  if (isStudentBannerDraftUnavailable(data.banner)) {
    return (
      <section className="grid gap-7">
        <PreviewSurfaceHeader banner={data.banner} />
        <PreviewNavigation activeLabel="Beranda" />
      </section>
    );
  }

  const banner = data.banner;
  const bannerVariables = data.bannerVariables;

  return (
    <section className="grid gap-7">
      <Card className="relative min-h-[290px] overflow-hidden rounded-[2rem] border border-primary-200 bg-[linear-gradient(125deg,var(--voyage-surface)_0%,#eef9f2_48%,#bfe6ce_100%)] shadow-[0_28px_90px_-58px_color-mix(in_oklab,var(--voyage-deep)_42%,transparent)]">
        {banner.design ? (
          <>
            <StudentBannerArtwork banner={banner} className="absolute inset-0 size-full rounded-none" variables={bannerVariables} />
            <div className="sr-only">
              <h1>{getStudentBannerHeading(banner, bannerVariables)}</h1>
              <p>{getStudentBannerDescription(banner, bannerVariables)}</p>
            </div>
          </>
        ) : (
          <div aria-hidden="true" className="pointer-events-none absolute inset-y-0 right-0 hidden w-[38%] min-w-[20rem] lg:block">
            <div className="absolute inset-x-6 bottom-5 h-12 rounded-full bg-primary-900/12 blur-2xl" />
            <Image
              alt=""
              className="absolute right-[-2.5rem] bottom-[-2.5rem] h-auto w-[22rem] max-w-none object-contain drop-shadow-[0_26px_42px_color-mix(in_oklab,var(--voyage-deep)_18%,transparent)] xl:w-[26rem]"
              height={416}
              sizes="(min-width: 1280px) 416px, 352px"
              src="/brand/mascot-vecalss.png"
              width={416}
            />
          </div>
        )}
        <CardHeader className="relative gap-7 px-7 pb-0 pt-7 md:px-10 md:pt-10 lg:pr-[32%]">
          {banner.design ? null : (
            <div>
              <h1 className="max-w-3xl text-4xl leading-[1.08] font-semibold tracking-[-0.03em] text-secondary-900 md:text-5xl">
                {getStudentBannerHeading(banner, bannerVariables)}
              </h1>
              <CardDescription className="mt-5 max-w-[42ch] text-base leading-7 text-secondary-600">
                {getStudentBannerDescription(banner, bannerVariables)}
              </CardDescription>
            </div>
          )}
          <div className="flex flex-wrap gap-3">
            <span className="inline-flex min-h-10 items-center rounded-full border border-white/80 bg-white/90 px-4 py-2 text-sm font-bold text-primary-700 shadow-[0_14px_30px_-22px_color-mix(in_oklab,var(--voyage-deep)_50%,transparent)]">
              {daysLeft === null ? "Pasang target" : daysLeft === 0 ? "Hari H UTBK" : `H-${daysLeft} UTBK`}
            </span>
            <span className="inline-flex min-h-10 items-center rounded-full bg-primary-700 px-4 py-2 text-sm font-bold text-white shadow-[0_14px_30px_-22px_color-mix(in_oklab,var(--voyage-deep)_58%,transparent)]">
              Preview read-only
            </span>
          </div>
        </CardHeader>
      </Card>

      <Card className="rounded-[2rem] border border-secondary-300 bg-white py-0 shadow-none">
        <CardHeader className="px-5 pt-5">
          <CardTitle className="text-lg">Akses cepat</CardTitle>
          <CardDescription>
            Link belajar tetap berada di namespace admin preview. State siswa tidak dibaca atau diubah.
          </CardDescription>
        </CardHeader>
        <CardContent className="grid gap-3 px-5 pb-5 sm:grid-cols-3">
          {[
            ["Materi", "Baca katalog dan lesson yang sudah terbit.", "/courses"],
            ["Kuis", "Baca kuis terbit tanpa membuat percobaan.", "/quiz"],
            ["Tryout", "Cabang preview berikutnya.", "/tryout"],
          ].map(([label, description, path]) => (
            <Link
              className="group rounded-2xl border border-secondary-300 bg-white p-4 transition-colors hover:border-primary-300 hover:bg-primary-50/35"
              href={buildAdminStudentPreviewRoute(path)}
              key={label}
            >
              <p className="font-semibold text-secondary-900">{label}</p>
              <p className="mt-1 text-xs leading-5 text-secondary-500">{description}</p>
              <ChevronRight className="mt-3 size-4 text-primary-700 transition-transform group-hover:translate-x-0.5" />
            </Link>
          ))}
        </CardContent>
      </Card>

      <Card className="rounded-[2rem] border border-secondary-300 bg-white py-0 shadow-none">
        <CardHeader className="px-5 pt-5">
          <CardTitle className="text-lg">Ringkasan profil preview</CardTitle>
          <CardDescription>Nilai ini berasal dari fixture siswa tetap dan hanya dibaca.</CardDescription>
        </CardHeader>
        <CardContent className="grid gap-3 px-5 pb-5 sm:grid-cols-3">
          <SummaryItem label="Siswa" value={data.profile.displayName} />
          <SummaryItem label="Target jurusan" value={data.profile.targetMajor ?? "Belum diatur"} />
          <SummaryItem label="Target kampus" value={data.profile.targetUniversity ?? "Belum diatur"} />
        </CardContent>
      </Card>

      <PreviewNavigation activeLabel="Beranda" />
    </section>
  );
}

function SummaryItem({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-2xl border border-secondary-200 bg-secondary-50/60 px-4 py-3">
      <p className="text-xs font-semibold tracking-[0.12em] text-secondary-500 uppercase">{label}</p>
      <p className="mt-1 text-sm font-semibold text-secondary-900">{value}</p>
    </div>
  );
}

function AdminStudentPreviewMateriCatalogueSurface({
  courses,
  banner,
  bannerVariables,
}: {
  banner: AdminPreviewBerandaRead["banner"];
  bannerVariables: StudentBannerVariables;
  courses: AdminPreviewMateriCourse[];
}) {
  return (
    <section className="mx-auto flex w-full max-w-[78rem] flex-col gap-8">
      <PreviewSurfaceHeader banner={banner} variables={bannerVariables} />
      {courses.length > 0 ? (
        <section aria-labelledby="preview-course-list-title" className="flex flex-col gap-4">
          <div className="flex items-center gap-4 px-1">
            <h2 className="shrink-0 text-lg font-extrabold tracking-[-0.025em] text-[var(--voyage-ink)] md:text-xl" id="preview-course-list-title">
              Subtes terbit
            </h2>
            <span aria-hidden="true" className="h-px flex-1 bg-[var(--voyage-soft-border)]" />
          </div>
          <div className="flex flex-col gap-4">
            {courses.map((course) => (
              <StudentCatalogueCard
                href={buildAdminStudentPreviewMateriRoute(course.slug)}
                key={course.slug}
                variant="materi"
              >
                <span className="grid size-14 shrink-0 place-items-center rounded-[1.25rem] bg-[linear-gradient(135deg,var(--voyage-sea-glass)_0%,var(--voyage-sea-glass-wash)_100%)] text-[var(--voyage-forest)] shadow-[inset_0_-2px_0_color-mix(in_oklab,var(--voyage-deep)_8%,transparent)] md:size-20 md:rounded-[1.6rem]">
                  <BookOpen className="size-7 md:size-9" strokeWidth={2.2} />
                </span>
                <div className="mt-4 min-w-0 md:mt-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="text-xs font-extrabold tracking-[0.14em] text-[var(--voyage-muted-ink)] uppercase">TPA</span>
                    <span className="size-1 rounded-full bg-[var(--primary-300)]" />
                    <span className="text-xs font-extrabold tracking-[0.14em] text-[var(--voyage-muted-ink)] uppercase">{course.code}</span>
                  </div>
                  <h2 className="mt-2 text-xl leading-tight font-extrabold tracking-[-0.035em] text-balance md:text-2xl">{course.name}</h2>
                  <div className="mt-4 flex flex-wrap items-center gap-x-4 gap-y-2 text-xs font-semibold text-[var(--voyage-muted-ink)] sm:text-sm">
                    <span className="inline-flex items-center gap-1.5"><FileText className="size-4" /> {course.lessons.length} unit</span>
                    <span className="inline-flex items-center gap-1.5"><CheckCircle2 className="size-4" /> Published</span>
                  </div>
                </div>
                <div className="mt-4 flex items-center justify-end border-t border-[var(--secondary-200)] pt-4 md:mt-0 md:border-t-0 md:pt-0">
                  <span className="grid size-11 place-items-center rounded-full bg-[var(--voyage-forest)] text-white shadow-[0_10px_24px_-16px_color-mix(in_oklab,var(--voyage-forest)_75%,transparent)]">
                    <ChevronRight className="size-5" strokeWidth={2.6} />
                  </span>
                </div>
              </StudentCatalogueCard>
            ))}
          </div>
        </section>
      ) : (
        <div className="rounded-[2rem] border border-[var(--voyage-soft-border)] bg-white px-6 py-12 text-center shadow-[0_24px_50px_-42px_color-mix(in_oklab,var(--voyage-forest)_45%,transparent)]">
          <p className="text-base font-extrabold text-[var(--voyage-ink)]">Belum ada bacaan terbit</p>
          <p className="mt-2 text-sm text-[var(--voyage-muted-ink)]">Bacaan yang tersedia akan muncul di sini.</p>
        </div>
      )}
      <PreviewNavigation activeLabel="Materi" />
    </section>
  );
}

function AdminStudentPreviewMateriCourseSurface({ course }: { course: AdminPreviewMateriCourse }) {
  return (
    <section className="mx-auto flex w-full max-w-[78rem] flex-col gap-6">
      <PreviewSurfaceHeader
        description="Jalur ini hanya menampilkan lesson yang berstatus published. Progress, lock, dan skip siswa tidak digunakan dalam preview."
        title={`${course.name} (${course.code})`}
      />
      <div className="grid gap-3">
        {course.lessons.map((lesson) => (
          <StudentCatalogueCard
            href={buildAdminStudentPreviewMateriRoute(course.slug, lesson.code)}
            key={lesson.code}
            variant="materi"
          >
            <span className="grid size-12 shrink-0 place-items-center rounded-2xl bg-[var(--voyage-sea-glass-wash)] text-[var(--voyage-forest)]">
              <FileText className="size-6" />
            </span>
            <div className="min-w-0 flex-1">
              <p className="text-xs font-bold tracking-[0.14em] text-[var(--voyage-muted-ink)] uppercase">Bagian {lesson.position + 1}</p>
              <h2 className="mt-1 text-lg leading-tight font-extrabold tracking-[-0.025em] text-[var(--voyage-ink)]">{lesson.title}</h2>
              {lesson.summary ? <p className="mt-1 line-clamp-2 text-sm leading-6 text-[var(--voyage-muted-ink)]">{lesson.summary}</p> : null}
              <p className="mt-2 text-xs font-semibold text-[var(--voyage-muted-ink)]">PDF published · read-only</p>
            </div>
            <ChevronRight className="size-5 shrink-0 text-[var(--voyage-forest)]" />
          </StudentCatalogueCard>
        ))}
      </div>
      {course.lessons.length === 0 ? (
        <div className="rounded-[2rem] border border-dashed border-[var(--voyage-soft-border)] bg-white px-6 py-12 text-center">
          <p className="font-semibold text-[var(--voyage-ink)]">Belum ada lesson published</p>
        </div>
      ) : null}
    </section>
  );
}

function AdminStudentPreviewMateriLessonSurface({
  course,
  lesson,
}: {
  course: AdminPreviewMateriCourse;
  lesson: AdminPreviewMateriLesson;
}) {
  const documentUrl = buildAdminStudentPreviewMateriDocumentRoute(
    course.slug,
    lesson.code,
    lesson.document.managedAssetId,
  );

  return (
    <article className="mx-auto w-full max-w-[96rem]">
      <MateriLessonPresentation
        document={lesson.document}
        documentDeliveryUrl={documentUrl}
        position={lesson.position}
        showDuration={false}
        subject={course.name}
        title={lesson.title}
        videoUrl={lesson.optionalVideo?.mediaUrl}
      />
      <PreviewContentBlocks content={lesson.content} summary={lesson.summary} />
      <div className="mt-6 rounded-2xl border border-[var(--warning-200)] bg-[var(--warning-50)] px-4 py-3 text-sm leading-6 text-secondary-700">
        Preview hanya membaca konten terbit. Tombol selesai, skip, progress, dan aksi learner sengaja tidak tersedia.
      </div>
    </article>
  );
}

function PreviewContentBlocks({
  content,
  summary,
}: {
  content: AdminPreviewContentBlock[];
  summary: string | null;
}) {
  if (!summary && content.length === 0) return null;

  return (
    <section aria-label="Ringkasan konten Materi" className="mt-8 grid gap-4">
      {summary ? (
        <Card className="rounded-3xl border border-[var(--voyage-soft-border)] bg-white shadow-none">
          <CardHeader>
            <CardTitle className="text-lg">Ringkasan</CardTitle>
            <CardDescription className="whitespace-pre-wrap text-sm leading-7 text-secondary-600">{summary}</CardDescription>
          </CardHeader>
        </Card>
      ) : null}
      {content.map((block, index) => (
        <Card className="rounded-3xl border border-[var(--voyage-soft-border)] bg-white shadow-none" key={`${block.title ?? "content"}-${block.body.slice(0, 32)}`}>
          <CardHeader>
            <CardTitle className="text-lg">{block.title ?? `Catatan ${index + 1}`}</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="whitespace-pre-wrap text-sm leading-7 text-secondary-700">{block.body}</p>
          </CardContent>
        </Card>
      ))}
    </section>
  );
}

const tryoutDateFormatter = new Intl.DateTimeFormat("id-ID", {
  dateStyle: "medium",
  timeStyle: "short",
  timeZone: "Asia/Jakarta",
});

const tryoutScheduleLabels: Record<AdminPreviewTryoutSchedule["scheduleStatus"], string> = {
  active: "Aktif",
  archived: "Arsip",
  closed: "Closed",
  future: "Akan datang",
};

function formatTryoutDate(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "Tanggal tidak tersedia";

  return tryoutDateFormatter.format(date);
}

function TryoutScheduleBadge({ status }: { status: AdminPreviewTryoutSchedule["scheduleStatus"] }) {
  const tone = status === "active"
    ? "success"
    : status === "closed"
      ? "attention"
      : status === "future"
        ? "info"
        : "neutral";

  return <StudentBadge size="sm" tone={tone}>{tryoutScheduleLabels[status]}</StudentBadge>;
}

function TryoutScheduleLine({ session }: { session: AdminPreviewTryoutSchedule }) {
  return (
    <div className="flex flex-col gap-2 rounded-2xl border border-secondary-200 bg-secondary-50/60 px-4 py-3 sm:flex-row sm:items-center sm:justify-between sm:gap-4">
      <div className="min-w-0">
        <p className="truncate text-sm font-bold text-secondary-900">{session.name}</p>
        <p className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-1 text-xs leading-5 text-secondary-600">
          <Clock3 className="size-3.5 shrink-0" />
          {formatTryoutDate(session.availableFrom)} · {formatTryoutDate(session.availableUntil)}
        </p>
      </div>
      <TryoutScheduleBadge status={session.scheduleStatus} />
    </div>
  );
}

function AdminStudentPreviewTryoutCatalogueSurface({
  banner,
  bannerVariables,
  tryouts,
}: {
  banner: AdminPreviewTryoutRead["banner"];
  bannerVariables: StudentBannerVariables;
  tryouts: AdminPreviewTryout[];
}) {
  return (
    <section className="mx-auto flex w-full max-w-[78rem] flex-col gap-8">
      <PreviewSurfaceHeader banner={banner} variables={bannerVariables} />

      <div className="flex items-center gap-3 rounded-2xl border border-[var(--warning-200)] bg-[var(--warning-50)] px-4 py-3 text-sm leading-6 text-secondary-700">
        <ShieldCheck className="size-5 shrink-0 text-[var(--voyage-warm-sun-ink)]" />
        <span>Tryout hanya dibaca melalui data published. Preview tidak membuat attempt, jawaban, nilai, atau progress siswa.</span>
      </div>

      {tryouts.length > 0 ? (
        <section aria-labelledby="preview-tryout-list-title" className="flex flex-col gap-5">
          <div className="flex items-center gap-4 px-1">
            <h2 className="shrink-0 text-2xl leading-tight font-extrabold tracking-[-0.03em] text-secondary-900 md:text-3xl" id="preview-tryout-list-title">
              Tryout terbit
            </h2>
            <span aria-hidden="true" className="h-px flex-1 bg-[var(--voyage-soft-border)]" />
          </div>
          <div className="grid gap-5 md:grid-cols-2 xl:grid-cols-3">
            {tryouts.map((tryout) => {
              const activeOrClosedSessions = tryout.schedule.filter((session) => session.scheduleStatus === "active" || session.scheduleStatus === "closed");
              const currentSession = tryout.schedule.find((session) => session.scheduleStatus === "active")
                ?? tryout.schedule.find((session) => session.scheduleStatus === "closed")
                ?? tryout.schedule.find((session) => session.scheduleStatus === "future")
                ?? tryout.schedule[0];

              return (
                <StudentCatalogueCard href={buildAdminStudentPreviewTryoutRoute(tryout.id)} key={tryout.id} variant="tryout">
                  <div className="relative flex h-full flex-col p-6 md:p-7">
                    <div className="relative flex items-start justify-between gap-3">
                      <span className="grid size-14 place-items-center rounded-[1.25rem] bg-[linear-gradient(135deg,var(--voyage-sea-glass)_0%,var(--voyage-sea-glass-wash)_100%)] text-[var(--voyage-forest)] shadow-[inset_0_-2px_0_color-mix(in_oklab,var(--voyage-deep)_8%,transparent)] md:size-16">
                        <ListChecks className="size-7 md:size-8" strokeWidth={2.2} />
                      </span>
                      {currentSession ? <TryoutScheduleBadge status={currentSession.scheduleStatus} /> : null}
                    </div>
                    <div className="relative mt-8">
                      <p className="text-xs font-extrabold tracking-[0.14em] text-primary-700 uppercase">Published tryout</p>
                      <h3 className="mt-2 text-3xl leading-[0.98] font-extrabold tracking-[-0.04em] text-balance text-secondary-900 md:text-4xl">{tryout.title}</h3>
                      {tryout.description ? <p className="mt-3 line-clamp-3 text-sm leading-6 text-secondary-600">{tryout.description}</p> : null}
                    </div>
                    <div className="relative mt-auto flex flex-wrap items-end justify-between gap-4 pt-8">
                      <span className="inline-flex items-center gap-1.5 text-sm font-bold text-secondary-700">
                        <Timer className="size-4" />
                        {tryout.sections.length} bagian · {activeOrClosedSessions.length} sesi aman
                      </span>
                      <span className="grid size-11 shrink-0 place-items-center rounded-full bg-[var(--voyage-forest)] text-white shadow-[0_10px_24px_-16px_color-mix(in_oklab,var(--voyage-forest)_75%,transparent)]">
                        <ChevronRight className="size-5" strokeWidth={2.6} />
                      </span>
                    </div>
                  </div>
                </StudentCatalogueCard>
              );
            })}
          </div>
        </section>
      ) : (
        <Card className="rounded-[2rem] border border-dashed border-primary-200 bg-primary-50/35 py-12 text-center shadow-none">
          <CardHeader>
            <CardTitle>Belum ada Tryout terbit</CardTitle>
            <CardDescription>Tryout yang sudah dipublikasikan akan muncul di preview ini.</CardDescription>
          </CardHeader>
        </Card>
      )}

      <PreviewNavigation activeLabel="Tryout" />
    </section>
  );
}

function AdminStudentPreviewTryoutDetailSurface({ tryout }: { tryout: AdminPreviewTryout }) {
  return (
    <section className="mx-auto flex w-full max-w-[78rem] flex-col gap-8">
      <PreviewSurfaceHeader
        description={tryout.description ?? "Tryout terbit untuk dibaca dalam pengalaman siswa."}
        title={tryout.title}
      />

      <div className="flex flex-wrap gap-3 text-sm font-bold text-primary-800">
        <span className="inline-flex items-center gap-2 rounded-full border border-primary-100 bg-primary-50 px-4 py-2.5">
          <ListChecks className="size-4" />
          {tryout.sections.length} bagian
        </span>
        <span className="inline-flex items-center gap-2 rounded-full border border-primary-100 bg-primary-50 px-4 py-2.5">
          <Clock3 className="size-4" />
          {tryout.schedule.length} sesi
        </span>
        <span className="inline-flex items-center gap-2 rounded-full border border-primary-100 bg-primary-50 px-4 py-2.5">
          <ShieldCheck className="size-4" />
          Published
        </span>
      </div>

      <Card className="rounded-[2rem] border border-[var(--warning-200)] bg-[var(--warning-50)] shadow-none">
        <CardHeader>
          <CardTitle className="text-lg">Tampilan read-only</CardTitle>
          <CardDescription>Halaman ini memeriksa surface siswa tanpa memuat attempt atau jawaban. Restart preview hanya tersedia sebagai aksi eksplisit admin.</CardDescription>
        </CardHeader>
      </Card>

      <div className="grid gap-6 lg:grid-cols-[minmax(0,1.1fr)_minmax(18rem,0.9fr)]">
        <Card className="rounded-[2rem] border border-secondary-200 bg-white shadow-none">
          <CardHeader>
            <CardTitle className="text-xl">Jadwal sesi</CardTitle>
            <CardDescription>Sumber restart yang aman hanya sesi aktif atau closed.</CardDescription>
          </CardHeader>
          <CardContent className="grid gap-3">
            {tryout.schedule.length > 0 ? tryout.schedule.map((session) => <TryoutScheduleLine key={session.id} session={session} />) : (
              <p className="rounded-2xl border border-dashed border-secondary-200 px-4 py-6 text-center text-sm text-secondary-600">Belum ada sesi published.</p>
            )}
          </CardContent>
        </Card>

        <Card className="rounded-[2rem] border border-secondary-200 bg-white shadow-none">
          <CardHeader>
            <CardTitle className="text-xl">Admission preview</CardTitle>
            <CardDescription>Status admission dan assignment dipisahkan dari status publication Tryout.</CardDescription>
          </CardHeader>
          <CardContent className="grid gap-3 text-sm">
            <SummaryItem label="Admission" value={tryout.admission.status ?? "Belum ada admission"} />
            <SummaryItem label="Assignment current" value={tryout.assignments.current ? "Aktif" : "Belum ada"} />
            <SummaryItem label="Riwayat superseded" value={`${tryout.assignments.history.length} assignment`} />
          </CardContent>
        </Card>
      </div>

      <section aria-labelledby="preview-tryout-sections-title" className="grid gap-5">
        <div>
          <h2 className="text-2xl leading-tight font-extrabold tracking-[-0.03em] text-secondary-900 md:text-3xl" id="preview-tryout-sections-title">Struktur tryout</h2>
          <p className="mt-2 text-sm leading-6 text-secondary-600">Metadata bagian terbit ditampilkan untuk memeriksa urutan dan beban waktu.</p>
        </div>
        {tryout.sections.length > 0 ? (
          <div className="grid gap-3 sm:grid-cols-2">
            {tryout.sections.map((section) => (
              <Card className="rounded-3xl border border-secondary-200 bg-white shadow-none" key={`${section.sequenceNo}-${section.title}`}>
                <CardHeader className="gap-2">
                  <p className="text-xs font-bold tracking-[0.14em] text-primary-700 uppercase">Bagian {section.sequenceNo}</p>
                  <CardTitle className="text-lg leading-6">{section.title}</CardTitle>
                  <CardDescription className="flex flex-wrap gap-x-3 gap-y-1 text-xs">
                    <span>{section.questionCount} soal</span>
                    <span>{Math.ceil(section.durationSeconds / 60)} menit</span>
                    <span>{section.testType.toUpperCase()}</span>
                  </CardDescription>
                </CardHeader>
                {section.instructions ? (
                  <CardContent className="pt-0">
                    <p className="whitespace-pre-wrap text-sm leading-6 text-secondary-600">{section.instructions}</p>
                  </CardContent>
                ) : null}
              </Card>
            ))}
          </div>
        ) : (
          <Card className="rounded-3xl border border-dashed border-secondary-200 bg-secondary-50/40 py-8 text-center shadow-none">
            <CardHeader><CardTitle className="text-lg">Belum ada bagian</CardTitle></CardHeader>
          </Card>
        )}
      </section>

      <AdminStudentPreviewTryoutRestart tryout={tryout} />
      <PreviewNavigation activeLabel="Tryout" />
    </section>
  );
}

export {
  AdminStudentPreviewBerandaSurface,
  AdminStudentPreviewMateriCatalogueSurface,
  AdminStudentPreviewMateriCourseSurface,
  AdminStudentPreviewMateriLessonSurface,
  AdminStudentPreviewTryoutCatalogueSurface,
  AdminStudentPreviewTryoutDetailSurface,
};
