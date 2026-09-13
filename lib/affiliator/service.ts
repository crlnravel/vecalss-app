import "server-only";

import {
  ContentStatus,
  PackagePurchaseStatus,
  RoleName,
  UserStatus,
} from "@/generated/prisma/client";
import type { Prisma } from "@/generated/prisma/client";
import { prisma } from "@/lib/prisma";
import {
  normalizeReferralCode,
  requirePurchaseText,
  requirePurchaseUuid,
} from "./contracts";

const CONVERSION_LOG_PAGE_SIZE = 50;
const MAX_CONVERSION_LOG_PAGE = 100_000;

type AffiliatorProfileView = {
  id: string;
  isActive: boolean;
  referralCode: string;
};

type AffiliatorConversionLog = {
  completedAt: Date;
  id: string;
  packageCode: string;
  packageName: string;
  referralCode: string | null;
  studentEmail: string;
  studentName: string;
};

type AffiliatorDashboardData = {
  conversionLog: AffiliatorConversionLog[];
  conversionLogPage: number;
  conversionLogPageCount: number;
  latestConversionAt: Date | null;
  profile: AffiliatorProfileView | null;
  successfulPurchaseCount: number;
  uniqueStudentCount: number;
};

const affiliatorProfileSelect = {
  id: true,
  isActive: true,
  referralCode: true,
} satisfies Prisma.AffiliatorProfileSelect;

const successfulPurchaseWhere = (affiliatorProfileId: string) => ({
  affiliatorProfileId,
  completedAt: { not: null },
  status: PackagePurchaseStatus.succeeded,
});

function normalizeConversionLogPage(value: number | undefined) {
  if (!Number.isFinite(value)) {
    return 1;
  }

  return Math.min(
    MAX_CONVERSION_LOG_PAGE,
    Math.max(1, Math.floor(value ?? 1)),
  );
}

async function resolvePublishedPackage(
  tx: Prisma.TransactionClient,
  packageCode: string,
) {
  const [reusablePackage, tryoutPackage] = await Promise.all([
    tx.reusableQuestionPackage.findFirst({
      select: { title: true },
      where: { code: packageCode, status: ContentStatus.published },
    }),
    tx.tryoutPackage.findFirst({
      select: { title: true },
      where: { code: packageCode, status: ContentStatus.published },
    }),
  ]);

  if (reusablePackage && tryoutPackage) {
    throw new Error("packageCode must identify exactly one published package.");
  }

  const packageRecord = reusablePackage ?? tryoutPackage;
  if (!packageRecord) {
    throw new Error("The package could not be found or is not published.");
  }

  return packageRecord.title;
}

async function assertActiveStudent(
  tx: Prisma.TransactionClient,
  studentId: string,
) {
  const student = await tx.user.findFirst({
    select: { id: true },
    where: {
      id: studentId,
      roleAssignments: {
        some: {
          revokedAt: null,
          role: RoleName.student,
        },
      },
      softDeletedAt: null,
      status: UserStatus.active,
    },
  });

  if (!student) {
    throw new Error("The purchase student must be an active student account.");
  }
}

/**
 * Reads only successful, attributed purchases for the signed-in affiliator.
 * Pending or failed checkout attempts never appear in the conversion log.
 */
async function getAffiliatorDashboard(
  userId: string,
  { conversionLogPage = 1 }: { conversionLogPage?: number } = {},
): Promise<AffiliatorDashboardData> {
  const profile = await prisma.affiliatorProfile.findUnique({
    select: affiliatorProfileSelect,
    where: { userId },
  });

  if (!profile) {
    return {
      conversionLog: [],
      conversionLogPage: 1,
      conversionLogPageCount: 1,
      latestConversionAt: null,
      profile: null,
      successfulPurchaseCount: 0,
      uniqueStudentCount: 0,
    };
  }

  const where = successfulPurchaseWhere(profile.id);
  const [successfulPurchaseCount, uniqueStudents, latestPurchase] = await Promise.all([
    prisma.packagePurchase.count({ where }),
    prisma.packagePurchase.findMany({
      distinct: ["studentId"],
      select: { studentId: true },
      where,
    }),
    prisma.packagePurchase.findFirst({
      orderBy: [{ completedAt: "desc" }, { createdAt: "desc" }, { id: "desc" }],
      select: { completedAt: true },
      where,
    }),
  ]);

  const conversionLogPageCount = Math.max(
    1,
    Math.ceil(successfulPurchaseCount / CONVERSION_LOG_PAGE_SIZE),
  );
  const page = Math.min(
    normalizeConversionLogPage(conversionLogPage),
    conversionLogPageCount,
  );
  const purchases = await prisma.packagePurchase.findMany({
    orderBy: [{ completedAt: "desc" }, { createdAt: "desc" }, { id: "desc" }],
    select: {
      completedAt: true,
      id: true,
      packageCode: true,
      packageName: true,
      referralCodeSnapshot: true,
      student: {
        select: {
          email: true,
          fullName: true,
        },
      },
    },
    skip: (page - 1) * CONVERSION_LOG_PAGE_SIZE,
    take: CONVERSION_LOG_PAGE_SIZE,
    where,
  });

  return {
    conversionLog: purchases.map((purchase) => ({
      // The database check constraint and the succeeded-event writer both
      // require this timestamp. Keep the non-null assertion local to this
      // projection instead of teaching the UI to guess a success time.
      completedAt: purchase.completedAt!,
      id: purchase.id,
      packageCode: purchase.packageCode,
      packageName: purchase.packageName,
      referralCode: purchase.referralCodeSnapshot,
      studentEmail: purchase.student.email,
      studentName: purchase.student.fullName,
    })),
    conversionLogPage: page,
    conversionLogPageCount,
    latestConversionAt: latestPurchase?.completedAt ?? null,
    profile,
    successfulPurchaseCount,
    uniqueStudentCount: uniqueStudents.length,
  };
}

