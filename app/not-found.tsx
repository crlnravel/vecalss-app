import { TypedRouteState } from "@/components/ui/typed-route-state";

export default function NotFound() {
  return (
    <TypedRouteState
      description="Rute yang kamu cari tidak tersedia. Kembali ke beranda untuk memilih tujuan lain."
      kind="not-found"
      returnHref="/"
      returnLabel="Kembali ke beranda"
      title="Halaman tidak ditemukan"
    />
  );
}
