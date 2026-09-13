import type { Metadata } from "next";

import { PackagePurchaseStatus, Prisma, RoleName } from "@/generated/prisma/client";
import { requireAdminSession } from "@/lib/auth/access";
import { prisma } from "@/lib/prisma";
import {
  AffiliatorPageModule,
  type AffiliatorDirectoryItem,
} from "@/modules/admin/AffiliatorPageModule";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Affiliator | Admin Vecalss",
};

const affiliatorSelect = {
  createdAt: true,
  email: true,
  fullName: true,
  id: true,
  affiliatorProfile: {
    select: {
      isActive: true,
      packagePurchases: {
        select: { id: true },
        where: { status: PackagePurchaseStatus.succeeded },
      },
      referralCode: true,
    },
  },
  status: true,
} satisfies Prisma.UserSelect;

export default async function AffiliatorsAdminPage() {
  const session = await requireAdminSession();
  const records = await prisma.user.findMany({
    orderBy: [{ fullName: "asc" }, { id: "asc" }],
    select: affiliatorSelect,
    where: {
      previewPurpose: null,
      roleAssignments: {
        some: {
          revokedAt: null,
          role: RoleName.affiliator,
        },
      },
      softDeletedAt: null,
    },
  });

  const affiliators: AffiliatorDirectoryItem[] = records.map((record) => ({
    createdAt: record.createdAt,
    email: record.email,
    fullName: record.fullName,
    id: record.id,
    packagePurchaseCount: record.affiliatorProfile?.packagePurchases.length ?? 0,
    referralCode: record.affiliatorProfile?.referralCode ?? null,
    referralCodeIsActive: record.status === "active" && (record.affiliatorProfile?.isActive ?? false),
    status: record.status,
  }));

  return <AffiliatorPageModule affiliators={affiliators} session={session} />;
}
