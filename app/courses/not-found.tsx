import { TypedRouteState } from "@/components/ui/typed-route-state";

export default function CoursesNotFound() {
  return (
    <TypedRouteState
      className="student-page-canvas"
      description="Materi yang kamu cari tidak tersedia atau sudah tidak dipublikasikan. Kembali ke katalog untuk memilih materi lain."
      kind="not-found"
      returnHref="/courses"
      returnLabel="Kembali ke Materi"
      title="Materi tidak ditemukan"
    />
  );
}
