import { TypedRouteState } from "@/components/ui/typed-route-state";

export default function ArchivedPackagesNotFound() {
  return (
    <TypedRouteState
      context="Gunakan Bank Soal untuk menyusun sumber pertanyaan, lalu kelola Tryout langsung dari ruang Tryout."
      description="Paket Soal adalah rute lama dan sudah dipensiunkan. Alur paket tidak dipulihkan atau dijalankan kembali dari tautan lama."
      kind="archived"
      returnHref="/mentor/quiz/question-bank"
      returnLabel="Kembali ke Bank Soal"
      title="Paket Soal sudah dipensiunkan"
    />
  );
}
