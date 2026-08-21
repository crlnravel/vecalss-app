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
  getAdminPreviewMateriCatalogueSurface,
  getAdminPreviewMateriCourse,
  getAdminPreviewMateriLesson,
} from "@/lib/admin/student-preview-reads";
import {
  isAdminStudentPreviewUnavailableError,
  type AdminStudentPreviewContext,
} from "@/lib/admin/student-preview";
import { buildAdminStudentPreviewRoute } from "@/lib/student/preview-routes";
import { AdminStudentPreviewShell } from "@/modules/student/components/admin-student-preview-shell";
import {
  AdminStudentPreviewBerandaSurface,
  AdminStudentPreviewMateriCatalogueSurface,
  AdminStudentPreviewMateriCourseSurface,
  AdminStudentPreviewMateriLessonSurface,
} from "@/modules/student/components/admin-student-preview-surfaces";

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
    description: "Katalog Kuis akan tersedia di surface preview berikutnya.",
    title: "Kuis siswa",
  },
  tryout: {
    activeLabel: "Tryout",
    breadcrumbLabel: "Tryout preview",
    description: "Katalog Tryout akan tersedia di surface preview berikutnya.",
    title: "Tryout siswa",
  },
};

function PreviewUnavailable({ message }: { message: string }) {
  return (
    <main className="grid min-h-svh place-items-center bg-secondary-50 px-4 py-10 text-secondary-900">
      <Card className="w-full max-w-xl border-primary-100 bg-white shadow-[0_24px_70px_-44px_rgba(1,76,56,0.42)]">
        <CardHeader>
          <CardTitle>Student preview unavailable</CardTitle>
          <CardDescription>{message}</CardDescription>
        </CardHeader>
        <CardContent>
          <p className="text-sm leading-6 text-secondary-600">
            No preview student data was loaded. Ask an operations owner to repair the managed fixture or enable the capability.
          </p>
          <Button className="mt-5" nativeButton={false} render={<Link href="/admin" />} variant="brandOutline">
            Kembali ke admin
          </Button>
        </CardContent>
      </Card>
    </main>
  );
}

function PreviewPlaceholder({
  context,
  surface,
}: {
  context: AdminStudentPreviewContext;
  surface: PreviewSurface;
}) {
  const links = [
    ["Beranda", buildAdminStudentPreviewRoute("/")],
    ["Materi", buildAdminStudentPreviewRoute("/courses")],
    ["Kuis", buildAdminStudentPreviewRoute("/quiz")],
    ["Tryout", buildAdminStudentPreviewRoute("/tryout")],
  ] as const;

  return (
    <section className="grid gap-6">
      <Card className="border-primary-100 bg-white shadow-[0_24px_70px_-50px_rgba(1,76,56,0.42)]">
        <CardHeader>
          <p className="text-xs font-bold tracking-[0.16em] text-primary-700 uppercase">Admin-only surface</p>
          <CardTitle>{surface.title}</CardTitle>
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
            <Button key={href} nativeButton={false} render={<Link href={href} />} variant={label === surface.activeLabel ? "brand" : "brandOutline"}>
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
  breadcrumbLabel,
  children,
  context,
  activeLabel,
}: {
  activeLabel: PreviewSurface["activeLabel"];
  breadcrumbLabel: string;
  children: React.ReactNode;
  context: AdminStudentPreviewContext;
}) {
  return (
    <AdminStudentPreviewShell
      activeLabel={activeLabel}
      breadcrumbLabel={breadcrumbLabel}
      context={context}
    >
      {children}
    </AdminStudentPreviewShell>
  );
}

type PreviewPageData =
  | { kind: "beranda"; context: AdminStudentPreviewContext; data: Awaited<ReturnType<typeof getAdminPreviewBeranda>>["data"] }
  | { kind: "courses"; context: AdminStudentPreviewContext; data: Awaited<ReturnType<typeof getAdminPreviewMateriCatalogueSurface>>["data"] }
  | { kind: "course"; context: AdminStudentPreviewContext; data: Awaited<ReturnType<typeof getAdminPreviewMateriCourse>>["data"] }
  | { kind: "lesson"; context: AdminStudentPreviewContext; data: Awaited<ReturnType<typeof getAdminPreviewMateriLesson>>["data"] }
  | { kind: "placeholder"; context: AdminStudentPreviewContext; surface: PreviewSurface };

async function resolvePreviewPageData(slug: string[]): Promise<PreviewPageData> {
  const key = slug.join("/");

  if (key === "") {
    const result = await getAdminPreviewBeranda();
    return { context: result.context, data: result.data, kind: "beranda" };
  }

  if (key === "courses") {
    const catalogue = await getAdminPreviewMateriCatalogueSurface();
    return {
      context: catalogue.context,
      data: catalogue.data,
      kind: "courses",
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
    return renderPreviewShell({
      activeLabel: "Beranda",
      breadcrumbLabel: "Beranda preview",
      children: <AdminStudentPreviewBerandaSurface data={data.data} />,
      context: data.context,
    });
  }

  if (data.kind === "courses") {
    return renderPreviewShell({
      activeLabel: "Materi",
      breadcrumbLabel: "Materi preview",
      children: <AdminStudentPreviewMateriCatalogueSurface banner={data.data.banner} courses={data.data.courses} />,
      context: data.context,
    });
  }

  if (data.kind === "course") {
    return renderPreviewShell({
      activeLabel: "Materi",
      breadcrumbLabel: data.data?.name ?? "Materi tidak ditemukan",
      children: data.data
        ? <AdminStudentPreviewMateriCourseSurface course={data.data} />
        : <PreviewUnavailable message="Materi yang diminta tidak tersedia atau belum published." />,
      context: data.context,
    });
  }

  if (data.kind === "lesson") {
    return renderPreviewShell({
      activeLabel: "Materi",
      breadcrumbLabel: data.data.lesson?.title ?? "Materi tidak ditemukan",
      children: data.data.course && data.data.lesson
        ? <AdminStudentPreviewMateriLessonSurface course={data.data.course} lesson={data.data.lesson} />
        : <PreviewUnavailable message="Lesson yang diminta tidak tersedia atau belum published." />,
      context: data.context,
    });
  }

  return renderPreviewShell({
    activeLabel: data.surface.activeLabel,
    breadcrumbLabel: data.surface.breadcrumbLabel,
    children: data.surface.title === "Student preview"
      ? <PreviewUnavailable message="This student preview surface is not supported yet." />
      : <PreviewPlaceholder context={data.context} surface={data.surface} />,
    context: data.context,
  });
}

export default async function AdminStudentPreviewPage({
  params,
}: {
  params: Promise<{ slug?: string[] }>;
}) {
  const { slug = [] } = await params;
  let data: PreviewPageData;

  try {
    data = await resolvePreviewPageData(slug);
  } catch (error) {
    if (isAdminStudentPreviewUnavailableError(error)) {
      return <PreviewUnavailable message={error.message} />;
    }

    throw error;
  }

  return renderResolvedPreviewPage(data);
}
