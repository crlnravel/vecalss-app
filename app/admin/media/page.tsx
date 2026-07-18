import type { Metadata } from "next";

import { requireAdminSession } from "@/lib/auth/access";
import { MediaLibrary } from "@/modules/media/media-library";
import { PortalShell } from "@/modules/portal/components/portal-shell";

export const metadata: Metadata = {
  title: "Media Admin | Vecalss LMS",
};

export default async function AdminMediaPage() {
  const session = await requireAdminSession();

  return (
    <PortalShell
      activeAdminSection="media"
      audience="admin"
      description="Kelola gambar operasional admin dalam library yang terpisah dari aset Bank Soal Kapten."
      title="Media library"
      userLabel={session.user.fullName}
    >
      <MediaLibrary scope="admin" />
    </PortalShell>
  );
}
