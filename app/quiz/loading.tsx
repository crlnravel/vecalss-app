import { TypedRouteState } from "@/components/ui/typed-route-state";

export default function QuizLoading() {
  return (
    <TypedRouteState
      description="Menyiapkan katalog dan aktivitas Kuis untukmu."
      kind="loading"
      title="Memuat Kuis"
    />
  );
}
