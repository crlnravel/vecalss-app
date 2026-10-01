import { TypedRouteState } from "@/components/ui/typed-route-state";

export default function MentorNotFound() {
  return (
    <TypedRouteState
      className="workspace-page-canvas"
      description="Rute Kapten yang kamu cari tidak tersedia. Kembali ke ruang kerja untuk memilih tujuan lain."
      kind="not-found"
      returnHref="/mentor/tryout"
      returnLabel="Kembali ke ruang Kapten"
      title="Rute Kapten tidak ditemukan"
    />
  );
}
