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
      mainClassName="max-w-[1500px] gap-7"
      searchPlaceholder="Cari gambar Bank Soal..."
      session={session}
    >
      <section className="flex flex-col gap-2">
        <h1 className="text-3xl leading-tight font-semibold text-secondary-900 md:text-4xl">
          Media
        </h1>
        <p className="max-w-2xl text-sm leading-6 text-secondary-500">
          Library gambar bersama untuk Bank Soal Kapten.
        </p>
      </section>
      <MediaLibrary scope="kapten" />
    </MentorWorkspaceShell>
  );
}
