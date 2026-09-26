import type { Metadata } from "next";

import { requireStudentSession } from "@/lib/auth/access";
import { getStudentNotificationFeed } from "@/lib/notifications/service";
import { getStudentVideoGalleryItems } from "@/lib/video/repository";
import { VideoGalleryPageModule } from "@/modules/student/VideoGalleryPageModule";

export const metadata: Metadata = {
  title: "Galeri Video | Vecalss LMS",
  description: "Video pembelajaran pilihan Kapten untuk menemani perjalanan belajarmu.",
};

export default async function VideosPage() {
  const session = await requireStudentSession();
  const [notificationFeed, videos] = await Promise.all([
    getStudentNotificationFeed({ userId: session.user.id }),
    getStudentVideoGalleryItems(),
  ]);

  return <VideoGalleryPageModule notificationFeed={notificationFeed} session={session} videos={videos} />;
}
