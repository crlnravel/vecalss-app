import { TypedRouteState } from "@/components/ui/typed-route-state";

export default function ArchivedTryoutPackagesNotFound() {
  return (
    <TypedRouteState
      context="Buat dan kelola Tryout langsung dari ruang Tryout Kapten."
      description="Paket Tryout adalah rute lama dan sudah dipensiunkan. Tautan lama ini tidak membuka atau mengubah paket apa pun."
      kind="archived"
      returnHref="/mentor/tryout"
      returnLabel="Kembali ke Tryout"
      title="Paket Tryout sudah dipensiunkan"
    />
  );
}
