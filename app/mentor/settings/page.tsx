import type { Metadata } from "next";

import { requireTutorSession } from "@/lib/auth/access";
import { getKaptenSettings } from "@/modules/mentor/settings-actions";
import { KaptenSettingsPageModule } from "@/modules/mentor/KaptenSettingsPageModule";

export const metadata: Metadata = {
  title: "Pengaturan Kapten | Vecalss LMS",
};

export default async function MentorSettingsPage() {
  const session = await requireTutorSession();
  const settings = await getKaptenSettings();

  return <KaptenSettingsPageModule initialSettings={settings} session={session} />;
}
