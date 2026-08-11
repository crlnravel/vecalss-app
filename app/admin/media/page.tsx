import type { Metadata } from "next";

import { requireAdminSession } from "@/lib/auth/access";
import { MediaLibrary } from "@/modules/media/media-library";
import { PortalShell } from "@/modules/portal/components/portal-shell";

export const metadata: Metadata = {
  title: "Media | Vecalss LMS",
};

export default async function AdminMediaPage() {
  const session = await requireAdminSession();

  return (
    <PortalShell
      activeAdminSection="media"
      audience="admin"
      description="Manage admin assets separately from Kapten content media."
      session={session}
      title="Media"
    >
      <MediaLibrary scope="admin" />
    </PortalShell>
  );
}
