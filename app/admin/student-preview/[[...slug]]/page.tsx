import type { Metadata } from "next";
import Link from "next/link";

import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { requireAdminStudentPreviewContext } from "@/lib/auth/access";
import {
  getAdminPreviewBeranda,
  getAdminPreviewBannerEditor,
  getAdminPreviewMateriCatalogueSurface,
  getAdminPreviewMateriCourse,
  getAdminPreviewMateriLesson,
} from "@/lib/admin/student-preview-reads";
import {
  getAdminPreviewQuizCatalogueSurface,
  getAdminPreviewQuizDetail,
  getAdminPreviewQuizSubject,
} from "@/lib/admin/student-preview-quiz-reads";
import {
  getAdminPreviewTryoutCatalogue,
  getAdminPreviewTryoutDetail,
} from "@/lib/admin/student-preview-tryout-reads";
import {
  isAdminStudentPreviewUnavailableError,
  type AdminStudentPreviewContext,
} from "@/lib/admin/student-preview";
import {
  buildAdminStudentPreviewMateriRoute,
  buildAdminStudentPreviewRoute,
} from "@/lib/student/preview-routes";
import { AdminStudentPreviewShell } from "@/modules/student/components/admin-student-preview-shell";
import { AdminStudentPreviewUnavailable } from "@/modules/student/components/admin-student-preview-unavailable";
import { StudentBannerEditor } from "@/modules/admin/components/student-banner-editor";
import { updateAdminStudentPreviewBannersAction } from "@/modules/admin/student-banners-actions";
import {
  AdminStudentPreviewBerandaSurface,
  AdminStudentPreviewMateriCatalogueSurface,
  AdminStudentPreviewMateriCourseSurface,
  AdminStudentPreviewMateriLessonSurface,
  AdminStudentPreviewTryoutCatalogueSurface,
  AdminStudentPreviewTryoutDetailSurface,
} from "@/modules/student/components/admin-student-preview-surfaces";
import {
  AdminStudentPreviewQuizCatalogueSurface,
  AdminStudentPreviewQuizDetailSurface,
  AdminStudentPreviewQuizSubjectSurface,
} from "@/modules/student/components/admin-student-preview-quiz";

export const dynamic = "force-dynamic";
export const fetchCache = "force-no-store";
export const revalidate = 0;

export const metadata: Metadata = {
  title: "Student preview | Vecalss LMS",
  description: "Admin-only, read-only student experience preview.",
};

type PreviewSurface = {
  activeLabel: "Beranda" | "Kuis" | "Materi" | "Tryout";
  breadcrumbLabel: string;
  description: string;
  title: string;
};

const previewSurfaces: Record<string, PreviewSurface> = {
  "": {
    activeLabel: "Beranda",
    breadcrumbLabel: "Beranda preview",
    description: "Beranda siswa yang dibaca melalui context preview tetap, tanpa progress atau notifikasi.",
    title: "Beranda siswa",
  },
  courses: {
    activeLabel: "Materi",
    breadcrumbLabel: "Materi preview",
    description: "Katalog Materi hanya memuat subject dan lesson yang sudah published.",
    title: "Materi siswa",
  },
  quiz: {
    activeLabel: "Kuis",
    breadcrumbLabel: "Kuis preview",
    description: "Katalog Kuis hanya memuat kuis terbit dan dapat dibaca tanpa membuat percobaan.",
    title: "Kuis siswa",
  },
  tryout: {
    activeLabel: "Tryout",
    breadcrumbLabel: "Tryout preview",
    description: "Katalog Tryout akan tersedia di surface preview berikutnya.",
    title: "Tryout siswa",
  },
};

const PREVIEW_PLACEHOLDER_LINKS = [
  ["Beranda", buildAdminStudentPreviewRoute("/")],
  ["Materi", buildAdminStudentPreviewRoute("/courses")],
  ["Kuis", buildAdminStudentPreviewRoute("/quiz")],
  ["Tryout", buildAdminStudentPreviewRoute("/tryout")],
] as const;

