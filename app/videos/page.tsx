import type { Metadata } from "next";

import { requireStudentSession } from "@/lib/auth/access";
import { getStudentNotificationFeed } from "@/lib/notifications/service";
import { VideoGalleryPageModule } from "@/modules/student/VideoGalleryPageModule";

export const metadata: Metadata = {
  title: "Galeri Video | Vecalss LMS",
  description: "Video pembelajaran pilihan Kapten untuk menemani perjalanan belajarmu.",
};

export default async function VideosPage() {
  const session = await requireStudentSession();
  const notificationFeed = await getStudentNotificationFeed({ userId: session.user.id });

  return <VideoGalleryPageModule notificationFeed={notificationFeed} session={session} />;
}
