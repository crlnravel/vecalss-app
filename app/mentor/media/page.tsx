import type { Metadata } from "next";

import { requireTutorSession } from "@/lib/auth/access";
import { KaptenMediaPageModule } from "@/modules/mentor/KaptenContentPageModules";

export const metadata: Metadata = {
  title: "Media Kapten | Vecalss LMS",
};

export default async function MentorMediaPage() {
  const session = await requireTutorSession();

  return <KaptenMediaPageModule session={session} />;
}