function PreviewPlaceholder({
  context,
  surface,
}: {
  context: AdminStudentPreviewContext;
  surface: PreviewSurface;
}) {
  const links = PREVIEW_PLACEHOLDER_LINKS;

  return (
    <section className="grid gap-6">
      <Card className="border-primary-100 bg-white shadow-[0_24px_70px_-50px_color-mix(in_oklab,var(--voyage-deep)_42%,transparent)]">
        <CardHeader>
          <p className="text-xs font-bold tracking-[0.16em] text-primary-700 uppercase">Admin-only surface</p>
          <h1 className="font-heading text-2xl font-semibold tracking-[-0.03em] text-secondary-900">{surface.title}</h1>
          <CardDescription>{surface.description}</CardDescription>
        </CardHeader>
        <CardContent>
          <p className="text-sm leading-6 text-secondary-600">
            Preview subject: <span className="font-semibold text-secondary-900">{context.student.displayName}</span>.
            This branch is intentionally read-only and does not create learner state.
          </p>
        </CardContent>
      </Card>

      <Card className="border-primary-100 bg-white">
        <CardHeader>
          <CardTitle className="text-lg">Preview navigation</CardTitle>
          <CardDescription>Every supported student link stays under the admin preview prefix.</CardDescription>
        </CardHeader>
        <CardContent className="flex flex-wrap gap-2">
          {links.map(([label, href]) => (
            <Button
              aria-current={label === surface.activeLabel ? "page" : undefined}
              key={href}
              nativeButton={false}
              render={<Link href={href} />}
              variant={label === surface.activeLabel ? "brand" : "brandOutline"}
            >
              {label}
            </Button>
          ))}
        </CardContent>
      </Card>
    </section>
  );
}

function decodePreviewSegment(value: string) {
  let decoded: string;
  try {
    decoded = decodeURIComponent(value);
  } catch {
    throw new Error("Unsafe admin student preview segment.");
  }

  if (
    !decoded
    || decoded === "."
    || decoded === ".."
    || decoded.includes("/")
    || /[\\\u0000-\u001f\u007f]/u.test(decoded)
  ) {
    throw new Error("Unsafe admin student preview segment.");
  }

  return decoded;
}

function renderPreviewShell({
  bannerEditMode = false,
  breadcrumbLabel,
  children,
  context,
  activeLabel,
  isRootPage = false,
}: {
  activeLabel: PreviewSurface["activeLabel"];
  bannerEditMode?: boolean;
  breadcrumbLabel: string;
  children: React.ReactNode;
  context: AdminStudentPreviewContext;
  isRootPage?: boolean;
}) {
  return (
    <AdminStudentPreviewShell
      activeLabel={activeLabel}
      bannerEditMode={bannerEditMode}
      breadcrumbLabel={breadcrumbLabel}
      context={context}
      isRootPage={isRootPage}
    >
      {children}
    </AdminStudentPreviewShell>
  );
}

type PreviewPageData =
  | {
      bannerEditor?: Awaited<ReturnType<typeof getAdminPreviewBannerEditor>>["data"];
      kind: "beranda";
      context: AdminStudentPreviewContext;
      data: Awaited<ReturnType<typeof getAdminPreviewBeranda>>["data"];
    }
  | { kind: "courses"; context: AdminStudentPreviewContext; data: Awaited<ReturnType<typeof getAdminPreviewMateriCatalogueSurface>>["data"] }
  | { kind: "course"; context: AdminStudentPreviewContext; data: Awaited<ReturnType<typeof getAdminPreviewMateriCourse>>["data"] }
  | { kind: "lesson"; context: AdminStudentPreviewContext; data: Awaited<ReturnType<typeof getAdminPreviewMateriLesson>>["data"] }
  | { kind: "quiz-catalogue"; context: AdminStudentPreviewContext; data: Awaited<ReturnType<typeof getAdminPreviewQuizCatalogueSurface>>["data"] }
  | { kind: "quiz-subject"; context: AdminStudentPreviewContext; data: Awaited<ReturnType<typeof getAdminPreviewQuizSubject>>["data"] }
  | { kind: "quiz-detail"; context: AdminStudentPreviewContext; data: Awaited<ReturnType<typeof getAdminPreviewQuizDetail>>["data"] }
  | { kind: "tryout-catalogue"; context: AdminStudentPreviewContext; data: Awaited<ReturnType<typeof getAdminPreviewTryoutCatalogue>>["data"] }
  | { kind: "tryout-detail"; context: AdminStudentPreviewContext; data: Awaited<ReturnType<typeof getAdminPreviewTryoutDetail>>["data"] }
  | { kind: "placeholder"; context: AdminStudentPreviewContext; surface: PreviewSurface };

