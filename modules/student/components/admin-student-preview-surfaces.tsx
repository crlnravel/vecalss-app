import Image from "next/image";
import Link from "next/link";

import { BookOpen, CheckCircle2, ChevronLeft, ChevronRight, FileText } from "@/lib/icons";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { StudentCatalogueCard } from "@/components/ui/student-catalogue-card";
import { resolveStudentBannerText } from "@/lib/student/banner-content";
import {
  buildAdminStudentPreviewMateriDocumentRoute,
  buildAdminStudentPreviewMateriRoute,
  buildAdminStudentPreviewRoute,
} from "@/lib/student/preview-routes";
import type {
  AdminPreviewBerandaRead,
  AdminPreviewContentBlock,
  AdminPreviewMateriCourse,
  AdminPreviewMateriLesson,
} from "@/lib/admin/student-preview-reads";
import { MateriLessonPresentation } from "@/modules/courses/MateriLessonPresentation";

function PreviewSurfaceHeader({
  description,
  title,
}: {
  description: string;
  title: string;
}) {
  return (
    <header className="relative isolate overflow-hidden rounded-[2rem] bg-[linear-gradient(120deg,#014c38_0%,#176b4d_58%,#2f8a5d_100%)] px-6 py-7 text-white shadow-[0_28px_60px_-38px_rgba(1,76,56,0.7)] md:px-10 md:py-9">
      <div
        aria-hidden="true"
        className="pointer-events-none absolute -top-24 right-[-3rem] size-56 rounded-full border-[18px] border-[#b7ddc3]/15 sm:size-72"
      />
      <div className="relative max-w-2xl">
        <h1 className="text-4xl leading-tight font-extrabold tracking-[-0.045em] md:text-5xl">
          {title}
        </h1>
        <p className="mt-3 max-w-xl text-sm leading-7 text-[#e7f5eb] md:text-base">
          {description}
        </p>
      </div>
    </header>
  );
}

function PreviewNavigation() {
  return (
    <nav aria-label="Navigasi preview siswa" className="flex flex-wrap gap-2">
      {[
        ["Beranda", buildAdminStudentPreviewRoute("/")],
        ["Materi", buildAdminStudentPreviewRoute("/courses")],
        ["Kuis", buildAdminStudentPreviewRoute("/quiz")],
        ["Tryout", buildAdminStudentPreviewRoute("/tryout")],
      ].map(([label, href]) => (
        <Button
          key={href}
          nativeButton={false}
          render={<Link href={href} />}
          variant={label === "Materi" ? "brand" : "brandOutline"}
        >
          {label}
        </Button>
      ))}
    </nav>
  );
}

