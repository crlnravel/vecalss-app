import { requireStudentSession } from "@/lib/auth/access";
import { TypedRouteState } from "@/components/ui/typed-route-state";
import { canonicalContextMessage, parseStudentTryoutContext, type NavigationQueryValue } from "@/lib/navigation/canonical-context";
import { ParticipantResultModule } from "@/modules/tryout/ParticipantResultModule";

export default async function TryoutResultPage({ params, searchParams }: { params: Promise<{ attemptId: string }>; searchParams: Promise<Record<string, NavigationQueryValue>> }) {
  const [{ attemptId }, query] = await Promise.all([params, searchParams, requireStudentSession()]);
  const parsed = parseStudentTryoutContext(query);
  if (parsed.issues.length) {
    return <TypedRouteState context="Pilih kembali sesi Tryout dari tautan yang masih berlaku." description={canonicalContextMessage(parsed.issues) ?? "Konteks hasil Tryout tidak tersedia."} kind="unavailable" returnHref={parsed.returnTo ?? "/tryout"} returnLabel="Kembali ke Tryout" title="Konteks hasil tidak tersedia" />;
  }
  return <ParticipantResultModule attemptId={attemptId} returnToHref={parsed.returnTo} sessionId={parsed.session} />;
}
