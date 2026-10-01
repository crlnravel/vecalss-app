import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";

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
import { buildBannerMakerDestinationRoute, type BannerDestination } from "@/lib/banner/destinations";
import type { AdminStudentBannerRequest } from "@/lib/student/banner-reader";
import {
  buildAdminStudentPreviewMateriRoute,
  buildAdminStudentPreviewRoute,
} from "@/lib/student/preview-routes";
import { AdminStudentPreviewShell } from "@/modules/student/components/admin-student-preview-shell";
import { AdminStudentPreviewUnavailable } from "@/modules/student/components/admin-student-preview-unavailable";
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
  title: "Pratinjau tampilan siswa | Vecalss",
  description: "Lihat tampilan siswa tanpa membuat atau mengubah data belajar.",
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
    breadcrumbLabel: "Pratinjau beranda",
    description: "Lihat tampilan beranda siswa tanpa mengubah data belajar atau notifikasi.",
    title: "Beranda siswa",
  },
  courses: {
    activeLabel: "Materi",
    breadcrumbLabel: "Pratinjau Materi",
    description: "Katalog hanya menampilkan Materi yang sudah dipublikasikan.",
    title: "Materi siswa",
  },
  quiz: {
    activeLabel: "Kuis",
    breadcrumbLabel: "Pratinjau Kuis",
    description: "Katalog hanya menampilkan Kuis yang sudah dipublikasikan. Membuka pratinjau tidak membuat pengerjaan baru.",
    title: "Kuis siswa",
  },
  tryout: {
    activeLabel: "Tryout",
    breadcrumbLabel: "Pratinjau Tryout",
    description: "Lihat katalog Tryout seperti yang ditampilkan kepada siswa.",
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
          <p className="text-xs font-bold tracking-[0.16em] text-primary-700 uppercase">Pratinjau untuk admin</p>
          <h1 className="font-heading text-2xl font-semibold tracking-[-0.03em] text-secondary-900">{surface.title}</h1>
          <CardDescription>{surface.description}</CardDescription>
        </CardHeader>
        <CardContent>
          <p className="text-sm leading-6 text-secondary-600">
            Pratinjau untuk <span className="font-semibold text-secondary-900">{context.student.displayName}</span>.
            Tampilan ini hanya-baca dan tidak membuat atau mengubah data belajar siswa.
          </p>
        </CardContent>
      </Card>

      <Card className="border-primary-100 bg-white">
        <CardHeader>
          <CardTitle className="text-lg">Navigasi pratinjau</CardTitle>
          <CardDescription>Gunakan tautan berikut untuk melihat beranda, Materi, Kuis, atau Tryout siswa.</CardDescription>
        </CardHeader>
        <CardContent className="flex flex-wrap gap-2">
          {links.map(([label, href]) => (
            <Button
              aria-current={label === surface.activeLabel ? "page" : undefined}
              key={href}
              nativeButton={false}
              render={<Link href={href} />}
              variant={label === surface.activeLabel ? "default" : "outline"}
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

function readPreviewQueryValue(
  searchParams: Record<string, string | string[] | undefined>,
  key: string,
) {
  const value = searchParams[key];
  return typeof value === "string" ? value : null;
}

function parseBannerPreviewRequest(
  searchParams: Record<string, string | string[] | undefined>,
): AdminStudentBannerRequest {
  if (readPreviewQueryValue(searchParams, "bannerSource") !== "draft") {
    return { mode: "published" };
  }

  const revision = readPreviewQueryValue(searchParams, "revision");
  return {
    mode: "draft",
    revision: revision && /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/iu.test(revision)
      ? revision
      : null,
  };
}

function previewBannerDestination(slug: string[]): BannerDestination {
  if (slug[0] === "courses") return "materi";
  if (slug[0] === "quiz") return "kuis";
  if (slug[0] === "tryout") return "tryout";
  return "beranda";
}

async function resolvePreviewPageData(
  slug: string[],
  bannerRequest: AdminStudentBannerRequest,
): Promise<PreviewPageData> {
  const key = slug.join("/");

  if (key === "") {
    const result = await getAdminPreviewBeranda(bannerRequest);
    return {
      context: result.context,
      data: result.data,
      kind: "beranda",
    };
  }

  if (key === "courses") {
    const catalogue = await getAdminPreviewMateriCatalogueSurface(bannerRequest);
    return {
      context: catalogue.context,
      data: catalogue.data,
      kind: "courses",
    };
  }

  if (key === "quiz") {
    const catalogue = await getAdminPreviewQuizCatalogueSurface(bannerRequest);
    return {
      context: catalogue.context,
      data: catalogue.data,
      kind: "quiz-catalogue",
    };
  }

  if (key === "tryout") {
    const catalogue = await getAdminPreviewTryoutCatalogue(bannerRequest);
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
      breadcrumbLabel: "Pratinjau siswa",
      description: "Pratinjau untuk halaman ini belum tersedia.",
      title: "Pratinjau siswa",
    },
  };
}

function renderResolvedPreviewPage(data: PreviewPageData) {
  if (data.kind === "beranda") {
    return renderPreviewShell({
      activeLabel: "Beranda",
      breadcrumbLabel: "Pratinjau beranda",
      children: (
        <>
          <AdminStudentPreviewBerandaSurface data={data.data} />
        </>
      ),
      context: data.context,
      isRootPage: true,
    });
  }

  if (data.kind === "courses") {
    return renderPreviewShell({
      activeLabel: "Materi",
      breadcrumbLabel: "Pratinjau Materi",
      children: <AdminStudentPreviewMateriCatalogueSurface banner={data.data.banner} bannerVariables={data.data.bannerVariables} courses={data.data.courses} />,
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
        : <AdminStudentPreviewUnavailable description="Materi ini belum tersedia atau belum dipublikasikan." returnHref={buildAdminStudentPreviewRoute("/courses")} returnLabel="Kembali ke Materi" variant="resource" />,
      context: data.context,
    });
  }

  if (data.kind === "lesson") {
    return renderPreviewShell({
      activeLabel: "Materi",
      breadcrumbLabel: data.data.lesson?.title ?? "Materi tidak ditemukan",
      children: data.data.course && data.data.lesson
        ? <AdminStudentPreviewMateriLessonSurface course={data.data.course} lesson={data.data.lesson} />
        : <AdminStudentPreviewUnavailable description="Materi ini belum tersedia atau belum dipublikasikan." returnHref={data.data.course ? buildAdminStudentPreviewMateriRoute(data.data.course.slug) : buildAdminStudentPreviewRoute("/courses")} returnLabel="Kembali ke Materi" variant="resource" />,
      context: data.context,
    });
  }

  if (data.kind === "quiz-catalogue") {
    return renderPreviewShell({
      activeLabel: "Kuis",
      breadcrumbLabel: "Pratinjau Kuis",
      children: <AdminStudentPreviewQuizCatalogueSurface banner={data.data.banner} bannerVariables={data.data.bannerVariables} subjects={data.data.subjects} />,
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
        : <AdminStudentPreviewUnavailable description="Subtes yang dipilih belum tersedia atau belum memiliki Kuis yang dipublikasikan." returnHref={buildAdminStudentPreviewRoute("/quiz")} returnLabel="Kembali ke Kuis" variant="resource" />,
      context: data.context,
    });
  }

  if (data.kind === "quiz-detail") {
    return renderPreviewShell({
      activeLabel: "Kuis",
      breadcrumbLabel: data.data?.title ?? "Kuis tidak ditemukan",
      children: data.data
        ? <AdminStudentPreviewQuizDetailSurface quiz={data.data} />
        : <AdminStudentPreviewUnavailable description="Kuis ini belum tersedia atau belum dipublikasikan." returnHref={buildAdminStudentPreviewRoute("/quiz")} returnLabel="Kembali ke Kuis" variant="resource" />,
      context: data.context,
    });
  }

  if (data.kind === "tryout-catalogue") {
    return renderPreviewShell({
      activeLabel: "Tryout",
      breadcrumbLabel: "Pratinjau Tryout",
      children: <AdminStudentPreviewTryoutCatalogueSurface banner={data.data.banner} bannerVariables={data.data.bannerVariables} tryouts={data.data.tryouts} />,
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
        : <AdminStudentPreviewUnavailable description="Tryout ini belum tersedia atau belum dipublikasikan." returnHref={buildAdminStudentPreviewRoute("/tryout")} returnLabel="Kembali ke Tryout" variant="resource" />,
      context: data.context,
    });
  }

  return renderPreviewShell({
    activeLabel: data.surface.activeLabel,
    breadcrumbLabel: data.surface.breadcrumbLabel,
    children: data.surface.title === "Pratinjau siswa"
        ? <AdminStudentPreviewUnavailable description="Pratinjau untuk halaman ini belum tersedia. Data belajar siswa tidak diubah." returnHref={buildAdminStudentPreviewRoute("/")} returnLabel="Kembali ke pratinjau beranda" variant="unsupported" />
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
  if (editBanners) {
    redirect(buildBannerMakerDestinationRoute(previewBannerDestination(slug)));
  }
  const bannerRequest = parseBannerPreviewRequest(resolvedSearchParams ?? {});
  let data: PreviewPageData;

  try {
    data = await resolvePreviewPageData(slug, bannerRequest);
  } catch (error) {
    if (isAdminStudentPreviewUnavailableError(error)) {
      return <AdminStudentPreviewUnavailable description={error.message} variant="context" />;
    }

    throw error;
  }

  return renderResolvedPreviewPage(data);
}
