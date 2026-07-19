import type { Metadata } from "next";

import { requireTutorSession } from "@/lib/auth/access";
import { listTryouts } from "@/lib/tryout/repository";
import { KaptenTryoutPageModule } from "@/modules/mentor/KaptenTryoutModules";

export const metadata: Metadata = {
  title: "Tryout Kapten | Vecalss LMS",
};

export default async function MentorTryoutPage() {
  const session = await requireTutorSession();
  const initialItems = await listTryouts(session.user.id);

  return <KaptenTryoutPageModule initialItems={initialItems} session={session} />;
}
