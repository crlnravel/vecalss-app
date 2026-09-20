import { Button } from "@/components/ui/button";
import { TypedRouteState } from "@/components/ui/typed-route-state";
import { LayoutDashboard } from "@/lib/icons";
import { getDefaultHomePath } from "@/lib/auth/paths";
import { getReadOnlySessionContext } from "@/lib/auth/session";
import Link from "next/link";

export default async function NotFound() {
  const session = await getReadOnlySessionContext();
  const dashboardHref = session ? getDefaultHomePath(session.user) : null;

  return (
    <TypedRouteState
      additionalActions={dashboardHref && dashboardHref !== "/login" ? (
        <Button nativeButton={false} render={<Link href={dashboardHref} />} variant="brand">
          <LayoutDashboard aria-hidden="true" />
          Kembali ke dashboard
        </Button>
      ) : null}
      description="Rute yang kamu cari tidak tersedia. Kembali ke beranda untuk memilih tujuan lain."
      kind="not-found"
      returnHref="/"
      returnLabel="Kembali ke beranda"
      title="Halaman tidak ditemukan"
    />
  );
}
