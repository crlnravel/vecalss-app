import type { Metadata } from "next";

import { requireTutorSession } from "@/lib/auth/access";
import { MediaLibrary } from "@/modules/media/media-library";
import { MentorWorkspaceShell } from "@/modules/mentor/components/mentor-workspace-shell";

export const metadata: Metadata = {
  title: "Media Kapten | Vecalss LMS",
};

export default async function MentorMediaPage() {
  const session = await requireTutorSession();

  return (
    <MentorWorkspaceShell
      activeLabel="Media"
      breadcrumbLabel="Media"
      mainClassName="max-w-[1500px] gap-5 min-h-[calc(100svh-4rem)]"
      session={session}
      showSearch={false}
    >
      <MediaLibrary appearance="drive" scope="kapten" />
    </MentorWorkspaceShell>
  );
}
