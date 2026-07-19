import type { Metadata } from "next";

import { requireTutorSession } from "@/lib/auth/access";
import { KaptenTryoutPageModule } from "@/modules/mentor/KaptenTryoutModules";

export const metadata: Metadata = {
  title: "Tryout Kapten | Vecalss LMS",
};

export default async function MentorTryoutPage() {
  const session = await requireTutorSession();

  return <KaptenTryoutPageModule session={session} />;
}
