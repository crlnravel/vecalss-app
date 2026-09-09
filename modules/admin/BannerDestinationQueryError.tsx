import { TypedRouteState } from "@/components/ui/typed-route-state";

function BannerDestinationQueryError({ mode = "invalid" }: { mode?: "invalid" | "safe-fallback" } = {}) {
  return (
    <TypedRouteState
      description={mode === "safe-fallback"
        ? "Editor banner tujuan sedang dalam mode aman sampai seluruh perlindungan writer dan drain cutover dikonfirmasi. Data banner lama tetap menjadi fallback."
        : "Pilih salah satu tujuan banner yang didukung, lalu buka kembali editor tanpa mengubah draf yang tersimpan."}
      kind="error"
      returnHref="/admin/student-banners"
      returnLabel="Kembali ke Banner maker"
      title={mode === "safe-fallback" ? "Banner maker sedang dalam mode aman" : "Tujuan banner tidak dikenali"}
    />
  );
}

export { BannerDestinationQueryError };
