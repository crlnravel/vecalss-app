import { EnrollmentHandoffStatus, Prisma, RoleName } from "@/generated/prisma/client";
import { requireAdminSession } from "@/lib/auth/access";
import { parseDirectoryParams } from "@/lib/admin/operations/validation";
import { prisma } from "@/lib/prisma";
import { KaptenPageModule } from "@/modules/admin/KaptenPageModule";

export default async function KaptenEnrollmentPage({
  searchParams,
}: {
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>;
}) {
  const session = await requireAdminSession();
  const params = await searchParams;
  const directory = parseDirectoryParams({
    focus: params.focus,
    page: params.page,
    q: params.q,
    status: params.status,
  });
  const { page, search, status } = directory;
  const pageSize = 20;
  const kaptenWhere: Prisma.UserWhereInput = {
    roleAssignments: {
      some: {
        revokedAt: null,
        role: RoleName.tutor,
      },
    },
    ...(status !== "all" ? { status } : {}),
    ...(search
      ? {
          OR: [
            { email: { contains: search, mode: "insensitive" } },
            { fullName: { contains: search, mode: "insensitive" } },
          ],
        }
      : {}),
    softDeletedAt: null,
    previewPurpose: null,
  };
  const [total, kapten] = await Promise.all([
    prisma.user.count({ where: kaptenWhere }),
    prisma.user.findMany({
      include: {
        enrollmentHandoffs: {
          orderBy: { createdAt: "desc" },
          select: {
            expiresAt: true,
            id: true,
            method: true,
            sourceImportRowId: true,
            status: true,
          },
          take: 1,
          where: {
            status: {
              in: [
                EnrollmentHandoffStatus.pending,
                EnrollmentHandoffStatus.released,
                EnrollmentHandoffStatus.expired,
              ],
            },
          },
        },
        tutorProfile: true,
      },
      orderBy: { fullName: "asc" },
      skip: (page - 1) * pageSize,
      take: pageSize,
      where: kaptenWhere,
    }),
  ]);

  return (
    <KaptenPageModule
      error={directory.invalid ? "invalid-directory-query" : typeof params.error === "string" ? params.error : null}
      focus={directory.focus}
      kapten={kapten}
      notice={typeof params.notice === "string" ? params.notice : null}
      page={page}
      pageCount={Math.max(1, Math.ceil(total / pageSize))}
      session={session}
      search={search}
      statusFilter={status}
      total={total}
    />
  );
}
