import { TypedRouteState } from "@/components/ui/typed-route-state";

export default function TryoutNotFound() {
  return (
    <TypedRouteState
      description="Tryout yang kamu cari tidak tersedia atau sudah tidak dipublikasikan. Kembali ke katalog untuk memilih Tryout lain."
      kind="not-found"
      returnHref="/tryout"
      returnLabel="Kembali ke Tryout"
      title="Tryout tidak ditemukan"
    />
  );
}