type RecordSuccessfulPackagePurchaseInput = {
  completedAt?: Date;
  packageCode: string;
  providerReference: string;
  referralCode?: string | null;
  studentId: string;
};

/**
 * Records first-party purchase evidence at the point a signed checkout event
 * succeeds. The provider reference is mandatory and makes retries idempotent;
 * the package title, student role, and referral profile are resolved inside
 * the transaction so callers cannot invent identities or snapshots.
 */
async function recordSuccessfulPackagePurchase({
  completedAt,
  packageCode,
  providerReference,
  referralCode,
  studentId,
}: RecordSuccessfulPackagePurchaseInput) {
  const normalizedStudentId = requirePurchaseUuid(studentId, "studentId");
  const normalizedPackageCode = requirePurchaseText(packageCode, "packageCode", 80);
  const normalizedProviderReference = requirePurchaseText(providerReference, "providerReference", 160);
  const hasReferralCode = referralCode !== undefined && referralCode !== null;
  const normalizedReferralCode = hasReferralCode
    ? normalizeReferralCode(referralCode)
    : null;

  if (hasReferralCode && !normalizedReferralCode) {
    throw new Error("referralCode is invalid.");
  }

  const completionTimestamp = completedAt ?? new Date();
  if (!(completionTimestamp instanceof Date) || Number.isNaN(completionTimestamp.getTime())) {
    throw new Error("completedAt must be a valid date.");
  }

  return prisma.$transaction(async (tx) => {
    // Resolve an existing event before checking the mutable catalogue. This
    // keeps an archived package's retries idempotent without accepting a new
    // purchase for an unpublished package.
    const existingPurchase = await tx.packagePurchase.findUnique({
      select: {
        completedAt: true,
        id: true,
        packageCode: true,
        packageName: true,
        referralCodeSnapshot: true,
        status: true,
        studentId: true,
      },
      where: { providerReference: normalizedProviderReference },
    });

    if (existingPurchase) {
      if (
        existingPurchase.packageCode !== normalizedPackageCode
        || existingPurchase.studentId !== normalizedStudentId
        || (hasReferralCode && existingPurchase.referralCodeSnapshot !== normalizedReferralCode)
      ) {
        throw new Error("providerReference is already attached to another package purchase.");
      }

      if (existingPurchase.status === PackagePurchaseStatus.succeeded && existingPurchase.completedAt) {
        return existingPurchase;
      }

      await assertActiveStudent(tx, normalizedStudentId);

      return tx.packagePurchase.update({
        data: {
          completedAt: completionTimestamp,
          status: PackagePurchaseStatus.succeeded,
        },
        select: {
          completedAt: true,
          id: true,
          packageCode: true,
          packageName: true,
          status: true,
          studentId: true,
        },
        where: { id: existingPurchase.id },
      });
    }

    await assertActiveStudent(tx, normalizedStudentId);

    const packageName = await resolvePublishedPackage(tx, normalizedPackageCode);
    const affiliatorProfile = normalizedReferralCode
      ? await tx.affiliatorProfile.findFirst({
          select: affiliatorProfileSelect,
          where: {
            isActive: true,
            referralCode: normalizedReferralCode,
            user: {
              roleAssignments: {
                some: {
                  revokedAt: null,
                  role: RoleName.affiliator,
                },
              },
              softDeletedAt: null,
              status: UserStatus.active,
            },
          },
        })
      : null;

    if (normalizedReferralCode && !affiliatorProfile) {
      throw new Error("referralCode is not active.");
    }

    const [purchase] = await tx.$queryRaw<Array<{
      completedAt: Date | null;
      id: string;
      packageCode: string;
      packageName: string;
      referralCodeSnapshot: string | null;
      status: PackagePurchaseStatus;
      studentId: string;
    }>>`
      INSERT INTO package_purchases (
        affiliator_profile_id,
        completed_at,
        package_code,
        package_name,
        provider_reference,
        referral_code_snapshot,
        status,
        student_id
      )
      VALUES (
        ${affiliatorProfile?.id ?? null}::uuid,
        ${completionTimestamp},
        ${normalizedPackageCode},
        ${packageName},
        ${normalizedProviderReference},
        ${affiliatorProfile?.referralCode ?? null},
        'succeeded'::package_purchase_status,
        ${normalizedStudentId}::uuid
      )
      ON CONFLICT (provider_reference)
      DO UPDATE SET
        completed_at = COALESCE(package_purchases.completed_at, EXCLUDED.completed_at),
        status = 'succeeded'::package_purchase_status,
        updated_at = NOW()
      RETURNING
        completed_at AS "completedAt",
        id,
        package_code AS "packageCode",
        package_name AS "packageName",
        referral_code_snapshot AS "referralCodeSnapshot",
        status,
        student_id AS "studentId"
    `;

    if (!purchase) {
      throw new Error("The package purchase could not be recorded.");
    }

    if (
      purchase.packageCode !== normalizedPackageCode
      || purchase.studentId !== normalizedStudentId
      || (hasReferralCode && purchase.referralCodeSnapshot !== normalizedReferralCode)
    ) {
      throw new Error("providerReference is already attached to another package purchase.");
    }

    return purchase;
  });
}

export {
  getAffiliatorDashboard,
  recordSuccessfulPackagePurchase,
};
export type {
  AffiliatorConversionLog,
  AffiliatorDashboardData,
  AffiliatorProfileView,
  RecordSuccessfulPackagePurchaseInput,
};
