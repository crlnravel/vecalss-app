import { redirect } from "next/navigation";

import { buildAdminAiAliasTarget, type NavigationQueryValue } from "@/lib/navigation/canonical-context";

export const dynamic = "force-dynamic";

export default async function AdminAiUsagePage({
  searchParams,
}: {
  searchParams?: Promise<Record<string, NavigationQueryValue>>;
}) {
  redirect(buildAdminAiAliasTarget("usage", await searchParams));
}
