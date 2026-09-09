import { TypedRouteState } from "@/components/ui/typed-route-state";

function BannerDestinationQueryError() {
  return (
    <TypedRouteState
      description="Pilih salah satu tujuan banner yang didukung, lalu buka kembali editor tanpa mengubah draf yang tersimpan."
      kind="error"
      returnHref="/admin/student-banners"
      returnLabel="Kembali ke Banner maker"
      title="Tujuan banner tidak dikenali"
    />
  );
}

export { BannerDestinationQueryError };
