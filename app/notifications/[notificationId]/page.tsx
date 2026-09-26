import { redirect } from "next/navigation";

import { requireStudentSession } from "@/lib/auth/access";

export const dynamic = "force-dynamic";

export default async function NotificationDetailPage({
  params,
}: {
  params: Promise<{ notificationId: string }>;
}) {
  await requireStudentSession();
  const { notificationId } = await params;
  redirect(`/notifications?notification=${encodeURIComponent(notificationId)}`);
}