function AdminStudentPreviewBerandaSurface({ data }: { data: AdminPreviewBerandaRead }) {
  const target = [data.profile.targetMajor, data.profile.targetUniversity]
    .filter(Boolean)
    .join(" · ") || "target belajarmu";
  const daysLeft = data.profile.examDaysLeft;

  return (
    <section className="grid gap-7">
      <Card className="relative min-h-[290px] overflow-hidden rounded-[2rem] border border-primary-200 bg-[linear-gradient(125deg,#ffffff_0%,#eef9f2_48%,#bfe6ce_100%)] shadow-[0_28px_90px_-58px_rgba(1,76,56,0.42)]">
        <div aria-hidden="true" className="pointer-events-none absolute inset-y-0 right-0 hidden w-[38%] min-w-[20rem] lg:block">
          <div className="absolute inset-x-6 bottom-5 h-12 rounded-full bg-primary-900/12 blur-2xl" />
          <Image
            alt=""
            className="absolute right-[-2.5rem] bottom-[-2.5rem] h-auto w-[22rem] max-w-none object-contain drop-shadow-[0_26px_42px_rgba(1,76,56,0.18)] xl:w-[26rem]"
            height={416}
            sizes="(min-width: 1280px) 416px, 352px"
            src="/brand/mascot-vecalss.png"
            width={416}
          />
        </div>
        <CardHeader className="relative gap-7 px-7 pb-0 pt-7 md:px-10 md:pt-10 lg:pr-[32%]">
          <div>
            <CardTitle className="max-w-3xl text-4xl leading-[1.08] font-semibold text-secondary-900 md:text-5xl">
              {resolveStudentBannerText(data.banner.beranda.title, {
                firstName: data.firstName,
                target,
              })}
            </CardTitle>
            <CardDescription className="mt-5 max-w-[42ch] text-base leading-7 text-secondary-600">
              {resolveStudentBannerText(data.banner.beranda.description, {
                firstName: data.firstName,
                target,
              })}
            </CardDescription>
          </div>
          <div className="flex flex-wrap gap-3">
            <span className="inline-flex min-h-10 items-center rounded-full border border-white/80 bg-white/90 px-4 py-2 text-sm font-bold text-primary-700 shadow-[0_14px_30px_-22px_rgba(1,76,56,0.5)]">
              {daysLeft === null ? "Pasang target" : daysLeft === 0 ? "Hari H UTBK" : `H-${daysLeft} UTBK`}
            </span>
            <span className="inline-flex min-h-10 items-center rounded-full bg-primary-700 px-4 py-2 text-sm font-bold text-white shadow-[0_14px_30px_-22px_rgba(1,76,56,0.58)]">
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
            ["Kuis", "Cabang preview berikutnya.", "/quiz"],
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

      <PreviewNavigation />
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
}: {
  banner: AdminPreviewBerandaRead["banner"];
  courses: AdminPreviewMateriCourse[];
}) {
  return (
    <section className="mx-auto flex w-full max-w-[78rem] flex-col gap-8">
      <PreviewSurfaceHeader
        description={banner.materi.description}
        title={banner.materi.title}
      />
      {courses.length > 0 ? (
        <section aria-labelledby="preview-course-list-title" className="flex flex-col gap-4">
          <div className="flex items-center gap-4 px-1">
            <h2 className="shrink-0 text-lg font-extrabold tracking-[-0.025em] text-[#173c2d] md:text-xl" id="preview-course-list-title">
              Subtes terbit
            </h2>
            <span aria-hidden="true" className="h-px flex-1 bg-[#d6e5db]" />
          </div>
          <div className="flex flex-col gap-4">
            {courses.map((course) => (
              <StudentCatalogueCard
                href={buildAdminStudentPreviewMateriRoute(course.slug)}
                key={course.slug}
                variant="materi"
              >
                <span className="grid size-14 shrink-0 place-items-center rounded-[1.25rem] bg-[linear-gradient(135deg,#b7ddc3_0%,#eef8f1_100%)] text-[#176b4d] shadow-[inset_0_-2px_0_rgba(1,76,56,0.08)] md:size-20 md:rounded-[1.6rem]">
                  <BookOpen className="size-7 md:size-9" strokeWidth={2.2} />
                </span>
                <div className="mt-4 min-w-0 md:mt-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="text-xs font-extrabold tracking-[0.14em] text-[#477060] uppercase">TPA</span>
                    <span className="size-1 rounded-full bg-[#9dcab0]" />
                    <span className="text-xs font-extrabold tracking-[0.14em] text-[#477060] uppercase">{course.code}</span>
                  </div>
                  <h2 className="mt-2 text-xl leading-tight font-extrabold tracking-[-0.035em] text-balance md:text-2xl">{course.name}</h2>
                  <div className="mt-4 flex flex-wrap items-center gap-x-4 gap-y-2 text-xs font-semibold text-[#5f776a] sm:text-sm">
                    <span className="inline-flex items-center gap-1.5"><FileText className="size-4" /> {course.lessons.length} unit</span>
                    <span className="inline-flex items-center gap-1.5"><CheckCircle2 className="size-4" /> Published</span>
                  </div>
                </div>
                <div className="mt-4 flex items-center justify-end border-t border-[#e2ece5] pt-4 md:mt-0 md:border-t-0 md:pt-0">
                  <span className="grid size-11 place-items-center rounded-full bg-[#176b4d] text-white shadow-[0_10px_24px_-16px_rgba(23,107,77,0.75)]">
                    <ChevronRight className="size-5" strokeWidth={2.6} />
                  </span>
                </div>
              </StudentCatalogueCard>
            ))}
          </div>
        </section>
      ) : (
        <div className="rounded-[2rem] border border-[#d6e5db] bg-white px-6 py-12 text-center shadow-[0_24px_50px_-42px_rgba(23,107,77,0.45)]">
          <p className="text-base font-extrabold text-[#173c2d]">Belum ada bacaan terbit</p>
          <p className="mt-2 text-sm text-[#5f776a]">Bacaan yang tersedia akan muncul di sini.</p>
        </div>
      )}
      <PreviewNavigation />
    </section>
  );
}

function AdminStudentPreviewMateriCourseSurface({ course }: { course: AdminPreviewMateriCourse }) {
  return (
    <section className="mx-auto flex w-full max-w-[78rem] flex-col gap-6">
      <Button
        aria-label="Kembali ke katalog Materi"
        nativeButton={false}
        render={<Link href={buildAdminStudentPreviewRoute("/courses")} />}
        size="icon"
        title="Kembali ke katalog Materi"
        variant="ghost"
      >
        <ChevronLeft />
      </Button>
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
            <span className="grid size-12 shrink-0 place-items-center rounded-2xl bg-[#e8f5ec] text-[#176b4d]">
              <FileText className="size-6" />
            </span>
            <div className="min-w-0 flex-1">
              <p className="text-xs font-bold tracking-[0.14em] text-[#477060] uppercase">Bagian {lesson.position + 1}</p>
              <h2 className="mt-1 text-lg leading-tight font-extrabold tracking-[-0.025em] text-[#173c2d]">{lesson.title}</h2>
              {lesson.summary ? <p className="mt-1 line-clamp-2 text-sm leading-6 text-[#5f776a]">{lesson.summary}</p> : null}
              <p className="mt-2 text-xs font-semibold text-[#5f776a]">PDF published · read-only</p>
            </div>
            <ChevronRight className="size-5 shrink-0 text-[#176b4d]" />
          </StudentCatalogueCard>
        ))}
      </div>
      {course.lessons.length === 0 ? (
        <div className="rounded-[2rem] border border-dashed border-[#d6e5db] bg-white px-6 py-12 text-center">
          <p className="font-semibold text-[#173c2d]">Belum ada lesson published</p>
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
      <Button
        aria-label={`Kembali ke ${course.name}`}
        nativeButton={false}
        render={<Link href={buildAdminStudentPreviewMateriRoute(course.slug)} />}
        size="icon"
        title={`Kembali ke ${course.name}`}
        variant="ghost"
      >
        <ChevronLeft />
      </Button>
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
      <div className="mt-6 rounded-2xl border border-[#f0c98a] bg-[#fff8e8] px-4 py-3 text-sm leading-6 text-secondary-700">
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
        <Card className="rounded-3xl border border-[#d6e5db] bg-white shadow-none">
          <CardHeader>
            <CardTitle className="text-lg">Ringkasan</CardTitle>
            <CardDescription className="whitespace-pre-wrap text-sm leading-7 text-secondary-600">{summary}</CardDescription>
          </CardHeader>
        </Card>
      ) : null}
      {content.map((block, index) => (
        <Card className="rounded-3xl border border-[#d6e5db] bg-white shadow-none" key={`${block.title ?? "content"}-${index}`}>
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

export {
  AdminStudentPreviewBerandaSurface,
  AdminStudentPreviewMateriCatalogueSurface,
  AdminStudentPreviewMateriCourseSurface,
  AdminStudentPreviewMateriLessonSurface,
};
