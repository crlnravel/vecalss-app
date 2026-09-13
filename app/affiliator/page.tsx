import { requireAffiliatorSession } from "@/lib/auth/access";
import { redirect } from "next/navigation";

export const dynamic = "force-dynamic";

export default async function AffiliatorPage() {
  await requireAffiliatorSession();
  redirect("/affiliator/dashboard");
}
