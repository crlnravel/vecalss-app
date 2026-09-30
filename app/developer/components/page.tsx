import type { Metadata } from "next";

import { ReferenceDashboardComponentPreview } from "@/components/dashboard/reference-dashboard-preview";
import { requireDeveloperSession } from "@/lib/auth/access";
import { DeveloperComponentsPageModule } from "@/modules/developer/DeveloperComponentsPageModule";
import { SidebarVariantPreview } from "@/modules/developer/components/catalogue-sidebar-preview";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Komponen | Vecalss LMS",
};

export default async function DeveloperComponentsPage({ searchParams }: {
  searchParams: Promise<{ preview?: string | string[] }>;
}) {
  const session = await requireDeveloperSession();
  const { preview } = await searchParams;

  if (preview === "dashboard") return <ReferenceDashboardComponentPreview />;
  if (preview === "sidebar") return <SidebarVariantPreview />;

  return (
    <DeveloperComponentsPageModule
      accountUser={{ id: session.user.id, email: session.user.email, fullName: session.user.fullName }}
    />
  );
}