async function resolvePreviewPageData(
  slug: string[],
  editBanners: boolean,
): Promise<PreviewPageData> {
  const key = slug.join("/");

  if (key === "") {
    const result = await getAdminPreviewBeranda();
    const bannerEditor = editBanners ? await getAdminPreviewBannerEditor() : undefined;
    return {
      bannerEditor: bannerEditor?.data,
      context: result.context,
      data: result.data,
      kind: "beranda",
    };
  }

  if (key === "courses") {
    const catalogue = await getAdminPreviewMateriCatalogueSurface();
    return {
      context: catalogue.context,
      data: catalogue.data,
      kind: "courses",
    };
  }

  if (key === "quiz") {
    const catalogue = await getAdminPreviewQuizCatalogueSurface();
    return {
      context: catalogue.context,
      data: catalogue.data,
      kind: "quiz-catalogue",
    };
  }

  if (key === "tryout") {
    const catalogue = await getAdminPreviewTryoutCatalogue();
    return {
      context: catalogue.context,
      data: catalogue.data,
      kind: "tryout-catalogue",
    };
  }

  if (slug[0] === "courses" && slug.length === 2) {
    const result = await getAdminPreviewMateriCourse(decodePreviewSegment(slug[1]));
    return { context: result.context, data: result.data, kind: "course" };
  }

  if (slug[0] === "courses" && slug.length === 3) {
    const result = await getAdminPreviewMateriLesson(
      decodePreviewSegment(slug[1]),
      decodePreviewSegment(slug[2]),
    );
    return { context: result.context, data: result.data, kind: "lesson" };
  }

  if (slug[0] === "quiz" && slug.length === 2) {
    const result = await getAdminPreviewQuizSubject(decodePreviewSegment(slug[1]));
    return { context: result.context, data: result.data, kind: "quiz-subject" };
  }

  if (slug[0] === "quiz" && slug.length === 3) {
    const result = await getAdminPreviewQuizDetail(
      decodePreviewSegment(slug[1]),
      decodePreviewSegment(slug[2]),
    );
    return { context: result.context, data: result.data, kind: "quiz-detail" };
  }

  if (slug[0] === "tryout" && slug.length === 2) {
    const result = await getAdminPreviewTryoutDetail(decodePreviewSegment(slug[1]));
    return { context: result.context, data: result.data, kind: "tryout-detail" };
  }

  const context = await requireAdminStudentPreviewContext();
  return {
    context,
    kind: "placeholder",
    surface: previewSurfaces[key] ?? {
      activeLabel: "Beranda",
      breadcrumbLabel: "Unsupported preview surface",
      description: "This student preview surface is not supported yet.",
      title: "Student preview",
    },
  };
}

