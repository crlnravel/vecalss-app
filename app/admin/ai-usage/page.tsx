import type { Metadata } from "next";

import { requireAdminSession } from "@/lib/auth/access";
import { AiUsagePageModule } from "@/modules/admin/AiUsagePageModule";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "AI usage | Vecalss LMS",
};

export default async function AdminAiUsagePage() {
  const session = await requireAdminSession();

  return <AiUsagePageModule session={session} />;
}
