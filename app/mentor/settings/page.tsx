import type { Metadata } from "next";

import { requireTutorSession } from "@/lib/auth/access";
import { KaptenSettingsPageModule } from "@/modules/mentor/KaptenContentPageModules";

export const metadata: Metadata = {
  title: "Pengaturan Kapten | Vecalss LMS",
};

export default async function MentorSettingsPage() {
  const session = await requireTutorSession();

  return <KaptenSettingsPageModule session={session} />;
}