function renderResolvedPreviewPage(data: PreviewPageData) {
  if (data.kind === "beranda") {
    const bannerEditor = data.bannerEditor ? (
      <section
        aria-label="Edit student banners"
        className="rounded-[2rem] border border-primary-200 bg-white p-5 shadow-[0_24px_58px_-44px_color-mix(in_oklab,var(--voyage-deep)_38%,transparent)] sm:p-7"
      >
        <StudentBannerEditor
          action={updateAdminStudentPreviewBannersAction}
          banners={data.bannerEditor.banners}
          hasUnpublishedChanges={data.bannerEditor.hasUnpublishedChanges}
          previewHref={buildAdminStudentPreviewRoute("/")}
          previewMode
          version={data.bannerEditor.version}
        />
      </section>
    ) : null;

    return renderPreviewShell({
      activeLabel: "Beranda",
      breadcrumbLabel: "Beranda preview",
      children: (
        <>
          <AdminStudentPreviewBerandaSurface data={data.data} />
          {bannerEditor}
        </>
      ),
      context: data.context,
      bannerEditMode: Boolean(data.bannerEditor),
      isRootPage: true,
    });
  }

  if (data.kind === "courses") {
    return renderPreviewShell({
      activeLabel: "Materi",
      breadcrumbLabel: "Materi preview",
      children: <AdminStudentPreviewMateriCatalogueSurface banner={data.data.banner} courses={data.data.courses} />,
      context: data.context,
      isRootPage: true,
    });
  }

  if (data.kind === "course") {
    return renderPreviewShell({
      activeLabel: "Materi",
      breadcrumbLabel: data.data?.name ?? "Materi tidak ditemukan",
      children: data.data
        ? <AdminStudentPreviewMateriCourseSurface course={data.data} />
        : <AdminStudentPreviewUnavailable description="Materi yang diminta tidak tersedia atau belum dipublikasikan dalam context Preview ini." returnHref={buildAdminStudentPreviewRoute("/courses")} returnLabel="Kembali ke Materi" variant="resource" />,
      context: data.context,
    });
  }

  if (data.kind === "lesson") {
    return renderPreviewShell({
      activeLabel: "Materi",
      breadcrumbLabel: data.data.lesson?.title ?? "Materi tidak ditemukan",
      children: data.data.course && data.data.lesson
        ? <AdminStudentPreviewMateriLessonSurface course={data.data.course} lesson={data.data.lesson} />
        : <AdminStudentPreviewUnavailable description="Lesson yang diminta tidak tersedia atau belum dipublikasikan dalam context Preview ini." returnHref={data.data.course ? buildAdminStudentPreviewMateriRoute(data.data.course.slug) : buildAdminStudentPreviewRoute("/courses")} returnLabel="Kembali ke Materi" variant="resource" />,
      context: data.context,
    });
  }

  if (data.kind === "quiz-catalogue") {
    return renderPreviewShell({
      activeLabel: "Kuis",
      breadcrumbLabel: "Kuis preview",
      children: <AdminStudentPreviewQuizCatalogueSurface banner={data.data.banner} subjects={data.data.subjects} />,
      context: data.context,
      isRootPage: true,
    });
  }

  if (data.kind === "quiz-subject") {
    return renderPreviewShell({
      activeLabel: "Kuis",
      breadcrumbLabel: data.data?.name ?? "Kuis tidak ditemukan",
      children: data.data
        ? <AdminStudentPreviewQuizSubjectSurface subject={data.data} />
        : <AdminStudentPreviewUnavailable description="Subjek Kuis yang diminta tidak tersedia atau belum memiliki kuis yang dipublikasikan." returnHref={buildAdminStudentPreviewRoute("/quiz")} returnLabel="Kembali ke Kuis" variant="resource" />,
      context: data.context,
    });
  }

  if (data.kind === "quiz-detail") {
    return renderPreviewShell({
      activeLabel: "Kuis",
      breadcrumbLabel: data.data?.title ?? "Kuis tidak ditemukan",
      children: data.data
        ? <AdminStudentPreviewQuizDetailSurface quiz={data.data} />
        : <AdminStudentPreviewUnavailable description="Kuis yang diminta tidak tersedia atau belum dipublikasikan dalam context Preview ini." returnHref={buildAdminStudentPreviewRoute("/quiz")} returnLabel="Kembali ke Kuis" variant="resource" />,
      context: data.context,
    });
  }

  if (data.kind === "tryout-catalogue") {
    return renderPreviewShell({
      activeLabel: "Tryout",
      breadcrumbLabel: "Tryout preview",
      children: <AdminStudentPreviewTryoutCatalogueSurface banner={data.data.banner} tryouts={data.data.tryouts} />,
      context: data.context,
      isRootPage: true,
    });
  }

  if (data.kind === "tryout-detail") {
    return renderPreviewShell({
      activeLabel: "Tryout",
      breadcrumbLabel: data.data?.title ?? "Tryout tidak ditemukan",
      children: data.data
        ? <AdminStudentPreviewTryoutDetailSurface tryout={data.data} />
        : <AdminStudentPreviewUnavailable description="Tryout yang diminta tidak tersedia atau belum dipublikasikan dalam context Preview ini." returnHref={buildAdminStudentPreviewRoute("/tryout")} returnLabel="Kembali ke Tryout" variant="resource" />,
      context: data.context,
    });
  }

  return renderPreviewShell({
    activeLabel: data.surface.activeLabel,
    breadcrumbLabel: data.surface.breadcrumbLabel,
    children: data.surface.title === "Student preview"
        ? <AdminStudentPreviewUnavailable description="URL ini belum memiliki adapter surface student yang aman untuk Preview. Tidak ada state learner yang dibuat atau diubah." returnHref={buildAdminStudentPreviewRoute("/")} returnLabel="Kembali ke Beranda preview" variant="unsupported" />
      : <PreviewPlaceholder context={data.context} surface={data.surface} />,
    context: data.context,
  });
}

export default async function AdminStudentPreviewPage({
  params,
  searchParams,
}: {
  params: Promise<{ slug?: string[] }>;
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
}) {
  const { slug = [] } = await params;
  const resolvedSearchParams = await searchParams;
  const editBanners = resolvedSearchParams?.edit === "banners"
    || (Array.isArray(resolvedSearchParams?.edit) && resolvedSearchParams.edit.includes("banners"));
  let data: PreviewPageData;

  try {
    data = await resolvePreviewPageData(slug, editBanners);
  } catch (error) {
    if (isAdminStudentPreviewUnavailableError(error)) {
      return <AdminStudentPreviewUnavailable description={error.message} variant="context" />;
    }

    throw error;
  }

  return renderResolvedPreviewPage(data);
}
