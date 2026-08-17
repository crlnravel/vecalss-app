import type { Metadata } from "next";

import { requireAdminSession } from "@/lib/auth/access";
import { AdminDocumentationPageModule } from "@/modules/admin/AdminDocumentationPageModule";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Administrator documentation | Vecalss LMS",
};

export default async function AdminDocumentationPage() {
  const session = await requireAdminSession();

  return <AdminDocumentationPageModule session={session} />;
}
