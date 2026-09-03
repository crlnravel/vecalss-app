import { TypedRouteState } from "@/components/ui/typed-route-state";

export default function MentorLoading() {
  return (
    <TypedRouteState
      description="Menyiapkan ruang kerja Kapten dan data pengelolaanmu."
      kind="loading"
      title="Memuat ruang Kapten"
    />
  );
}
