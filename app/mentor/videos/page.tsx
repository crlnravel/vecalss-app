import type { Metadata } from "next";

import { requireTutorSession } from "@/lib/auth/access";
import { getKaptenVideoGalleryItems } from "@/lib/video/repository";
import { KaptenVideoGalleryPageModule } from "@/modules/mentor/KaptenVideoGalleryPageModule";

export const metadata: Metadata = {
  title: "Video Kapten | Vecalss LMS",
  description: "Kelola video YouTube untuk koleksi belajar siswa.",
};

export default async function MentorVideosPage() {
  const session = await requireTutorSession();
  const videos = await getKaptenVideoGalleryItems(session.user.id);

  return <KaptenVideoGalleryPageModule session={session} videos={videos} />;
}
