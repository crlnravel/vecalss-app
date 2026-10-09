import type { Metadata } from "next";
import { notFound } from "next/navigation";

import { requireTutorSession } from "@/lib/auth/access";
import { getKaptenVideoById } from "@/lib/video/repository";
import { KaptenVideoEditorPageModule } from "@/modules/mentor/KaptenVideoEditorPageModule";

type MentorVideoEditorPageProps = {
  params: Promise<{
    videoId: string;
  }>;
};

const videoIdPattern =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export const metadata: Metadata = {
  title: "Edit Video Kapten | Vecalss LMS",
};

export default async function MentorVideoEditorPage({
  params,
}: MentorVideoEditorPageProps) {
  const [{ videoId: encodedVideoId }, session] = await Promise.all([
    params,
    requireTutorSession(),
  ]);

  let videoId: string;
  try {
    videoId = decodeURIComponent(encodedVideoId);
  } catch {
    notFound();
  }

  if (!videoIdPattern.test(videoId)) notFound();

  const video = await getKaptenVideoById(videoId, session.user.id);
  if (!video) notFound();

  return <KaptenVideoEditorPageModule initialVideo={video} session={session} />;
}
