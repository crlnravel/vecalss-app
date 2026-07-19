import type { Metadata } from "next";

import { requireTutorSession } from "@/lib/auth/access";
import { KaptenTryoutBuilderPageModule } from "@/modules/mentor/KaptenTryoutModules";

export const metadata: Metadata = { title: "Buat Tryout Kapten | Vecalss LMS" };

export default async function CreateTryoutPage() {
  const session = await requireTutorSession();
  return <KaptenTryoutBuilderPageModule session={session} />;
}
